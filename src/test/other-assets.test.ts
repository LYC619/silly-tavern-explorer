import { describe, expect, it } from 'vitest';
import { createMemFs } from '@/lib/vault/fs';
import {
  classifyArchivePreview,
  formatArchiveBytes,
  listArchiveDirectory,
  loadExtensions,
  loadOtherAssetOverview,
  loadPersonas,
  loadQuickReplySets,
} from '@/lib/vault/other-assets';

async function createArchiveFixture() {
  const fs = createMemFs();
  await fs.writeText('资产/其他/SillyTavern/extensions/demo/manifest.json', JSON.stringify({
    display_name: 'Demo Extension',
    version: '1.2.0',
    author: 'Tester',
    description: '用于验证扩展清单',
    homePage: 'https://example.com/demo',
  }));
  await fs.writeText('资产/其他/SillyTavern/extensions/demo/index.js', 'window.shouldNeverRun = true;');
  await fs.writeText('资产/其他/SillyTavern/quick-replies/日常.json', JSON.stringify({
    version: 2,
    name: '日常系统',
    disableSend: false,
    injectInput: true,
    qrList: [{ id: 1, label: '开始', title: '开始故事', message: '/start', preventAutoExecute: true }],
  }));
  await fs.writeText('资产/其他/SillyTavern/personas/personas.json', JSON.stringify({
    version: 1,
    personas: { 'user.png': '林劫' },
    personaDescriptions: {
      'user.png': { description: '旅行者', position: 0, depth: 2, lorebook: '旅途设定' },
    },
  }));
  await fs.writeBinary('资产/其他/SillyTavern/personas/avatars/user.png', 'aGk=');
  await fs.writeBinary('资产/其他/SillyTavern/backgrounds/room.jpg', 'aGk=');
  await fs.writeText('资产/其他/SillyTavern/appearance/themes/cream.json', '{"name":"cream"}');
  await fs.writeBinary('资产/其他/SillyTavern/user-media/images/upload.png', 'aGk=');
  return fs;
}

describe('其他资产归档模型', () => {
  it('按用户可理解的七类汇总真实归档内容（扩展资产未导入时计数为 0 但入口存在）', async () => {
    const fs = await createArchiveFixture();

    const overview = await loadOtherAssetOverview(fs);

    expect(overview.map((item) => [item.id, item.count])).toEqual([
      ['extensions', 1],
      ['assets', 0],
      ['quick-replies', 1],
      ['personas', 1],
      ['backgrounds', 1],
      ['appearance', 1],
      ['user-media', 1],
    ]);
  });

  it('从扩展根清单提取名称、版本、作者、简介和主页', async () => {
    const fs = await createArchiveFixture();

    expect(await loadExtensions(fs)).toEqual([
      expect.objectContaining({
        directory: 'demo',
        name: 'Demo Extension',
        version: '1.2.0',
        author: 'Tester',
        description: '用于验证扩展清单',
        homepage: 'https://example.com/demo',
        path: '资产/其他/SillyTavern/extensions/demo',
      }),
    ]);
  });

  it('扩展清单损坏时回退目录名且不影响其他扩展', async () => {
    const fs = await createArchiveFixture();
    await fs.writeText('资产/其他/SillyTavern/extensions/broken/manifest.json', '{oops');

    const extensions = await loadExtensions(fs);

    expect(extensions.map((item) => item.name)).toEqual(['broken', 'Demo Extension']);
    expect(extensions[0].manifestError).toBe('清单格式异常');
  });

  it('快速回复直接解析选项标签、标题和消息正文', async () => {
    const fs = await createArchiveFixture();

    const sets = await loadQuickReplySets(fs);

    expect(sets).toHaveLength(1);
    expect(sets[0]).toMatchObject({ name: '日常系统', disableSend: false, injectInput: true });
    expect(sets[0].items[0]).toMatchObject({
      id: '1',
      label: '开始',
      title: '开始故事',
      message: '/start',
      preventAutoExecute: true,
    });
  });

  it('把人设清单与同名头像及关联字段组合起来', async () => {
    const fs = await createArchiveFixture();

    expect(await loadPersonas(fs)).toEqual([
      expect.objectContaining({
        fileName: 'user.png',
        name: '林劫',
        description: '旅行者',
        position: 0,
        depth: 2,
        lorebook: '旅途设定',
        avatarPath: '资产/其他/SillyTavern/personas/avatars/user.png',
      }),
    ]);
  });

  it('目录读取只返回归档根内当前层级并跳过符号链接', async () => {
    const fs = await createArchiveFixture();
    const originalList = fs.list.bind(fs);
    fs.list = async (dir) => [
      ...(await originalList(dir)),
      ...(dir.endsWith('/extensions/demo') ? [{ name: 'outside', isDir: true, isSymlink: true, size: 0 }] : []),
    ];

    const files = await listArchiveDirectory(fs, 'extensions/demo');

    expect(files.map((file) => file.name)).toEqual(['index.js', 'manifest.json']);
    await expect(listArchiveDirectory(fs, '../角色')).rejects.toThrow('归档路径越界');
  });
});

describe('其他资产安全预览', () => {
  it('按格式和大小限制区分 JSON、文本、图片与不支持格式', () => {
    expect(classifyArchivePreview({ name: 'theme.json', size: 100 })).toBe('json');
    expect(classifyArchivePreview({ name: 'index.js', size: 100 })).toBe('text');
    expect(classifyArchivePreview({ name: 'README.md', size: 100 })).toBe('text');
    expect(classifyArchivePreview({ name: 'room.jpg', size: 100 })).toBe('image');
    expect(classifyArchivePreview({ name: 'large.json', size: 600 * 1024 })).toBe('unsupported');
    expect(classifyArchivePreview({ name: 'large.png', size: 13 * 1024 * 1024 })).toBe('unsupported');
    expect(classifyArchivePreview({ name: 'archive.zip', size: 100 })).toBe('unsupported');
  });

  it('用紧凑单位显示文件大小', () => {
    expect(formatArchiveBytes(0)).toBe('0 B');
    expect(formatArchiveBytes(1536)).toBe('1.5 KB');
    expect(formatArchiveBytes(2 * 1024 * 1024)).toBe('2 MB');
  });
});
