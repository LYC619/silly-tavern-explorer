/**
 * 关联文件的存取与预览分档（0830 反馈条目 6）。
 *
 * 钉住的是几件会静悄悄出错的事：
 * 1. html 必须落在 text 档。这是安全边界——落到别的档就意味着有人给它加了渲染路径，
 *    等于在客户端里执行陌生页面的脚本。
 * 2. 文件真的写进 `<角色文件夹>/附件/`，撞名自动改名而不是覆盖用户已有的文件。
 * 3. 文件被用户挪走时记录保留、只标 missing；放回来就恢复。
 * 4. 移除走回收站（trashFile）而不是直接抹掉。
 * 5. 网页版（没有激活库）不假装成功：ok=0，全部计失败。
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { ArchiveCharacter } from '@/types/archive';
import { setActiveVault } from '@/lib/vault/active';
import { createMemFs } from '@/lib/vault/fs';
import type { VaultBackend } from '@/lib/vault/vault-backend';
import {
  addAttachmentFiles,
  attachmentTier,
  attachmentsSupported,
  externalOpenSupported,
  isMediaAttachment,
  loadAttachmentViews,
  removeAttachment,
  renameAttachment,
} from '@/lib/attachment-store';

const CHAR_DIR = '角色/赫敏';

function character(over: Partial<ArchiveCharacter> = {}): ArchiveCharacter {
  return {
    id: 'c1', name: '赫敏', card: {} as ArchiveCharacter['card'], tags: [],
    status: 'raw' as ArchiveCharacter['status'], createdAt: 0, updatedAt: 0, ...over,
  };
}

/** 内存库后端；trashFile 单独记一笔，好断言删除走的是回收站 */
function mountVault() {
  const fs = createMemFs();
  const trashed: string[] = [];
  const backend = {
    repo: () => { throw new Error('本测试不用 repo'); },
    fs: { ...fs, trashFile: async (path: string) => { trashed.push(path); await fs.removeFile(path); } },
    pathOf: async () => CHAR_DIR,
  } as unknown as VaultBackend;
  setActiveVault(backend);
  return { fs, trashed };
}

function file(name: string, body = 'x') {
  return new File([body], name);
}

/** 附件是按二进制写的（收的本来就是视频这类东西），读回来要解 base64 */
async function readBack(fs: ReturnType<typeof createMemFs>, path: string) {
  return atob(await fs.readBinary(path));
}

beforeEach(() => setActiveVault(null));
afterEach(() => setActiveVault(null));

describe('预览分档', () => {
  it('html 归 text 档：只看源码，不给内嵌渲染留口子', () => {
    expect(attachmentTier('攻略.html', 2048)).toBe('text');
    expect(attachmentTier('index.htm', 2048)).toBe('text');
  });

  it('图片/JSON/文本内部预览，音视频与未知格式交给外部程序', () => {
    expect(attachmentTier('封面.png', 4096)).toBe('image');
    expect(attachmentTier('配置.json', 4096)).toBe('json');
    expect(attachmentTier('说明.md', 4096)).toBe('text');
    expect(attachmentTier('同人.mp4', 40 * 1024 * 1024)).toBe('external');
    expect(attachmentTier('打包.zip', 4096)).toBe('external');
    expect(attachmentTier('没有扩展名', 4096)).toBe('external');
  });

  it('超限的大文本/大图退回 external，不往内存里塞', () => {
    expect(attachmentTier('日志.txt', 600 * 1024)).toBe('external');
    expect(attachmentTier('巨图.png', 20 * 1024 * 1024)).toBe('external');
  });

  it('音视频能单独认出来（列表图标用）', () => {
    expect(isMediaAttachment('同人.mp4')).toBe(true);
    expect(isMediaAttachment('语音.mp3')).toBe(true);
    expect(isMediaAttachment('攻略.html')).toBe(false);
  });
});

describe('环境能力', () => {
  it('没有激活库 = 网页版：附件与外部打开都不可用', () => {
    expect(attachmentsSupported()).toBe(false);
    expect(externalOpenSupported()).toBe(false);
  });

  it('内存库有附件但没有外部打开（fs 上没有 openPath）', () => {
    mountVault();
    expect(attachmentsSupported()).toBe(true);
    expect(externalOpenSupported()).toBe(false);
  });
});

