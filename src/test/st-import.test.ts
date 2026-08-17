/**
 * 首次接入 ST（2.0 阶段7.3）：扫描 + 勾选导入 纯函数层测试。
 * ST 侧 = memFs 种的假 ST 树；STE 库侧 = createVault(memFs) 设为激活库，
 * 走 archive-db/worldbook-db 的真实保存入口，直接对文件库落盘结果断言。
 */
import { afterEach, describe, expect, it } from 'vitest';
import { createMemFs } from '@/lib/vault/fs';
import { createVault } from '@/lib/vault/vault-backend';
import { setActiveVault } from '@/lib/vault/active';
import { scanSTUserDir, importSelected, type STScanResult } from '@/lib/vault/st-import';
import { getAllArchiveStories, getAllCharacters, saveCharacter } from '@/lib/archive-db';
import { getAllWorldBooks, saveWorldBook } from '@/lib/worldbook-db';
import { getAllPresets } from '@/lib/preset-db';
import { getAllRegexCollections } from '@/lib/regex-db';

afterEach(() => setActiveVault(null));

// ---------- 假 ST 树构造 ----------

/** 手搓最小合法 PNG：签名 + tEXt(chara=base64卡JSON) + IEND；CRC 填零（解析器不校验） */
function makeCardPngBase64(card: Record<string, unknown>): string {
  const latin1 = (s: string) => Uint8Array.from(s, (ch) => ch.charCodeAt(0) & 0xff);
  const chunk = (type: string, data: Uint8Array) => {
    const out = new Uint8Array(12 + data.length);
    new DataView(out.buffer).setUint32(0, data.length);
    out.set(latin1(type), 4);
    out.set(data, 8);
    return out; // 末尾 4 字节 CRC 留零
  };
  const payload = btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(card))));
  const text = chunk('tEXt', latin1('chara\0' + payload));
  const end = chunk('IEND', new Uint8Array(0));
  const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, ...text, ...end]);
  return btoa(String.fromCharCode(...png));
}

/** 一条最小合法聊天 JSONL：首行元数据 + n 条消息 */
function makeJsonl(charName: string, n = 2): string {
  const lines = [JSON.stringify({ user_name: '我', character_name: charName })];
  for (let i = 0; i < n; i++) {
    lines.push(JSON.stringify({ name: i % 2 ? charName : '我', is_user: i % 2 === 0, send_date: i + 1, mes: `第${i}楼` }));
  }
  return lines.join('\n');
}

function makeJsonlWithWorldbook(charName: string, worldbook: string): string {
  const lines = [JSON.stringify({
    user_name: '我',
    character_name: charName,
    chat_metadata: { world_info: worldbook },
  })];
  lines.push(JSON.stringify({ name: '我', is_user: true, send_date: 1, mes: '开始' }));
  return lines.join('\n');
}

const wbJson = JSON.stringify({ name: '魔法界', entries: { '0': { uid: 0, key: ['魔杖'], content: '设定正文', comment: '条目' } } });
const presetJson = JSON.stringify({
  prompts: [{ identifier: 'main', name: '主提示', role: 'system', content: '你是解说员' }],
  prompt_order: [{ character_id: 100001, order: [{ identifier: 'main', enabled: true }] }],
  temperature: 0.7,
});
const settingsJson = JSON.stringify({
  extensions: { regex: [{ scriptName: '去横线', findRegex: '/---/g', replaceString: '', placement: [2], disabled: false }] },
});

/** 在 fs 的 base 前缀下种一棵标准 ST 用户目录树 */
async function seedSTTree(fs: ReturnType<typeof createMemFs>, base = ''): Promise<void> {
  const p = (rel: string) => (base ? `${base}/${rel}` : rel);
  await fs.writeBinary(p('characters/赫敏.png'), makeCardPngBase64({ spec: 'chara_card_v2', data: { name: '赫敏', creator_notes: '一句话介绍\n第二行' } }));
  await fs.writeBinary(p('characters/坏卡.png'), btoa('not a png'));
  await fs.writeText(p('chats/赫敏/主线.jsonl'), makeJsonl('赫敏', 3));
  await fs.writeText(p('chats/赫敏/支线.jsonl'), makeJsonl('赫敏', 2));
  await fs.writeText(p('chats/已删角色/遗留聊天.jsonl'), makeJsonl('已删角色', 2));
  await fs.writeText(p('chats/坏卡/坏卡的聊天.jsonl'), makeJsonl('坏卡', 2));
  await fs.writeText(p('worlds/魔法界.json'), wbJson);
  await fs.writeText(p('OpenAI Settings/我的预设.json'), presetJson);
  await fs.writeText(p('settings.json'), settingsJson);
  // 干扰项：非目标扩展名/子目录，不应入清单
  await fs.writeText(p('characters/说明.txt'), '忽略我');
  await fs.writeText(p('worlds/备份.bak'), '忽略我');
}

function selectAll(scan: STScanResult, stRoot = 'C:/ST') {
  return {
    stRoot,
    characters: scan.characters,
    strayChats: scan.strayChats,
    worldbooks: scan.worldbooks,
    presets: scan.presets,
    regex: scan.regex,
    archives: scan.archives,
    relationships: scan.relationships,
    scanWarnings: scan.warnings,
  };
}

// ---------- 扫描 ----------

