import { describe, expect, it } from 'vitest';
import { createMemFs } from '@/lib/vault/fs';
import { performWriteback, restoreBackup, WRITEBACK_KEEP, backupFileName } from '@/lib/vault/st-writeback';
import { parseJsonl } from '@/lib/adapters/st/chat-jsonl';
import type { ArchiveStory } from '@/types/archive';

const META = JSON.stringify({ user_name: 'User', character_name: '赫敏' });
const ST_PATH = 'D:/ST/data/default-user/chats/赫敏/主线.jsonl';

function mkJsonl(floors: number): string {
  const lines = [META];
  for (let i = 0; i < floors; i++) {
    lines.push(JSON.stringify({ name: '赫敏', is_user: false, send_date: 1000 + i, mes: `第${i + 1}楼` }));
  }
  return lines.join('\n');
}

function mkStory(floors: number, bound = true): ArchiveStory {
  const { messages, metadata } = parseJsonl(mkJsonl(floors));
  return {
    id: 'astory_wb',
    characterId: bound ? 'char_1' : undefined,
    title: '主线',
    session: {
      id: 's1', title: '主线', messages,
      character: { name: '赫敏' }, user: { name: 'User' },
      createdAt: 1000, rawMetadata: metadata,
    },
    markers: [],
    meta: { modelsUsed: [], playTimeMs: null },
    sourcePath: ST_PATH,
    createdAt: 1000,
    updatedAt: 1000,
  };
}

/** 以第二个 memFs 充当 ST 侧的绝对路径世界 */
const mkAbs = () => {
  const fs = createMemFs();
  return { fs, io: { readText: (p: string) => fs.readText(p), writeText: (p: string, c: string) => fs.writeText(p, c) } };
};

