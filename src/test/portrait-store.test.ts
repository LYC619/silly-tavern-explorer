/**
 * 立绘分行存取（10.3c）：纯逻辑（行名冲突/归档演算/散图差集/快照）
 * + 双后端落盘（网页版 dataBase64 / memFs 客户端行文件夹 + 立绘.json 快照 + 设为卡面归档）。
 */
import { afterEach, describe, expect, it } from 'vitest';
import type { ArchiveCharacter, PortraitItem, PortraitRow } from '@/types/archive';
import {
  rowDirOf, rowTitleConflict, ensureRowTitle, uniqueFileName, strayOf,
  archiveOldCard, currentStillInRows, buildPortraitSnapshot,
  promotePortraitItem,
  addPortraitFiles, setPortraitAsCard, createPortraitRow, renamePortraitRow, loadPortraitViews,
  renamePortraitItem, removePortraitItem, replacePortraitItem,
  CARD_ROW_TITLE, DEFAULT_ROW_TITLE, STRAY_ROW_ID,
} from '@/lib/portrait-store';
import { createMemFs } from '@/lib/vault/fs';
import { createVault } from '@/lib/vault/vault-backend';
import { setActiveVault } from '@/lib/vault/active';
import { saveCharacter } from '@/lib/archive-db';
import { __test } from '@/lib/png-writer';

afterEach(() => setActiveVault(null));

const { crc32 } = __test;

/** 最小合法 PNG（IHDR+IDAT+IEND，真 CRC）→ 纯 base64 */
function minimalPngBase64(): string {
  const writeU32 = (v: number) => [(v >>> 24) & 0xff, (v >>> 16) & 0xff, (v >>> 8) & 0xff, v & 0xff];
  const strBytes = (s: string) => Array.from(s).map((c) => c.charCodeAt(0) & 0xff);
  const bytes: number[] = [137, 80, 78, 71, 13, 10, 26, 10];
  const push = (type: string, data: number[]) => {
    bytes.push(...writeU32(data.length));
    const tb = strBytes(type);
    bytes.push(...tb, ...data, ...writeU32(crc32(new Uint8Array([...tb, ...data]))));
  };
  push('IHDR', [0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0]);
  push('IDAT', [0x78, 0x9c, 0x62, 0x00, 0x01, 0x00, 0x00, 0x05, 0x00, 0x01]);
  push('IEND', []);
  return btoa(String.fromCharCode(...bytes));
}

const row = (id: string, title: string, items: PortraitItem[] = []): PortraitRow => ({ id, title, items });
const item = (id: string, over: Partial<PortraitItem> = {}): PortraitItem => ({
  id, source: 'manual', addedAt: 1, ...over,
});

const baseChar = (over: Partial<ArchiveCharacter> = {}): ArchiveCharacter => ({
  id: 'c1',
  name: '奏枝',
  card: { name: '奏枝' } as ArchiveCharacter['card'],
  tags: [],
  status: '未开始',
  createdAt: 1,
  updatedAt: 1,
  ...over,
});

const pngFile = (name: string) =>
  new File([Uint8Array.from(atob(minimalPngBase64()), (c) => c.charCodeAt(0))], name, { type: 'image/png' });

// ---------- 纯逻辑 ----------

describe('rowTitleConflict / ensureRowTitle', () => {
  const rows = [row('r1', '日常'), row('r2', '战斗形态')];

  it('同名冲突，排除自己后不冲突', () => {
    expect(rowTitleConflict(rows, '日常')?.id).toBe('r1');
    expect(rowTitleConflict(rows, '日常', 'r1')).toBeUndefined();
    expect(rowTitleConflict(rows, '新行')).toBeUndefined();
  });

  it('safeName 后文件夹撞名也算冲突（日:常 与 日_常）', () => {
    expect(rowDirOf('日:常')).toBe('日_常');
    expect(rowTitleConflict([row('r1', '日_常')], '日:常')?.id).toBe('r1');
  });

  it('ensureRowTitle 顺延 ·2', () => {
    expect(ensureRowTitle([], '新分行')).toBe('新分行');
    expect(ensureRowTitle([row('r1', '新分行')], '新分行')).toBe('新分行·2');
    expect(ensureRowTitle([row('r1', '新分行'), row('r2', '新分行·2')], '新分行')).toBe('新分行·3');
  });
});

