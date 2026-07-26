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
import { getAllArchiveStories, getAllCharacters } from '@/lib/archive-db';
import { getAllWorldBooks } from '@/lib/worldbook-db';
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

  it('目录缺失 = 空组不抛错（空目录/只有部分子目录）', async () => {
    const empty = await scanSTUserDir(createMemFs());
    expect(empty).toEqual({ userDir: '', characters: [], strayChats: [], worldbooks: [], presets: [], regex: null });

    const partial = createMemFs();
    await partial.writeText('worlds/仅世界书.json', wbJson); // 没有 characters/ chats/
    const r = await scanSTUserDir(partial);
    expect(r.characters).toEqual([]);
    expect(r.strayChats).toEqual([]);
    expect(r.worldbooks).toHaveLength(1);
  });
});

// ---------- 导入 ----------

function setupVault() {
  const vaultFs = createMemFs();
  setActiveVault(createVault(vaultFs));
  return vaultFs;
}

describe('importSelected', () => {
  it('全选导入：卡建角色并记 sourcePath，聊天绑定落角色文件夹，散聊天进临时，世界书入库', async () => {
    const st = createMemFs();
    await seedSTTree(st);
    const vaultFs = setupVault();
    const scan = await scanSTUserDir(st);
    const summary = await importSelected(st, selectAll(scan));

    // 坏卡.png 解析失败计 failed=1，其聊天降级为未绑定照常导入
    expect(summary).toEqual({ characters: 1, stories: 4, worldbooks: 1, presets: 1, regexes: 1, skipped: 0, failed: 1 });

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
    expect(again).toEqual({ characters: 0, stories: 0, worldbooks: 0, presets: 0, regexes: 0, skipped: 8, failed: 1 });
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
    expect(summary).toEqual({ characters: 0, stories: 0, worldbooks: 0, presets: 0, regexes: 0, skipped: 0, failed: 0 });
    expect(await getAllCharacters()).toEqual([]);
  });
});