describe('写回 ST（7.5）', () => {
  it('写回=备份原文件+覆盖 ST+记历史；ST 侧可解析回同楼数', async () => {
    const vault = createMemFs();
    const { fs: absFs, io } = mkAbs();
    await absFs.writeText(ST_PATH, mkJsonl(2)); // ST 端旧版 2 楼
    const { story, backedUp } = await performWriteback(vault, io, mkStory(3), 1700000000000);
    expect(backedUp).toBe(true);
    expect(story.writebacks).toHaveLength(1);
    expect(story.writebacks![0].floors).toBe(3);
    // 备份的是写回前的 ST 内容
    const backup = await vault.readText(story.writebacks![0].backupFile!);
    expect(parseJsonl(backup).messages).toHaveLength(2);
    // ST 侧被覆盖为主线 3 楼
    expect(parseJsonl(await absFs.readText(ST_PATH)).messages).toHaveLength(3);
  });

  it('源文件不存在：无备份仍写出，历史不带 backupFile', async () => {
    const vault = createMemFs();
    const { fs: absFs, io } = mkAbs();
    const { story, backedUp } = await performWriteback(vault, io, mkStory(2), 1700000000000);
    expect(backedUp).toBe(false);
    expect(story.writebacks![0].backupFile).toBeUndefined();
    expect(parseJsonl(await absFs.readText(ST_PATH)).messages).toHaveLength(2);
  });

  it('备份修剪：连写 7 次只留最近 5 版，历史 7 条', async () => {
    const vault = createMemFs();
    const { fs: absFs, io } = mkAbs();
    await absFs.writeText(ST_PATH, mkJsonl(1));
    let story = mkStory(2);
    for (let i = 0; i < 7; i++) {
      ({ story } = await performWriteback(vault, io, story, 1700000000000 + i * 60_000));
    }
    const names = (await vault.list(`.ste/写回备份/${story.id}`)).map((e) => e.name);
    expect(names).toHaveLength(WRITEBACK_KEEP);
    expect(names).toContain(backupFileName(1700000000000 + 6 * 60_000));
    expect(names).not.toContain(backupFileName(1700000000000));
    expect(story.writebacks).toHaveLength(7);
  });

  it('未绑定/无来源路径拒绝写回', async () => {
    const vault = createMemFs();
    const { io } = mkAbs();
    await expect(performWriteback(vault, io, mkStory(2, false))).rejects.toThrow('绑定');
  });

  it('恢复备份覆盖 ST 侧', async () => {
    const vault = createMemFs();
    const { fs: absFs, io } = mkAbs();
    await absFs.writeText(ST_PATH, mkJsonl(2));
    const { story } = await performWriteback(vault, io, mkStory(5), 1700000000000);
    await restoreBackup(vault, io, story, story.writebacks![0].backupFile!);
    expect(parseJsonl(await absFs.readText(ST_PATH)).messages).toHaveLength(2);
  });

  it('备份写入失败时中止写回，不覆盖原 ST 文件', async () => {
    const baseVault = createMemFs();
    const vault = {
      ...baseVault,
      async writeText(path: string, content: string) {
        if (path.startsWith('.ste/写回备份/')) throw new Error('库磁盘已满');
        return baseVault.writeText(path, content);
      },
    };
    const { fs: absFs, io: baseIo } = mkAbs();
    await absFs.writeText(ST_PATH, mkJsonl(2));
    const writes: string[] = [];
    const io = {
      readText: baseIo.readText,
      async writeText(path: string, content: string) {
        writes.push(content);
        return baseIo.writeText(path, content);
      },
    };

    await expect(performWriteback(vault, io, mkStory(3), 1700000000000)).rejects.toThrow('磁盘已满');
    expect(writes).toEqual([]);
    expect(parseJsonl(await absFs.readText(ST_PATH)).messages).toHaveLength(2);
  });

  it('源文件读取失败但并非不存在时中止写回并透传原因', async () => {
    const vault = createMemFs();
    const writes: string[] = [];
    const io = {
      async readText() { throw new Error('ST 文件权限被拒绝'); },
      async writeText(_path: string, content: string) { writes.push(content); },
    };

    await expect(performWriteback(vault, io, mkStory(3), 1700000000000)).rejects.toThrow('权限被拒绝');
    expect(writes).toEqual([]);
  });

  it('备份成功但修剪失败时仍写回，并返回可见警告', async () => {
    const baseVault = createMemFs();
    const vault = {
      ...baseVault,
      async list(dir: string) {
        const entries = await baseVault.list(dir);
        return [
          ...entries,
          ...Array.from({ length: WRITEBACK_KEEP }, (_, index) => ({
            name: `old-${index}.jsonl`,
            isDir: false,
            size: 1,
          })),
        ];
      },
      async removeFile() { throw new Error('备份目录只读'); },
    };
    const { fs: absFs, io } = mkAbs();
    await absFs.writeText(ST_PATH, mkJsonl(2));

    const { story, backedUp, warning } = await performWriteback(vault, io, mkStory(3), 1700000000000);

    expect(backedUp).toBe(true);
    expect(warning).toContain('备份目录只读');
    expect(await vault.readText(story.writebacks![0].backupFile!)).toContain('第1楼');
    expect(parseJsonl(await absFs.readText(ST_PATH)).messages).toHaveLength(3);
  });

  it('恢复备份前先保护当前 ST 内容，保护文件写入失败时不覆盖', async () => {
    const baseVault = createMemFs();
    const backupFile = '.ste/写回备份/astory_wb/old.jsonl';
    await baseVault.writeText(backupFile, mkJsonl(2));
    const writes: string[] = [];
    const vault = {
      ...baseVault,
      async writeText(path: string, content: string) {
        if (path !== backupFile) throw new Error('保护备份失败');
        writes.push(content);
      },
    };
    const { fs: absFs, io: baseIo } = mkAbs();
    await absFs.writeText(ST_PATH, mkJsonl(5));
    const io = {
      readText: baseIo.readText,
      async writeText(path: string, content: string) {
        writes.push(content);
        return baseIo.writeText(path, content);
      },
    };

    await expect(restoreBackup(vault, io, mkStory(5), backupFile, 1700000000000)).rejects.toThrow('保护备份失败');
    expect(writes).toEqual([]);
    expect(parseJsonl(await absFs.readText(ST_PATH)).messages).toHaveLength(5);
  });
});