describe('uniqueFileName / strayOf', () => {
  it('不撞名保持原名，撞名 stem·2.ext（大小写不敏感）', () => {
    expect(uniqueFileName([], 'a.png')).toBe('a.png');
    expect(uniqueFileName(['a.png'], 'a.png')).toBe('a·2.png');
    expect(uniqueFileName(['A.PNG'], 'a.png')).toBe('a·2.png');
    expect(uniqueFileName(['a.png', 'a·2.png'], 'a.png')).toBe('a·3.png');
    expect(uniqueFileName(['a.jpg'], 'a.png')).toBe('a.png'); // 不同扩展不算撞
  });

  it('strayOf 求未记录差集', () => {
    expect(strayOf(['a.png', undefined], ['a.png', 'b.png', 'c.jpg'])).toEqual(['b.png', 'c.jpg']);
    expect(strayOf([], [])).toEqual([]);
  });
});

describe('archiveOldCard / currentStillInRows', () => {
  it('无「卡面」行时新建，有则追加', () => {
    const r1 = archiveOldCard([], { name: '旧卡.png', dataBase64: 'AAA' });
    expect(r1).toHaveLength(1);
    expect(r1[0].title).toBe(CARD_ROW_TITLE);
    expect(r1[0].items[0]).toMatchObject({ source: 'replaced', name: '旧卡.png', dataBase64: 'AAA' });

    const r2 = archiveOldCard(r1, { name: '旧卡2.png', fileName: '旧卡2.png' });
    expect(r2).toHaveLength(1);
    expect(r2[0].items).toHaveLength(2);
    // 不改入参
    expect(r1[0].items).toHaveLength(1);
  });

  it('currentStillInRows：条目在场才算', () => {
    const rows = [row('r1', '日常', [item('p1')])];
    expect(currentStillInRows({ portraitRows: rows, portraitCurrentId: 'p1' })).toBe(true);
    expect(currentStillInRows({ portraitRows: rows, portraitCurrentId: 'px' })).toBe(false);
    expect(currentStillInRows({ portraitRows: rows, portraitCurrentId: undefined })).toBe(false);
  });
});

describe('promotePortraitItem', () => {
  it('把散图提升为有 itemId 的受管条目', () => {
    const promoted = promotePortraitItem([], {
      name: '散图.png', source: 'stray', mime: 'image/png', url: 'data:image/png;base64,AAAA', isCurrent: false,
    }, 'AAAA');
    expect(promoted.itemId).toBeTruthy();
    expect(promoted.rows).toHaveLength(1);
    expect(promoted.rows[0].title).toBe(DEFAULT_ROW_TITLE);
    expect(promoted.rows[0].items[0]).toMatchObject({
      id: promoted.itemId,
      name: '散图.png',
      source: 'manual',
      dataBase64: 'AAAA',
    });
  });
});

describe('buildPortraitSnapshot', () => {
  it('行/文件夹/来源标签形状', () => {
    const snap = buildPortraitSnapshot(
      [row('r1', '日:常', [item('p1', { fileName: 'a.png', source: 'replaced' })])],
      'p1',
    ) as { 当前卡面条目: string; 行: { 标题: string; 文件夹: string; 图片: { 文件: string; 来源: string }[] }[] };
    expect(snap.当前卡面条目).toBe('p1');
    expect(snap.行[0].标题).toBe('日:常');
    expect(snap.行[0].文件夹).toBe('日_常');
    expect(snap.行[0].图片[0]).toMatchObject({ 文件: 'a.png', 来源: '替换自动存档' });
  });
});

// ---------- 网页版（无 vault：图片存条目 dataBase64） ----------