describe('导入', () => {
  it('文件写进 附件/ 子目录，记录只存相对路径', async () => {
    const { fs } = mountVault();
    const { patch, ok, fail } = await addAttachmentFiles(character(), [file('攻略.html', '<p>hi</p>')]);
    expect([ok, fail]).toEqual([1, 0]);
    expect(patch.attachments).toHaveLength(1);
    expect(patch.attachments![0].path).toBe(`${CHAR_DIR}/附件/攻略.html`);
    expect(patch.attachments![0].title).toBe('攻略.html');
    expect(await readBack(fs, `${CHAR_DIR}/附件/攻略.html`)).toBe('<p>hi</p>');
  });

  it('撞名自动改名，不覆盖已经在那儿的文件', async () => {
    const { fs } = mountVault();
    await fs.writeText(`${CHAR_DIR}/附件/攻略.html`, '原有内容');
    const { patch, ok } = await addAttachmentFiles(character(), [file('攻略.html', '新内容')]);
    expect(ok).toBe(1);
    expect(patch.attachments![0].path).not.toBe(`${CHAR_DIR}/附件/攻略.html`);
    expect(await fs.readText(`${CHAR_DIR}/附件/攻略.html`)).toBe('原有内容');
  });

  it('追加而不是替换已有附件', async () => {
    mountVault();
    const existing = { id: 'a0', title: '旧的.mp4', path: `${CHAR_DIR}/附件/旧的.mp4`, size: 1, addedAt: 1 };
    const { patch } = await addAttachmentFiles(character({ attachments: [existing] }), [file('新的.html')]);
    expect(patch.attachments!.map((a) => a.title)).toEqual(['旧的.mp4', '新的.html']);
  });

  it('网页版不假装成功：一个都没入库，全部计失败', async () => {
    const { patch, ok, fail } = await addAttachmentFiles(character(), [file('a.html'), file('b.mp4')]);
    expect([ok, fail]).toEqual([0, 2]);
    expect(patch.attachments).toBeUndefined();
  });
});

describe('展示视图', () => {
  it('体积以磁盘为准，档位按实际体积算', async () => {
    const { fs } = mountVault();
    await fs.writeText(`${CHAR_DIR}/附件/说明.txt`, 'hello');
    const views = await loadAttachmentViews(character({
      attachments: [{ id: 'a1', title: '说明', path: `${CHAR_DIR}/附件/说明.txt`, size: 999, addedAt: 1 }],
    }));
    expect(views[0].missing).toBe(false);
    expect(views[0].actualSize).toBe(5);
    expect(views[0].tier).toBe('text');
  });

  it('文件被挪走只标 missing，记录不动；放回来就恢复', async () => {
    const { fs } = mountVault();
    const c = character({
      attachments: [{ id: 'a1', title: '同人', path: `${CHAR_DIR}/附件/同人.mp4`, size: 42, addedAt: 1 }],
    });
    expect((await loadAttachmentViews(c))[0]).toMatchObject({ missing: true, actualSize: 42 });
    await fs.writeText(`${CHAR_DIR}/附件/同人.mp4`, '假装是视频');
    expect((await loadAttachmentViews(c))[0].missing).toBe(false);
  });
});

describe('移除与改名', () => {
  it('删附件走系统回收站，不是直接抹掉', async () => {
    const { fs, trashed } = mountVault();
    await fs.writeText(`${CHAR_DIR}/附件/攻略.html`, 'x');
    const c = character({
      attachments: [{ id: 'a1', title: '攻略', path: `${CHAR_DIR}/附件/攻略.html`, size: 1, addedAt: 1 }],
    });
    const patch = await removeAttachment(c, 'a1', true);
    expect(patch.attachments).toEqual([]);
    expect(trashed).toEqual([`${CHAR_DIR}/附件/攻略.html`]);
    expect((await fs.stat(`${CHAR_DIR}/附件/攻略.html`)).exists).toBe(false);
  });

  it('deleteFile=false 只撤记录，文件留在库里', async () => {
    const { fs, trashed } = mountVault();
    await fs.writeText(`${CHAR_DIR}/附件/攻略.html`, 'x');
    const c = character({
      attachments: [{ id: 'a1', title: '攻略', path: `${CHAR_DIR}/附件/攻略.html`, size: 1, addedAt: 1 }],
    });
    expect((await removeAttachment(c, 'a1', false)).attachments).toEqual([]);
    expect(trashed).toEqual([]);
    expect((await fs.stat(`${CHAR_DIR}/附件/攻略.html`)).exists).toBe(true);
  });

  it('文件已经不在了也照样能撤掉记录', async () => {
    mountVault();
    const c = character({
      attachments: [{ id: 'a1', title: '早没了', path: `${CHAR_DIR}/附件/早没了.mp4`, size: 1, addedAt: 1 }],
    });
    await expect(removeAttachment(c, 'a1', true)).resolves.toMatchObject({ attachments: [] });
  });

  it('改名只动显示名，磁盘路径不变（外部快捷方式还指着它）', () => {
    const c = character({
      attachments: [{ id: 'a1', title: '攻略.html', path: `${CHAR_DIR}/附件/攻略.html`, size: 1, addedAt: 1 }],
    });
    const patch = renameAttachment(c, 'a1', '  通关流程  ');
    expect(patch.attachments![0]).toMatchObject({ title: '通关流程', path: `${CHAR_DIR}/附件/攻略.html` });
    expect(() => renameAttachment(c, 'a1', '   ')).toThrow();
  });
});

describe('导入入口', () => {
  it('网页版选到关联文件类型时明确报错，不静默什么都不做', async () => {
    const { importFilesForCharacter } = await import('@/lib/character-import');
    await expect(importFilesForCharacter(character(), 'attachment', [file('a.html')]))
      .rejects.toThrow(/客户端/);
  });

  it('客户端走 attachment-store，patch 带 attachments', async () => {
    mountVault();
    const { importFilesForCharacter } = await import('@/lib/character-import');
    const result = await importFilesForCharacter(character(), 'attachment', [file('攻略.html')]);
    expect(result.ok).toBe(1);
    expect(result.patch?.attachments).toHaveLength(1);
  });
});