describe('scanSTUserDir', () => {
  it('标准用户目录：角色归组聊天、散聊天单列、世界书带体积', async () => {
    const st = createMemFs();
    await seedSTTree(st);
    const r = await scanSTUserDir(st);
    expect(r.userDir).toBe('');
    expect(r.characters.map((c) => c.name)).toEqual(['坏卡', '赫敏']);
    const hermione = r.characters.find((c) => c.name === '赫敏')!;
    expect(hermione.pngPath).toBe('characters/赫敏.png');
    expect(hermione.chats.map((c) => c.name)).toEqual(['主线', '支线']);
    expect(hermione.chatBytes).toBe(hermione.chats.reduce((s, c) => s + c.size, 0));
    expect(hermione.chatBytes).toBeGreaterThan(0);
    // 无对应卡的聊天分组 → 散聊天
    expect(r.strayChats.map((c) => c.path)).toEqual(['chats/已删角色/遗留聊天.jsonl']);
    expect(r.strayChats[0].characterDir).toBe('已删角色');
    expect(r.worldbooks).toEqual([{ name: '魔法界', path: 'worlds/魔法界.json', size: wbJson.length }]);
    expect(r.presets).toEqual([{ name: '我的预设', path: 'OpenAI Settings/我的预设.json', size: presetJson.length }]);
    expect(r.regex).toEqual({ path: 'settings.json', count: 1 });
  });

  it('选中 ST 安装根目录（含 data/default-user）时自动下钻，路径带前缀', async () => {
    const st = createMemFs();
    await seedSTTree(st, 'data/default-user');
    await st.writeText('package.json', '{}'); // 安装根的干扰文件
    const r = await scanSTUserDir(st);
    expect(r.userDir).toBe('data/default-user');
    expect(r.characters.find((c) => c.name === '赫敏')!.pngPath).toBe('data/default-user/characters/赫敏.png');
    expect(r.worldbooks[0].path).toBe('data/default-user/worlds/魔法界.json');
    expect(r.presets[0].path).toBe('data/default-user/OpenAI Settings/我的预设.json');
    expect(r.regex).toEqual({ path: 'data/default-user/settings.json', count: 1 });
  });

  it('安装根同时含 extensions/assets 时仍优先扫描 data/default-user', async () => {
    const st = createMemFs();
    await seedSTTree(st, 'data/default-user');
    await st.writeText('extensions/third-party/index.js', 'export default {};');
    await st.writeText('assets/emotes/sample.png', 'asset');

    const r = await scanSTUserDir(st);

    expect(r.userDir).toBe('data/default-user');
    expect(r.characters.map((character) => character.name)).toContain('赫敏');
    expect(r.archives.map((group) => group.kind)).toEqual([]);
  });

  it('安装根只有 data/default-user/settings.json 时仍扫描用户配置', async () => {
    const st = createMemFs();
    await st.writeText('data/default-user/settings.json', settingsJson);
    await st.writeText('package.json', '{}');

    const r = await scanSTUserDir(st);

    expect(r.userDir).toBe('data/default-user');
    expect(r.regex).toEqual({ path: 'data/default-user/settings.json', count: 1 });
  });

  it('目录缺失 = 空组不抛错（空目录/只有部分子目录）', async () => {
    const empty = await scanSTUserDir(createMemFs());
    expect(empty).toEqual({
      userDir: '',
      characters: [],
      strayChats: [],
      worldbooks: [],
      presets: [],
      regex: null,
      archives: [],
      relationships: { status: 'missing', globalWorldbooks: [], characterWorldbooks: [] },
      warnings: [],
    });

    const partial = createMemFs();
    await partial.writeText('worlds/仅世界书.json', wbJson); // 没有 characters/ chats/
    const r = await scanSTUserDir(partial);
    expect(r.characters).toEqual([]);
    expect(r.strayChats).toEqual([]);
    expect(r.worldbooks).toHaveLength(1);
  });

  it('递归盘点 extensions / assets，并读取 settings.json 的世界书关系', async () => {
    const st = createMemFs();
    await st.writeBinary('extensions/third-party/表情扩展/index.js', btoa('console.log("plugin")'));
    await st.writeBinary('extensions/third-party/表情扩展/data/config.json', btoa('{"enabled":true}'));
    await st.writeBinary('assets/emotes/开心.png', 'aW1hZ2U=');
    await st.writeText('settings.json', JSON.stringify({
      world_info_settings: {
        world_info: {
          globalSelect: ['全局设定'],
          charLore: [{ name: '赫敏.png', extraBooks: ['魔法补充', '未找到的书'] }],
        },
      },
    }));

    const scan = await scanSTUserDir(st);
    expect(scan.archives.map((group) => ({
      kind: group.kind,
      files: group.files.map((file) => file.relativePath),
    }))).toEqual([
      { kind: 'extensions', files: ['third-party/表情扩展/data/config.json', 'third-party/表情扩展/index.js'] },
      { kind: 'assets', files: ['emotes/开心.png'] },
    ]);
    expect(scan.relationships).toEqual({
      status: 'parsed',
      settingsPath: 'settings.json',
      globalWorldbooks: ['全局设定'],
      characterWorldbooks: [{ characterFile: '赫敏.png', worldbooks: ['魔法补充', '未找到的书'] }],
    });
  });

  it('按用户可理解的类别识别 ST 1.18 扩展、人设、快速回复和媒体，并排除密钥与缓存', async () => {
    const st = createMemFs();
    await st.writeText('extensions/st-stage/index.js', 'stage');
    await st.writeText('extensions/ST-summary/index.js', 'summary');
    await st.writeBinary('assets/角色A/开心.png', 'aW1hZ2U=');
    await st.writeText('QuickReplies/Default.json', JSON.stringify({
      version: 2,
      name: 'Default',
      qrList: [{ id: 1 }, { id: 2 }],
    }));
    await st.writeText('QuickReplies/日常.json', JSON.stringify({
      version: 2,
      name: '日常',
      qrList: [{ id: 1 }],
    }));
    await st.writeBinary('User Avatars/me.png', 'YXZhdGFy');
    await st.writeBinary('User Avatars/demo.png', 'YXZhdGFy');
    await st.writeBinary('backgrounds/room.jpg', 'YmFja2dyb3VuZA==');
    await st.writeText('themes/cream.json', '{}');
    await st.writeText('movingUI/desktop.json', '{}');
    await st.writeBinary('user/images/upload.png', 'aW1hZ2U=');
    await st.writeText('user/files/notes.txt', 'notes');
    await st.writeText('user/workflows/demo.json', '{}');
    await st.writeText('settings.json', JSON.stringify({
      power_user: {
        personas: { 'me.png': '我的人设', 'demo.png': '演示人设' },
        persona_descriptions: {
          'me.png': { description: '第一人设', position: 0, depth: 2, role: 0, lorebook: '我的世界书' },
          'demo.png': { description: '演示人设', position: 0, depth: 2, role: 0 },
        },
        default_persona: 'me.png',
        persona_sort_order: ['me.png', 'demo.png'],
      },
    }));
    await st.writeText('secrets.json', '{"apiKey":"never archive"}');
    await st.writeText('backups/settings.json', '{}');
    await st.writeBinary('thumbnails/persona/me.png', 'dGh1bWI=');
    await st.writeText('vectors/index.json', '{}');

    const scan = await scanSTUserDir(st);
    expect(scan.archives.map((group) => ({
      kind: group.kind,
      label: group.label,
      itemCount: group.itemCount,
      files: group.files.map((file) => file.relativePath),
      generated: group.generatedFiles?.map((file) => file.relativePath) ?? [],
    }))).toEqual([
      {
        kind: 'extensions', label: '第三方扩展', itemCount: 2,
        files: ['ST-summary/index.js', 'st-stage/index.js'], generated: [],
      },
      {
        kind: 'assets', label: '扩展资产', itemCount: 1,
        files: ['角色A/开心.png'], generated: [],
      },
      {
        kind: 'quick-replies', label: '快速回复', itemCount: 2,
        files: ['Default.json', '日常.json'], generated: [],
      },
      {
        kind: 'personas', label: '用户人设', itemCount: 2,
        files: ['avatars/demo.png', 'avatars/me.png'], generated: ['personas.json'],
      },
      {
        kind: 'backgrounds', label: '聊天背景', itemCount: 1,
        files: ['room.jpg'], generated: [],
      },
      {
        kind: 'appearance', label: '主题与界面布局', itemCount: 2,
        files: ['movingUI/desktop.json', 'themes/cream.json'], generated: [],
      },
      {
        kind: 'user-media', label: '用户媒体与工作流', itemCount: 3,
        files: ['files/notes.txt', 'images/upload.png', 'workflows/demo.json'], generated: [],
      },
    ]);

    const personaGroup = scan.archives.find((group) => group.kind === 'personas')!;
    expect(JSON.parse(personaGroup.generatedFiles![0].text)).toEqual({
      version: 1,
      personas: { 'me.png': '我的人设', 'demo.png': '演示人设' },
      personaDescriptions: {
        'me.png': { description: '第一人设', position: 0, depth: 2, role: 0, lorebook: '我的世界书' },
        'demo.png': { description: '演示人设', position: 0, depth: 2, role: 0 },
      },
      defaultPersona: 'me.png',
      personaSortOrder: ['me.png', 'demo.png'],
    });
    expect(JSON.stringify(scan.archives)).not.toMatch(/secrets|backups|thumbnails|vectors|apiKey/);
  });
});