describe('网页版 addPortraitFiles / setPortraitAsCard', () => {
  it('导入进默认行（自动建/复用），图片进 dataBase64；非图片计 fail', async () => {
    const c = baseChar();
    const r1 = await addPortraitFiles(c, null, [pngFile('a.png')]);
    expect(r1.ok).toBe(1);
    const rows1 = r1.patch.portraitRows!;
    expect(rows1[0].title).toBe(DEFAULT_ROW_TITLE);
    expect(rows1[0].items[0].dataBase64).toBeTruthy();
    expect(rows1[0].items[0].fileName).toBeUndefined();

    const r2 = await addPortraitFiles({ ...c, portraitRows: rows1 }, null, [pngFile('b.png')]);
    expect(r2.patch.portraitRows).toHaveLength(1); // 复用默认行
    expect(r2.patch.portraitRows![0].items).toHaveLength(2);

    const bad = await addPortraitFiles(c, null, [new File(['hi'], 'x.txt', { type: 'text/plain' })]);
    expect(bad.ok).toBe(0);
    expect(bad.fail).toBe(1);
  });

  it('指定行不存在时不硬造，全部计 fail', async () => {
    const r = await addPortraitFiles(baseChar(), 'ghost', [pngFile('a.png')]);
    expect(r.ok).toBe(0);
    expect(r.fail).toBe(1);
  });

  it('设为卡面：pngBase64 替换（嵌 chara）+ 旧卡面归档；再换回时旧图在库不重复归档', async () => {
    const png = minimalPngBase64();
    const p1 = item('p1', { dataBase64: png, mime: 'image/png', name: '新立绘.png' });
    const c = baseChar({
      pngBase64: png,
      portraitRows: [row('r1', '日常', [p1])],
    });
    const patch = await setPortraitAsCard(c, {
      itemId: 'p1', name: '新立绘.png', source: 'manual', url: '', isCurrent: false,
      mime: 'image/png', dataBase64: png,
    });
    expect(patch.pngBase64).toBeTruthy();
    expect(patch.pngBase64).not.toBe(png); // 嵌入了 chara chunk
    expect(patch.portraitCurrentId).toBe('p1');
    const cardRow = patch.portraitRows!.find((r) => r.title === CARD_ROW_TITLE)!;
    expect(cardRow.items).toHaveLength(1);
    expect(cardRow.items[0]).toMatchObject({ source: 'replaced', dataBase64: png });

    // 换到归档出来的旧卡面：当前条目 p1 仍在库 → 不再归档
    const c2 = { ...c, ...patch } as ArchiveCharacter;
    const old = cardRow.items[0];
    const patch2 = await setPortraitAsCard(c2, {
      itemId: old.id, name: old.name!, source: 'replaced', url: '', isCurrent: false,
      mime: 'image/png', dataBase64: old.dataBase64,
    });
    const cardRow2 = patch2.portraitRows!.find((r) => r.title === CARD_ROW_TITLE)!;
    expect(cardRow2.items).toHaveLength(1); // 没多归档
    expect(patch2.portraitCurrentId).toBe(old.id);
  });

  it('支持网页端立绘重命名、替换和删除，并同步当前卡面指针', async () => {
    const c = baseChar({ portraitRows: [row('r1', '日常', [item('p1', { name: 'a.png', dataBase64: 'AAAA', mime: 'image/png' })])], portraitCurrentId: 'p1' });
    const renamed = await renamePortraitItem(c, 'p1', '新名.png');
    expect(renamed.portraitRows![0].items[0].name).toBe('新名.png');
    const replaced = await replacePortraitItem({ ...c, ...renamed } as ArchiveCharacter, 'p1', pngFile('b.png'));
    expect(replaced.portraitRows![0].items[0]).toMatchObject({ name: 'b.png', mime: 'image/png' });
    const removed = await removePortraitItem({ ...c, ...replaced } as ArchiveCharacter, 'p1');
    expect(removed.portraitCurrentId).toBeUndefined();
    expect(removed.portraitRows![0].items).toHaveLength(0);
  });
});

// ---------- 客户端（memFs 文件库：行文件夹 + 立绘.json 快照 + 散图扫描） ----------

async function setupVault() {
  const fs = createMemFs();
  const vault = createVault(fs);
  setActiveVault(vault);
  const c = baseChar();
  await saveCharacter(c); // 建 角色/奏枝/ + 索引
  return { fs, vault, c };
}

describe('客户端落盘', () => {
  it('导入写行文件夹 + 立绘.json 快照；撞名顺延', async () => {
    const { fs, c } = await setupVault();
    const { patch } = await createPortraitRow(c, '日常').then(async (p) => {
      const c2 = { ...c, ...p } as ArchiveCharacter;
      return addPortraitFiles(c2, c2.portraitRows![0].id, [pngFile('a.png'), pngFile('a.png')]);
    });
    const items = patch.portraitRows![0].items;
    expect(items.map((i) => i.fileName)).toEqual(['a.png', 'a·2.png']);
    expect(items[0].dataBase64).toBeUndefined(); // 客户端不进档案
    const dump = fs.dump();
    expect(dump['角色/奏枝/立绘/日常/a.png']).toBe('<binary>');
    expect(dump['角色/奏枝/立绘/日常/a·2.png']).toBe('<binary>');
    expect(dump['角色/奏枝/立绘/立绘.json']).toContain('日常');
  });

  it('行改名连文件夹一起搬', async () => {
    const { fs, c } = await setupVault();
    const p1 = await createPortraitRow(c, '日常');
    let c2 = { ...c, ...p1 } as ArchiveCharacter;
    const rowId = c2.portraitRows![0].id;
    const p2 = await addPortraitFiles(c2, rowId, [pngFile('a.png')]);
    c2 = { ...c2, ...p2.patch } as ArchiveCharacter;
    const p3 = await renamePortraitRow(c2, rowId, '校服');
    expect(p3.portraitRows![0].title).toBe('校服');
    const dump = fs.dump();
    expect(dump['角色/奏枝/立绘/校服/a.png']).toBe('<binary>');
    expect(dump['角色/奏枝/立绘/日常/a.png']).toBeUndefined();
  });

  it('散图：根目录与行文件夹里用户手放的图只读展示', async () => {
    const { fs, c } = await setupVault();
    const p1 = await createPortraitRow(c, '日常');
    const c2 = { ...c, ...p1 } as ArchiveCharacter;
    await fs.writeBinary('角色/奏枝/立绘/root.png', minimalPngBase64());
    await fs.writeBinary('角色/奏枝/立绘/日常/hand.png', minimalPngBase64());
    const views = await loadPortraitViews(c2);
    const dayRow = views.find((v) => v.title === '日常')!;
    expect(dayRow.items).toHaveLength(1);
    expect(dayRow.items[0]).toMatchObject({ name: 'hand.png', source: 'stray' });
    const stray = views.find((v) => v.rowId === STRAY_ROW_ID)!;
    expect(stray.isStray).toBe(true);
    expect(stray.items[0].name).toBe('root.png');
  });

  it('设为卡面：旧卡面归档成 立绘/卡面/ 下的文件', async () => {
    const { fs, c } = await setupVault();
    const png = minimalPngBase64();
    const p1 = await createPortraitRow(c, '日常');
    let c2 = { ...c, ...p1, pngBase64: png } as ArchiveCharacter;
    const p2 = await addPortraitFiles(c2, c2.portraitRows![0].id, [pngFile('a.png')]);
    c2 = { ...c2, ...p2.patch } as ArchiveCharacter;
    const views = await loadPortraitViews(c2);
    const target = views.find((v) => v.title === '日常')!.items[0];
    const patch = await setPortraitAsCard(c2, target);
    expect(patch.pngBase64).toBeTruthy();
    const archived = patch.portraitRows!.find((r) => r.title === CARD_ROW_TITLE)!.items[0];
    expect(archived.fileName).toMatch(/^原卡面·/);
    expect(fs.dump()[`角色/奏枝/立绘/卡面/${archived.fileName}`]).toBe('<binary>');
  });
});