// ---------- 导入 ----------

function setupVault() {
  const vaultFs = createMemFs();
  setActiveVault(createVault(vaultFs));
  return vaultFs;
}

describe('importSelected', () => {
  it('把世界书和预设的源文件修改时间从扫描结果保存到资产记录', async () => {
    const st = createMemFs();
    await seedSTTree(st);
    const list = st.list.bind(st);
    st.list = async (dir) => (await list(dir)).map((entry) => {
      if (entry.name === '魔法界.json') return { ...entry, modifiedAt: 1_725_000_000_123 };
      if (entry.name === '我的预设.json') return { ...entry, modifiedAt: 1_725_000_100_456 };
      return entry;
    });
    setupVault();

    const scan = await scanSTUserDir(st);
    expect(scan.worldbooks[0].modifiedAt).toBe(1_725_000_000_123);
    expect(scan.presets[0].modifiedAt).toBe(1_725_000_100_456);

    await importSelected(st, selectAll(scan));
    expect((await getAllWorldBooks())[0].sourceModifiedAt).toBe(1_725_000_000_123);
    expect((await getAllPresets())[0].sourceModifiedAt).toBe(1_725_000_100_456);
  });

  it('全选导入：卡建角色并记 sourcePath，聊天绑定落角色文件夹，散聊天进临时，世界书入库', async () => {
    const st = createMemFs();
    await seedSTTree(st);
    const vaultFs = setupVault();
    const scan = await scanSTUserDir(st);
    const summary = await importSelected(st, selectAll(scan));

    // 坏卡.png 解析失败计 failed=1，其聊天降级为未绑定照常导入
    expect(summary).toMatchObject({
      characters: 1,
      stories: 4,
      worldbooks: 1,
      presets: 1,
      regexes: 1,
      skipped: 0,
      failed: 1,
      relationships: 0,
      archivedFiles: 0,
    });

    const chars = await getAllCharacters();
    expect(chars).toHaveLength(1);
    expect(chars[0].name).toBe('赫敏');
    expect(chars[0].subtitle).toBe('一句话介绍');
    expect(chars[0].sourcePath).toBe('C:/ST/characters/赫敏.png');
    expect(chars[0].pngBase64).toBeTruthy(); // PNG 原件随卡入库

    const stories = await getAllArchiveStories();
    expect(stories).toHaveLength(4);
    const main = stories.find((s) => s.title === '主线')!;
    expect(main.characterId).toBe(chars[0].id);
    expect(main.sourcePath).toBe('C:/ST/chats/赫敏/主线.jsonl');
    expect(main.lastImportedAt).toBeTypeOf('number');
    expect(main.session.messages).toHaveLength(3);
    expect(main.session.character.name).toBe('赫敏');
    // 散聊天与坏卡聊天 = 未绑定
    for (const t of ['遗留聊天', '坏卡的聊天']) {
      expect(stories.find((s) => s.title === t)!.characterId).toBeUndefined();
    }

    const wbs = await getAllWorldBooks();
    expect(wbs).toHaveLength(1);
    expect(wbs[0].title).toBe('魔法界');
    expect(wbs[0].sourcePath).toBe('C:/ST/worlds/魔法界.json');
    expect(wbs[0].worldbook.entries['0'].content).toBe('设定正文');

    // 预设 + 全局正则（阶段9.11）：入库带 sourcePath，正则整组一套规则集
    const presets = await getAllPresets();
    expect(presets).toHaveLength(1);
    expect(presets[0].title).toBe('我的预设');
    expect(presets[0].sourcePath).toBe('C:/ST/OpenAI Settings/我的预设.json');
    const regexes = await getAllRegexCollections();
    expect(regexes).toHaveLength(1);
    expect(regexes[0].title).toBe('ST 全局正则');
    expect(regexes[0].sourcePath).toBe('C:/ST/settings.json');
    expect(regexes[0].rules).toHaveLength(1);
    expect(regexes[0].rules[0].name).toBeTruthy();

    // 文件库落位：绑定故事在角色文件夹下，未绑定进临时，世界书/预设/正则进资产
    const files = Object.keys(vaultFs.dump());
    expect(files).toContain('角色/赫敏/档案.json');
    expect(files).toContain('角色/赫敏/卡片.png');
    expect(files).toContain('角色/赫敏/故事/主线/故事.json');
    expect(files).toContain('角色/赫敏/故事/主线/聊天.jsonl');
    expect(files).toContain('临时/遗留聊天/故事.json');
    expect(files).toContain('资产/世界书/魔法界.json');
    expect(files).toContain('资产/预设/我的预设.json');
    expect(files).toContain('资产/正则/ST 全局正则.json');
  });

  it('重复导入：同 sourcePath 全部跳过，不产生副本（含文件库往返后的世界书 sourcePath）', async () => {
    const st = createMemFs();
    await seedSTTree(st);
    setupVault();
    const scan = await scanSTUserDir(st);
    await importSelected(st, selectAll(scan));

    const again = await importSelected(st, selectAll(scan));
    // 卡1 + 聊天4 + 世界书1 + 预设1 + 正则1 = 跳过8；坏卡每轮都解析失败计 failed
    expect(again).toMatchObject({
      characters: 0,
      stories: 0,
      worldbooks: 0,
      presets: 0,
      regexes: 0,
      skipped: 8,
      failed: 1,
      relationships: 0,
      archivedFiles: 0,
    });
    expect(await getAllCharacters()).toHaveLength(1);
    expect(await getAllArchiveStories()).toHaveLength(4);
    expect(await getAllWorldBooks()).toHaveLength(1);
    expect(await getAllPresets()).toHaveLength(1);
    expect(await getAllRegexCollections()).toHaveLength(1);
  });

  it('同一 ST 目录先选安装根、再选 data/default-user 时仍识别为重复来源', async () => {
    const installRoot = createMemFs();
    await seedSTTree(installRoot, 'data/default-user');
    const userRoot = createMemFs();
    await seedSTTree(userRoot);
    setupVault();

    const installScan = await scanSTUserDir(installRoot);
    await importSelected(installRoot, selectAll(installScan, 'D:\\SillyTavern'));

    const userScan = await scanSTUserDir(userRoot);
    const again = await importSelected(
      userRoot,
      selectAll(userScan, 'D:\\SillyTavern\\data\\default-user'),
    );

    expect(again).toMatchObject({
      characters: 0,
      stories: 0,
      worldbooks: 0,
      presets: 0,
      regexes: 0,
      skipped: 8,
    });
    expect(await getAllCharacters()).toHaveLength(1);
    expect(await getAllArchiveStories()).toHaveLength(4);
    expect(await getAllWorldBooks()).toHaveLength(1);
    expect(await getAllPresets()).toHaveLength(1);
    expect(await getAllRegexCollections()).toHaveLength(1);
  });

  it('已导入过的卡再勾选新聊天：新聊天绑到原角色，不建第二个角色', async () => {
    const st = createMemFs();
    await seedSTTree(st);
    setupVault();
    const scan = await scanSTUserDir(st);
    const hermione = scan.characters.find((c) => c.name === '赫敏')!;
    // 第一轮只导卡 + 主线
    await importSelected(st, {
      stRoot: 'C:/ST',
      characters: [{ ...hermione, chats: hermione.chats.filter((c) => c.name === '主线') }],
      strayChats: [],
      worldbooks: [],
      presets: [],
    });
    // ST 侧新增一场聊天，第二轮全选该角色
    await st.writeText('chats/赫敏/番外.jsonl', makeJsonl('赫敏', 2));
    const scan2 = await scanSTUserDir(st);
    const hermione2 = scan2.characters.find((c) => c.name === '赫敏')!;
    const summary = await importSelected(st, { stRoot: 'C:/ST', characters: [hermione2], strayChats: [], worldbooks: [], presets: [] });

    expect(summary.characters).toBe(0);
    expect(summary.stories).toBe(2); // 支线 + 番外
    expect(summary.skipped).toBe(2); // 卡 + 主线
    const chars = await getAllCharacters();
    expect(chars).toHaveLength(1);
    const stories = await getAllArchiveStories();
    expect(stories).toHaveLength(3);
    expect(stories.every((s) => s.characterId === chars[0].id)).toBe(true);
  });

  it('安装根下钻扫描的清单可直接导入（路径前缀正确读到文件）', async () => {
    const st = createMemFs();
    await seedSTTree(st, 'data/default-user');
    setupVault();
    const scan = await scanSTUserDir(st);
    const summary = await importSelected(st, selectAll(scan, 'D:\\SillyTavern\\'));
    expect(summary.characters).toBe(1);
    expect(summary.stories).toBe(4);
    // sourcePath = 所选根（去尾部分隔符）+ '/' + 带前缀相对路径
    expect((await getAllCharacters())[0].sourcePath).toBe('D:\\SillyTavern/data/default-user/characters/赫敏.png');
  });

  it('空勾选 = 全零汇总，不动库', async () => {
    const st = createMemFs();
    setupVault();
    const summary = await importSelected(st, { stRoot: 'C:/ST', characters: [], strayChats: [], worldbooks: [], presets: [] });
    expect(summary).toMatchObject({
      characters: 0,
      stories: 0,
      worldbooks: 0,
      presets: 0,
      regexes: 0,
      skipped: 0,
      failed: 0,
      relationships: 0,
      archivedFiles: 0,
      details: [],
    });
    expect(await getAllCharacters()).toEqual([]);
  });

  it('恢复主绑定、额外、全局和对话级世界书关系，并明确记录未解析名称', async () => {
    const st = createMemFs();
    await st.writeBinary('characters/赫敏.png', makeCardPngBase64({
      spec: 'chara_card_v2',
      data: { name: '赫敏', extensions: { world: '主世界书' } },
    }));
    await st.writeText('chats/赫敏/主线.jsonl', makeJsonlWithWorldbook('赫敏', '对话世界书'));
    for (const name of ['主世界书', '额外世界书', '全局世界书', '对话世界书']) {
      await st.writeText(`worlds/${name}.json`, JSON.stringify({ entries: {} }));
    }
    await st.writeText('settings.json', JSON.stringify({
      world_info_settings: { world_info: {
        globalSelect: ['全局世界书'],
        charLore: [{ name: '赫敏.png', extraBooks: ['额外世界书', '缺失世界书'] }],
      } },
    }));
    const vaultFs = setupVault();

    const scan = await scanSTUserDir(st);
    const summary = await importSelected(st, selectAll(scan));
    setActiveVault(createVault(vaultFs));
    const books = await getAllWorldBooks();
    const byTitle = new Map(books.map((book) => [book.title, book]));
    const character = (await getAllCharacters())[0];
    const story = (await getAllArchiveStories())[0];

    expect(character.assets).toEqual(expect.arrayContaining([
      { kind: 'worldbook', assetId: byTitle.get('主世界书')!.id, relations: ['primary'] },
      { kind: 'worldbook', assetId: byTitle.get('额外世界书')!.id, relations: ['extra'] },
    ]));
    expect(character.unresolvedAssets).toEqual([
      { kind: 'worldbook', name: '缺失世界书', relation: 'extra', reason: 'missing' },
    ]);
    expect(story.assets).toEqual([
      { kind: 'worldbook', assetId: byTitle.get('对话世界书')!.id, relations: ['chat'] },
    ]);
    expect(byTitle.get('全局世界书')!.stGlobal).toBe(true);
    expect(summary.relationships).toBe(4);
    expect(summary.unresolvedRelationships).toEqual([
      { owner: '赫敏', name: '缺失世界书', relation: 'extra', reason: 'missing' },
    ]);

    // ST 侧取消全局与额外链接后，重新扫描应移除旧关系而不是累积残留。
    await st.writeText('settings.json', JSON.stringify({
      world_info_settings: { world_info: { globalSelect: [], charLore: [] } },
    }));
    const scan2 = await scanSTUserDir(st);
    await importSelected(st, selectAll(scan2));
    const refreshedCharacter = (await getAllCharacters())[0];
    expect(refreshedCharacter.assets).toEqual([
      { kind: 'worldbook', assetId: byTitle.get('主世界书')!.id, relations: ['primary'] },
    ]);
    expect((await getAllWorldBooks()).find((book) => book.title === '全局世界书')!.stGlobal).toBe(false);

    await st.writeBinary('characters/赫敏.png', makeCardPngBase64({
      spec: 'chara_card_v2',
      data: { name: '赫敏', extensions: {} },
    }));
    await importSelected(st, selectAll(await scanSTUserDir(st)));
    expect((await getAllCharacters())[0].assets).toBeUndefined();
  });

  it('把 extensions / assets 原样复制到其他资产区，并生成可核对的说明和清单', async () => {
    const st = createMemFs();
    await st.writeBinary('extensions/third-party/插件/index.js', btoa('alert(1)'));
    await st.writeBinary('extensions/third-party/插件/settings.json', btoa('{}'));
    await st.writeBinary('assets/bgm/theme.mp3', 'YXVkaW8=');
    const vaultFs = setupVault();
    const scan = await scanSTUserDir(st);

    const summary = await importSelected(st, {
      stRoot: 'C:/ST',
      characters: [],
      strayChats: [],
      worldbooks: [],
      presets: [],
      archives: scan.archives,
      relationships: scan.relationships,
    });

    expect(summary.archivedFiles).toBe(3);
    expect(summary.archiveBytes).toBeGreaterThan(0);
    const files = Object.keys(vaultFs.dump());
    expect(files).toContain('资产/其他/SillyTavern/extensions/third-party/插件/index.js');
    expect(files).toContain('资产/其他/SillyTavern/extensions/third-party/插件/settings.json');
    expect(files).toContain('资产/其他/SillyTavern/assets/bgm/theme.mp3');
    expect(files).toContain('说明/SillyTavern 导入说明.md');
    expect(files).toContain('说明/SillyTavern 最近一次导入.json');
    const guide = await vaultFs.readText('说明/SillyTavern 导入说明.md');
    expect(guide).toContain('世界书关系');
    expect(guide).toContain('同一路径再次导入');
    expect(guide).toContain('当前没有结构化导入');
  });

  it('把快速回复、人设、背景、主题布局和用户媒体安全归档到稳定目录', async () => {
    const st = createMemFs();
    await st.writeBinary('QuickReplies/Default.json', btoa(JSON.stringify({ name: 'Default', qrList: [{ id: 1 }] })));
    await st.writeBinary('User Avatars/me.png', 'YXZhdGFy');
    await st.writeBinary('backgrounds/room.jpg', 'YmFja2dyb3VuZA==');
    await st.writeBinary('themes/cream.json', btoa('{"name":"cream"}'));
    await st.writeBinary('movingUI/desktop.json', btoa('{"layout":"desktop"}'));
    await st.writeBinary('user/images/upload.png', 'aW1hZ2U=');
    await st.writeText('settings.json', JSON.stringify({
      power_user: {
        personas: { 'me.png': '我的人设' },
        persona_descriptions: { 'me.png': { description: '人设正文', lorebook: '个人世界书' } },
        default_persona: 'me.png',
        persona_sort_order: ['me.png'],
      },
      unrelated_private_setting: '不能进入人设清单',
    }));
    await st.writeText('secrets.json', '{"apiKey":"never archive"}');
    const vaultFs = setupVault();
    await vaultFs.writeText('说明/SillyTavern 导入说明.md', '# 旧版说明\n\n仅支持 extensions/。');
    const scan = await scanSTUserDir(st);

    const summary = await importSelected(st, {
      stRoot: 'C:/ST',
      characters: [],
      strayChats: [],
      worldbooks: [],
      presets: [],
      archives: scan.archives,
      relationships: scan.relationships,
    });

    expect(summary.archivedFiles).toBe(7);
    const files = Object.keys(vaultFs.dump());
    expect(files).toEqual(expect.arrayContaining([
      '资产/其他/SillyTavern/quick-replies/Default.json',
      '资产/其他/SillyTavern/personas/avatars/me.png',
      '资产/其他/SillyTavern/personas/personas.json',
      '资产/其他/SillyTavern/backgrounds/room.jpg',
      '资产/其他/SillyTavern/appearance/themes/cream.json',
      '资产/其他/SillyTavern/appearance/movingUI/desktop.json',
      '资产/其他/SillyTavern/user-media/images/upload.png',
    ]));
    expect(files.some((file) => /settings\.json|secrets\.json/.test(file) && file.startsWith('资产/其他/'))).toBe(false);
    const manifestText = await vaultFs.readText('资产/其他/SillyTavern/personas/personas.json');
    expect(JSON.parse(manifestText)).toEqual({
      version: 1,
      personas: { 'me.png': '我的人设' },
      personaDescriptions: { 'me.png': { description: '人设正文', lorebook: '个人世界书' } },
      defaultPersona: 'me.png',
      personaSortOrder: ['me.png'],
    });
    expect(manifestText).not.toContain('unrelated_private_setting');
    expect(manifestText).not.toContain('apiKey');

    const firstArchivePaths = files.filter((file) => file.startsWith('资产/其他/SillyTavern/')).sort();
    await st.writeBinary('QuickReplies/Default.json', btoa(JSON.stringify({ name: 'Default', qrList: [{ id: 2 }] })));
    await importSelected(st, selectAll(await scanSTUserDir(st)));
    const secondArchivePaths = Object.keys(vaultFs.dump()).filter((file) => file.startsWith('资产/其他/SillyTavern/')).sort();
    expect(secondArchivePaths).toEqual(firstArchivePaths);

    const guide = await vaultFs.readText('说明/SillyTavern 导入说明.md');
    expect(guide).not.toContain('旧版说明');
    expect(guide).toContain('QuickReplies/');
    expect(guide).toContain('User Avatars/');
    expect(guide).toContain('只提取 Persona 相关字段');
    expect(guide).not.toContain('Persona、其他模型后端预设、主题、背景、快捷回复');
  });

  it('世界书关系优先指向 worlds 来源文件，不误连到同名手动资产', async () => {
    const st = createMemFs();
    await st.writeBinary('characters/角色.png', makeCardPngBase64({
      spec: 'chara_card_v2',
      data: { name: '角色', extensions: { world: '同名书' } },
    }));
    await st.writeText('worlds/同名书.json', JSON.stringify({ entries: {} }));
    setupVault();
    const now = Date.now();
    await saveWorldBook({
      id: 'manual-book',
      title: '同名书',
      worldbook: { entries: {} },
      createdAt: now,
      updatedAt: now + 100,
    });

    await importSelected(st, selectAll(await scanSTUserDir(st)));
    const books = await getAllWorldBooks();
    const imported = books.find((book) => book.sourcePath?.endsWith('/worlds/同名书.json'))!;
    expect((await getAllCharacters())[0].assets).toEqual([
      { kind: 'worldbook', assetId: imported.id, relations: ['primary'] },
    ]);
  });

  it('全局关系按 settings 来源隔离；解析失败、其他根和未选择关系都不能清除', async () => {
    const stA = createMemFs();
    await stA.writeText('worlds/A世界书.json', JSON.stringify({ entries: {} }));
    await stA.writeText('settings.json', JSON.stringify({
      world_info_settings: { world_info: { globalSelect: ['A世界书'] } },
    }));
    setupVault();
    await importSelected(stA, selectAll(await scanSTUserDir(stA), 'C:/ST-A'));
    let book = (await getAllWorldBooks()).find((item) => item.title === 'A世界书')!;
    expect(book.stGlobalSources).toEqual(['C:/ST-A/settings.json']);

    await stA.writeText('settings.json', '{broken');
    await importSelected(stA, selectAll(await scanSTUserDir(stA), 'C:/ST-A'));
    book = (await getAllWorldBooks()).find((item) => item.title === 'A世界书')!;
    expect(book.stGlobal).toBe(true);

    const stB = createMemFs();
    await stB.writeText('settings.json', JSON.stringify({
      world_info_settings: { world_info: { globalSelect: [] } },
    }));
    await importSelected(stB, selectAll(await scanSTUserDir(stB), 'C:/ST-B'));
    book = (await getAllWorldBooks()).find((item) => item.title === 'A世界书')!;
    expect(book.stGlobal).toBe(true);

    await stA.writeBinary('assets/test.bin', 'dGVzdA==');
    const archiveScan = await scanSTUserDir(stA);
    await importSelected(stA, {
      stRoot: 'C:/ST-A',
      characters: [],
      strayChats: [],
      worldbooks: [],
      presets: [],
      archives: archiveScan.archives,
    });
    expect((await getAllWorldBooks()).find((item) => item.title === 'A世界书')!.stGlobal).toBe(true);

    await stA.writeText('settings.json', JSON.stringify({
      world_info_settings: { world_info: { globalSelect: [] } },
    }));
    await importSelected(stA, selectAll(await scanSTUserDir(stA), 'C:/ST-A'));
    book = (await getAllWorldBooks()).find((item) => item.title === 'A世界书')!;
    expect(book.stGlobal).toBe(false);
    expect(book.stGlobalSources).toEqual([]);
  });

  it('已导入聊天复扫时只刷新对话级世界书关系，不覆盖故事内容', async () => {
    const st = createMemFs();
    await st.writeBinary('characters/角色.png', makeCardPngBase64({ spec: 'chara_card_v2', data: { name: '角色' } }));
    await st.writeText('chats/角色/主线.jsonl', makeJsonlWithWorldbook('角色', '书A'));
    await st.writeText('worlds/书A.json', JSON.stringify({ entries: {} }));
    await st.writeText('worlds/书B.json', JSON.stringify({ entries: {} }));
    setupVault();
    await importSelected(st, selectAll(await scanSTUserDir(st)));
    const original = (await getAllArchiveStories())[0];
    const originalMessages = original.session.messages;

    await st.writeText('chats/角色/主线.jsonl', makeJsonlWithWorldbook('角色', '书B'));
    await importSelected(st, selectAll(await scanSTUserDir(st)));
    let story = (await getAllArchiveStories())[0];
    const bookB = (await getAllWorldBooks()).find((book) => book.title === '书B')!;
    expect(story.assets).toEqual([{ kind: 'worldbook', assetId: bookB.id, relations: ['chat'] }]);
    expect(story.session.messages).toEqual(originalMessages);

    await st.writeText('chats/角色/主线.jsonl', makeJsonlWithWorldbook('角色', '不存在'));
    await importSelected(st, selectAll(await scanSTUserDir(st)));
    story = (await getAllArchiveStories())[0];
    expect(story.assets).toBeUndefined();
    expect(story.unresolvedAssets).toEqual([
      { kind: 'worldbook', name: '不存在', relation: 'chat', reason: 'missing' },
    ]);

    await st.writeText('chats/角色/主线.jsonl', makeJsonl('角色', 1));
    await importSelected(st, selectAll(await scanSTUserDir(st)));
    story = (await getAllArchiveStories())[0];
    expect(story.assets).toBeUndefined();
    expect(story.unresolvedAssets).toBeUndefined();
  });

  it('已有聊天首行损坏时保留原对话级关系并报告失败', async () => {
    const st = createMemFs();
    await st.writeBinary('characters/角色.png', makeCardPngBase64({ spec: 'chara_card_v2', data: { name: '角色' } }));
    await st.writeText('chats/角色/主线.jsonl', makeJsonlWithWorldbook('角色', '书A'));
    await st.writeText('worlds/书A.json', JSON.stringify({ entries: {} }));
    setupVault();
    await importSelected(st, selectAll(await scanSTUserDir(st)));
    const originalAssets = (await getAllArchiveStories())[0].assets;

    await st.writeText('chats/角色/主线.jsonl', '{broken');
    const summary = await importSelected(st, selectAll(await scanSTUserDir(st)));

    expect((await getAllArchiveStories())[0].assets).toEqual(originalAssets);
    expect(summary.failed).toBe(1);
    expect(summary.details).toContainEqual(expect.objectContaining({ status: 'failed', kind: '聊天关系', name: '主线' }));
  });

  it('已有聊天部分截断时不采用新元数据覆盖原对话级关系', async () => {
    const st = createMemFs();
    await st.writeBinary('characters/角色.png', makeCardPngBase64({ spec: 'chara_card_v2', data: { name: '角色' } }));
    await st.writeText('chats/角色/主线.jsonl', makeJsonlWithWorldbook('角色', '书A'));
    for (const name of ['书A', '书B']) await st.writeText(`worlds/${name}.json`, JSON.stringify({ entries: {} }));
    setupVault();
    await importSelected(st, selectAll(await scanSTUserDir(st)));
    const originalAssets = (await getAllArchiveStories())[0].assets;

    await st.writeText('chats/角色/主线.jsonl', `${makeJsonlWithWorldbook('角色', '书B')}\n{truncated`);
    const summary = await importSelected(st, selectAll(await scanSTUserDir(st)));

    expect((await getAllArchiveStories())[0].assets).toEqual(originalAssets);
    expect(summary.failed).toBe(1);
  });

  it('已有聊天只剩元数据行时保留原对话级关系', async () => {
    const st = createMemFs();
    await st.writeBinary('characters/角色.png', makeCardPngBase64({ spec: 'chara_card_v2', data: { name: '角色' } }));
    await st.writeText('chats/角色/主线.jsonl', makeJsonlWithWorldbook('角色', '书A'));
    for (const name of ['书A', '书B']) await st.writeText(`worlds/${name}.json`, JSON.stringify({ entries: {} }));
    setupVault();
    await importSelected(st, selectAll(await scanSTUserDir(st)));
    const originalAssets = (await getAllArchiveStories())[0].assets;

    await st.writeText('chats/角色/主线.jsonl', JSON.stringify({
      user_name: '我', character_name: '角色', chat_metadata: { world_info: '书B' },
    }));
    const summary = await importSelected(st, selectAll(await scanSTUserDir(st)));

    expect((await getAllArchiveStories())[0].assets).toEqual(originalAssets);
    expect(summary.failed).toBe(1);
  });

  it('已有聊天缺少元数据首行时保留原对话级关系', async () => {
    const st = createMemFs();
    await st.writeBinary('characters/角色.png', makeCardPngBase64({ spec: 'chara_card_v2', data: { name: '角色' } }));
    await st.writeText('chats/角色/主线.jsonl', makeJsonlWithWorldbook('角色', '书A'));
    await st.writeText('worlds/书A.json', JSON.stringify({ entries: {} }));
    setupVault();
    await importSelected(st, selectAll(await scanSTUserDir(st)));
    const originalAssets = (await getAllArchiveStories())[0].assets;

    await st.writeText('chats/角色/主线.jsonl', JSON.stringify({ name: '我', is_user: true, mes: '仍是合法消息' }));
    const summary = await importSelected(st, selectAll(await scanSTUserDir(st)));

    expect((await getAllArchiveStories())[0].assets).toEqual(originalAssets);
    expect(summary.failed).toBe(1);
  });

  it('来源角色卡临时损坏时不使用库内旧卡回滚主绑定', async () => {
    const st = createMemFs();
    for (const name of ['书A', '书B']) await st.writeText(`worlds/${name}.json`, JSON.stringify({ entries: {} }));
    await st.writeBinary('characters/角色.png', makeCardPngBase64({
      spec: 'chara_card_v2',
      data: { name: '角色', extensions: { world: '书A' } },
    }));
    setupVault();
    await importSelected(st, selectAll(await scanSTUserDir(st)));

    await st.writeBinary('characters/角色.png', makeCardPngBase64({
      spec: 'chara_card_v2',
      data: { name: '角色', extensions: { world: '书B' } },
    }));
    await importSelected(st, selectAll(await scanSTUserDir(st)));
    const relationToB = (await getAllCharacters())[0].assets;

    await st.writeBinary('characters/角色.png', 'bm90LWEtcG5n');
    const summary = await importSelected(st, selectAll(await scanSTUserDir(st)));

    expect((await getAllCharacters())[0].assets).toEqual(relationToB);
    expect(summary.failed).toBe(1);
    expect(summary.details).toContainEqual(expect.objectContaining({ status: 'failed', kind: '角色卡关系', name: '角色' }));
  });

  it('角色世界书写时复制后复扫仍保留派生副本关系', async () => {
    const st = createMemFs();
    await st.writeText('worlds/书A.json', JSON.stringify({ entries: {} }));
    await st.writeBinary('characters/角色.png', makeCardPngBase64({
      spec: 'chara_card_v2',
      data: { name: '角色', extensions: { world: '书A' } },
    }));
    setupVault();
    await importSelected(st, selectAll(await scanSTUserDir(st)));

    const character = (await getAllCharacters())[0];
    const sourceBook = (await getAllWorldBooks()).find((book) => book.title === '书A')!;
    const now = Date.now();
    await saveWorldBook({
      ...sourceBook,
      id: 'derived-book',
      title: '书A_角色',
      sourcePath: undefined,
      derived: { derivedFrom: sourceBook.id, characterId: character.id, createdAt: now, updatedAt: now },
    });
    character.assets = [{ kind: 'worldbook', assetId: 'derived-book', relations: ['primary'] }];
    await saveCharacter(character);

    await importSelected(st, selectAll(await scanSTUserDir(st)));

    expect((await getAllCharacters())[0].assets).toEqual([
      { kind: 'worldbook', assetId: 'derived-book', relations: ['primary'] },
    ]);
  });

  it('多本额外世界书写时复制后复扫按各自来源保留派生副本', async () => {
    const st = createMemFs();
    for (const name of ['书A', '书B']) await st.writeText(`worlds/${name}.json`, JSON.stringify({ entries: {} }));
    await st.writeBinary('characters/角色.png', makeCardPngBase64({ spec: 'chara_card_v2', data: { name: '角色' } }));
    await st.writeText('settings.json', JSON.stringify({
      world_info_settings: { world_info: { charLore: [{ name: '角色.png', extraBooks: ['书A', '书B'] }] } },
    }));
    setupVault();
    await importSelected(st, selectAll(await scanSTUserDir(st)));

    const character = (await getAllCharacters())[0];
    const books = await getAllWorldBooks();
    const now = Date.now();
    for (const name of ['书A', '书B']) {
      const source = books.find((book) => book.title === name)!;
      await saveWorldBook({
        ...source,
        id: `derived-${name}`,
        title: `${name}_角色`,
        sourcePath: undefined,
        derived: { derivedFrom: source.id, characterId: character.id, createdAt: now, updatedAt: now },
      });
    }
    character.assets = [
      { kind: 'worldbook', assetId: 'derived-书A', relations: ['extra'] },
      { kind: 'worldbook', assetId: 'derived-书B', relations: ['extra'] },
    ];
    await saveCharacter(character);
    await st.writeText('settings.json', JSON.stringify({
      world_info_settings: { world_info: { charLore: [{ name: '角色.png', extraBooks: ['书B', '书A'] }] } },
    }));

    await importSelected(st, selectAll(await scanSTUserDir(st)));

    expect((await getAllCharacters())[0].assets).toEqual(expect.arrayContaining([
      { kind: 'worldbook', assetId: 'derived-书A', relations: ['extra'] },
      { kind: 'worldbook', assetId: 'derived-书B', relations: ['extra'] },
    ]));
  });

  it('没有当前 ST 来源文件且存在同名候选时保留为歧义，不随列表顺序误连', async () => {
    const st = createMemFs();
    await st.writeBinary('characters/角色.png', makeCardPngBase64({
      spec: 'chara_card_v2',
      data: { name: '角色', extensions: { world: '同名书' } },
    }));
    setupVault();
    const now = Date.now();
    for (const id of ['manual-1', 'manual-2']) {
      await saveWorldBook({ id, title: '同名书', worldbook: { entries: {} }, createdAt: now, updatedAt: now });
    }

    const summary = await importSelected(st, selectAll(await scanSTUserDir(st)));
    const character = (await getAllCharacters())[0];
    expect(character.assets).toBeUndefined();
    expect(character.unresolvedAssets).toEqual([
      { kind: 'worldbook', name: '同名书', relation: 'primary', reason: 'ambiguous' },
    ]);
    expect(summary.unresolvedRelationships[0].reason).toBe('ambiguous');
  });

  it('递归盘点跳过符号链接并把遗漏写入扫描警告', async () => {
    const base = createMemFs();
    await base.writeBinary('extensions/real/file.bin', 'dGVzdA==');
    const fs = {
      ...base,
      async list(dir: string) {
        const entries = await base.list(dir);
        return dir === 'extensions'
          ? [...entries, { name: 'outside', isDir: true, isSymlink: true, size: 0 }]
          : entries;
      },
    };

    const scan = await scanSTUserDir(fs);
    expect(scan.archives[0].files.map((file) => file.relativePath)).toEqual(['real/file.bin']);
    expect(scan.warnings).toEqual([
      { path: 'extensions/outside', reason: 'symlink' },
    ]);
  });

  it('扩展根目录本身是符号链接时跳过，并继续下钻真正的 ST 用户目录', async () => {
    const base = createMemFs();
    await base.writeBinary('extensions/outside/file.bin', 'dGVzdA==');
    await base.writeText('data/default-user/worlds/真实世界书.json', JSON.stringify({ entries: {} }));
    const fs = {
      ...base,
      async list(dir: string) {
        const entries = await base.list(dir);
        return dir === ''
          ? entries.map((entry) => (entry.name === 'extensions' ? { ...entry, isSymlink: true } : entry))
          : entries;
      },
    };

    const scan = await scanSTUserDir(fs);
    expect(scan.userDir).toBe('data/default-user');
    expect(scan.worldbooks.map((book) => book.name)).toEqual(['真实世界书']);
    expect(scan.archives).toEqual([]);
    expect(scan.warnings).toContainEqual({ path: 'extensions', reason: 'symlink' });
  });

  it('角色卡等结构化来源文件是符号链接时不纳入扫描', async () => {
    const base = createMemFs();
    await base.writeBinary('characters/外部角色.png', makeCardPngBase64({ spec: 'chara_card_v2', data: { name: '外部角色' } }));
    const fs = {
      ...base,
      async list(dir: string) {
        const entries = await base.list(dir);
        return dir === 'characters'
          ? entries.map((entry) => ({ ...entry, isSymlink: true }))
          : entries;
      },
    };

    const scan = await scanSTUserDir(fs);
    expect(scan.characters).toEqual([]);
    expect(scan.warnings).toContainEqual({ path: 'characters/外部角色.png', reason: 'symlink' });
  });

  it('递归归档拒绝会被解释成路径穿越的目录项名称', async () => {
    const base = createMemFs();
    await base.writeBinary('extensions/real.bin', 'dGVzdA==');
    const fs = {
      ...base,
      async list(dir: string) {
        const entries = await base.list(dir);
        return dir === 'extensions'
          ? [...entries, { name: '..\\..\\escape.txt', isDir: false, size: 6 }]
          : entries;
      },
    };

    const scan = await scanSTUserDir(fs);
    expect(scan.archives[0].files.map((file) => file.relativePath)).toEqual(['real.bin']);
    expect(scan.warnings).toContainEqual({ path: 'extensions/..\\..\\escape.txt', reason: 'unsafe-path' });
  });
});
