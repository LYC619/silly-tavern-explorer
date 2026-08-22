/**
 * 立绘分行存取（10.3c，反馈 2.4#4）。
 *
 * 真源：ArchiveCharacter.portraitRows / portraitCurrentId（随 档案.json 或 IDB 记录整对象往返）。
 * - 网页版：图片存条目 dataBase64（IDB 同构，无文件系统）；
 * - 客户端：图片存 `角色/<名>/立绘/<行标题>/<文件名>`，条目只记 fileName；
 *   另派生 `立绘/立绘.json` 结构快照（只写不读，给用户看/手工迁移用）；
 *   用户手放的图（立绘/ 根目录或行文件夹里未记录的）扫描成「散图」只读展示，永不删改。
 * 设为卡面：立绘转 PNG（非 PNG 走 canvas）+ embedCharaInPng 嵌回卡数据 → 替换 pngBase64；
 * 旧卡面若不在立绘库里（portraitCurrentId 悬空）自动归档进固定「卡面」行。
 *
 * 所有变更函数返回 Partial<ArchiveCharacter> patch，由页面统一 patchCharacter 落库。
 */
import type { ArchiveCharacter, PortraitItem, PortraitRow } from '@/types/archive';
import { getActiveVault } from '@/lib/vault/active';
import type { VaultBackend } from '@/lib/vault/vault-backend';
import { safeName, ensureUnique } from '@/lib/vault/naming';
import { abToBase64 } from '@/lib/archive-db';
import { embedCharaInPng } from '@/lib/png-writer';

export const CARD_ROW_TITLE = '卡面';
export const DEFAULT_ROW_TITLE = '未分行';
export const STRAY_ROW_ID = '__stray__';
const PORTRAIT_DIR = '立绘';
const SNAPSHOT_FILE = '立绘.json';

const IMAGE_MIME: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
};

/** 文件名 → mime；非图片扩展返回 undefined */
export function mimeOfName(name: string): string | undefined {
  return IMAGE_MIME[name.split('.').pop()?.toLowerCase() ?? ''];
}

// ---------- 纯逻辑（单测覆盖） ----------

/** 行标题 → 客户端文件夹名 */
export function rowDirOf(title: string): string {
  return safeName(title, '未命名行');
}

/** 行标题冲突检查（标题重复或 safeName 后文件夹撞名）；返回冲突行，无冲突 undefined */
export function rowTitleConflict(rows: PortraitRow[], title: string, selfId?: string): PortraitRow | undefined {
  const dir = rowDirOf(title).toLowerCase();
  return rows.find((r) => r.id !== selfId && rowDirOf(r.title).toLowerCase() === dir);
}

/** 生成不冲突的行标题（新建分行用）：base、base·2、…（按客户端文件夹名比较） */
export function ensureRowTitle(rows: PortraitRow[], base: string): string {
  const taken = new Set(rows.map((r) => rowDirOf(r.title).toLowerCase()));
  let cand = base;
  for (let i = 2; taken.has(rowDirOf(cand).toLowerCase()); i++) cand = `${base}·${i}`;
  return cand;
}

/** 旧卡面归档（纯）：塞进「卡面」行（不存在则建），返回新数组，不改入参 */
export function archiveOldCard(
  rows: PortraitRow[],
  old: { name: string; fileName?: string; dataBase64?: string },
): PortraitRow[] {
  const item: PortraitItem = {
    id: crypto.randomUUID(),
    source: 'replaced',
    name: old.name,
    fileName: old.fileName,
    dataBase64: old.dataBase64,
    mime: 'image/png',
    addedAt: Date.now(),
  };
  const idx = rows.findIndex((r) => r.title === CARD_ROW_TITLE);
  if (idx < 0) return [...rows, { id: crypto.randomUUID(), title: CARD_ROW_TITLE, items: [item] }];
  const next = rows.slice();
  next[idx] = { ...next[idx], items: [...next[idx].items, item] };
  return next;
}

/** 当前卡面是否还在立绘库里（在 = 换卡面时旧图无需归档） */
export function currentStillInRows(c: Pick<ArchiveCharacter, 'portraitRows' | 'portraitCurrentId'>): boolean {
  const id = c.portraitCurrentId;
  return !!id && (c.portraitRows ?? []).some((r) => r.items.some((i) => i.id === id));
}

/** 散图设卡前提升为受管条目，使 portraitCurrentId 始终能指向真实 item。 */
export function promotePortraitItem(
  rows: PortraitRow[],
  item: PortraitViewItem,
  dataBase64?: string,
  fileName?: string,
): { rows: PortraitRow[]; itemId: string } {
  if (item.itemId) return { rows, itemId: item.itemId };
  const itemId = crypto.randomUUID();
  const managed: PortraitItem = {
    id: itemId,
    source: 'manual',
    name: item.name,
    mime: item.mime,
    dataBase64,
    fileName,
    addedAt: Date.now(),
  };
  const targetIndex = rows.findIndex((row) => row.id === item.rowId);
  if (targetIndex >= 0) {
    const next = rows.slice();
    next[targetIndex] = { ...next[targetIndex], items: [...next[targetIndex].items, managed] };
    return { rows: next, itemId };
  }
  const defaultIndex = rows.findIndex((row) => row.title === DEFAULT_ROW_TITLE);
  if (defaultIndex >= 0) {
    const next = rows.slice();
    next[defaultIndex] = { ...next[defaultIndex], items: [...next[defaultIndex].items, managed] };
    return { rows: next, itemId };
  }
  return {
    rows: [...rows, { id: crypto.randomUUID(), title: DEFAULT_ROW_TITLE, items: [managed] }],
    itemId,
  };
}

/** 扫描到的文件里筛出未被记录的（散图） */
export function strayOf(recorded: (string | undefined)[], found: string[]): string[] {
  const known = new Set(recorded.filter((f): f is string => !!f));
  return found.filter((f) => !known.has(f));
}

/** 撞名文件名唯一化：stem·2.ext */
export function uniqueFileName(taken: Iterable<string>, name: string): string {
  const dot = name.lastIndexOf('.');
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : '';
  const takenStems = [...taken]
    .filter((t) => t.toLowerCase().endsWith(ext.toLowerCase()))
    .map((t) => t.slice(0, t.length - ext.length));
  return ensureUnique(safeName(stem, '图片'), takenStems) + ext;
}

/** 立绘.json 快照内容（纯）：只写不读的派生结构，真源在 档案.json 的 portraitRows */
export function buildPortraitSnapshot(rows: PortraitRow[], currentId?: string): Record<string, unknown> {
  return {
    说明: 'STE 生成的立绘结构快照（只写不读）；条目真源在 档案.json 的 portraitRows，改这里不生效',
    当前卡面条目: currentId ?? null,
    行: rows.map((r) => ({
      标题: r.title,
      文件夹: rowDirOf(r.title),
      图片: r.items.map((i) => ({
        文件: i.fileName ?? '(网页版内嵌)',
        名称: i.name ?? i.fileName ?? '图片',
        来源: i.source === 'manual' ? '手动导入' : '替换自动存档',
        加入时间: new Date(i.addedAt).toLocaleString(),
      })),
    })),
  };
}

// ---------- IO（双后端） ----------

interface VaultCtx {
  vault: VaultBackend;
  /** 角色文件夹相对路径 */
  dir: string;
}

/** 客户端且角色已入库 → vault 上下文；否则 null（网页版走 IDB 分支） */
async function vaultCtx(characterId: string): Promise<VaultCtx | null> {
  const vault = getActiveVault();
  if (!vault) return null;
  const dir = await vault.pathOf('characters', characterId);
  return dir ? { vault, dir } : null;
}

const rowDirPath = (ctx: VaultCtx, title: string) => `${ctx.dir}/${PORTRAIT_DIR}/${rowDirOf(title)}`;

/** 客户端派生快照落盘（只写不读；网页版无操作） */
async function writeSnapshot(characterId: string, rows: PortraitRow[], currentId?: string): Promise<void> {
  const ctx = await vaultCtx(characterId);
  if (!ctx) return;
  await ctx.vault.fs.writeText(
    `${ctx.dir}/${PORTRAIT_DIR}/${SNAPSHOT_FILE}`,
    JSON.stringify(buildPortraitSnapshot(rows, currentId), null, 2),
  );
}

// ---------- 展示视图 ----------

export interface PortraitViewItem {
  /** 库内条目 id；散图无 */
  itemId?: string;
  name: string;
  source: PortraitItem['source'] | 'stray';
  /**
   * 已就绪的 data: URL，直接给 <img>。
   * 只有网页版内嵌图（dataBase64 已在记录里）开箱就有；客户端文件要
   * `loadPortraitImage()` 按需读，视图构建时**不读字节**。
   */
  url?: string;
  isCurrent: boolean;
  mime: string;
  /** 客户端文件相对路径（设为卡面时读字节）；网页版为空 */
  fsPath?: string;
  /** 网页版图片数据 */
  dataBase64?: string;
  /** 所在受管行；根目录散图用 STRAY_ROW_ID。 */
  rowId?: string;
}

export interface PortraitViewRow {
  rowId: string;
  title: string;
  items: PortraitViewItem[];
  /** 根目录散图虚拟行（不可改名/导入） */
  isStray?: boolean;
}

/**
 * 读出立绘展示视图：库内条目 + 客户端扫描散图。
 *
 * **不读图片字节**——客户端条目只记 `fsPath`，由 UI 滚进可视区再调 `loadPortraitImage()`。
 * 记录条目的文件在不在，改用行文件夹清单判断（散图扫描本来就要读这份清单，不多发 IO）；
 * 文件被用户挪走的条目照旧静默跳过，记录保留，放回即恢复。
 */
export async function loadPortraitViews(c: ArchiveCharacter): Promise<PortraitViewRow[]> {
  const rows = c.portraitRows ?? [];
  const ctx = await vaultCtx(c.id);
  const views: PortraitViewRow[] = [];

  for (const r of rows) {
    const items: PortraitViewItem[] = [];
    const dir = ctx ? rowDirPath(ctx, r.title) : '';
    const found = ctx ? (await ctx.vault.fs.list(dir)).filter((e) => !e.isDir) : [];
    // 记录条目按原文件名核对（不过 mime 筛，免得历史上扩展名怪一点的条目被判成丢失）
    const present = new Set(found.map((e) => e.name));
    for (const it of r.items) {
      const mime = it.mime ?? (it.fileName ? mimeOfName(it.fileName) : undefined) ?? 'image/png';
      if (it.dataBase64) {
        items.push({
          itemId: it.id, name: it.name ?? '图片', source: it.source, mime,
          url: `data:${mime};base64,${it.dataBase64}`, isCurrent: c.portraitCurrentId === it.id,
          dataBase64: it.dataBase64, rowId: r.id,
        });
      } else if (it.fileName && present.has(it.fileName)) {
        items.push({
          itemId: it.id, name: it.name ?? it.fileName, source: it.source, mime,
          isCurrent: c.portraitCurrentId === it.id, fsPath: `${dir}/${it.fileName}`, rowId: r.id,
        });
      }
    }
    // 行文件夹里用户手放的图 → 并入该行（只读散图）
    const strays = strayOf(r.items.map((i) => i.fileName), found.filter((e) => mimeOfName(e.name)).map((e) => e.name));
    for (const name of strays) {
      items.push({ name, source: 'stray', mime: mimeOfName(name)!, isCurrent: false, fsPath: `${dir}/${name}`, rowId: r.id });
    }
    views.push({ rowId: r.id, title: r.title, items });
  }

  // 立绘/ 根目录的图（10.3c 前的旧提示让用户放这里）→ 散图虚拟行
  if (ctx) {
    const rootDir = `${ctx.dir}/${PORTRAIT_DIR}`;
    const items: PortraitViewItem[] = (await ctx.vault.fs.list(rootDir))
      .filter((e) => !e.isDir && mimeOfName(e.name))
      .map((e) => ({
        name: e.name, source: 'stray' as const, mime: mimeOfName(e.name)!,
        isCurrent: false, fsPath: `${rootDir}/${e.name}`, rowId: STRAY_ROW_ID,
      }));
    if (items.length > 0) views.push({ rowId: STRAY_ROW_ID, title: '散图（立绘文件夹根目录）', items, isStray: true });
  }
  return views;
}

/**
 * 按需读一张立绘（缩略图滚进可视区时调）。网页版内嵌图直接返回已有 url；
 * 读失败返回 null——文件可能刚被用户挪走，由调用方显示读不到，不抛给页面。
 */
export async function loadPortraitImage(item: PortraitViewItem): Promise<string | null> {
  if (item.url) return item.url;
  const vault = getActiveVault();
  if (!item.fsPath || !vault) return null;
  try {
    return `data:${item.mime};base64,${await vault.fs.readBinary(item.fsPath)}`;
  } catch {
    return null;
  }
}

// ---------- 变更 ----------

/** 新建分行（调用方先用 rowTitleConflict 校验） */
export async function createPortraitRow(c: ArchiveCharacter, title: string): Promise<Partial<ArchiveCharacter>> {
  const rows = [...(c.portraitRows ?? []), { id: crypto.randomUUID(), title, items: [] }];
  await writeSnapshot(c.id, rows, c.portraitCurrentId);
  return { portraitRows: rows };
}

/** 行改名（客户端连文件夹一起 rename；目标文件夹已被用户占用时抛错，由 UI 提示） */
export async function renamePortraitRow(c: ArchiveCharacter, rowId: string, title: string): Promise<Partial<ArchiveCharacter>> {
  const old = (c.portraitRows ?? []).find((r) => r.id === rowId);
  if (!old || old.title === title) return {};
  const ctx = await vaultCtx(c.id);
  if (ctx) {
    const from = rowDirPath(ctx, old.title);
    const to = rowDirPath(ctx, title);
    if (from !== to && (await ctx.vault.fs.stat(from)).exists) await ctx.vault.fs.rename(from, to);
  }
  const rows = (c.portraitRows ?? []).map((r) => (r.id === rowId ? { ...r, title } : r));
  await writeSnapshot(c.id, rows, c.portraitCurrentId);
  return { portraitRows: rows };
}

/** Blob → 纯 base64（FileReader.readAsDataURL：浏览器/ jsdom 都在，且免大文件手动拼 binary string） */
function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result).replace(/^data:[^,]*,/, ''));
    r.onerror = () => rej(r.error);
    r.readAsDataURL(blob);
  });
}

/** 导入图片到行（rowId 为空 → 复用/新建「未分行」行）；客户端写行文件夹，网页版存 dataBase64 */
export async function addPortraitFiles(
  c: ArchiveCharacter,
  rowId: string | null,
  files: File[],
): Promise<{ patch: Partial<ArchiveCharacter>; ok: number; fail: number }> {
  let rows = (c.portraitRows ?? []).map((r) => ({ ...r, items: [...r.items] }));
  let row = rowId ? rows.find((r) => r.id === rowId) : rows.find((r) => r.title === DEFAULT_ROW_TITLE);
  if (!row) {
    if (rowId) return { patch: {}, ok: 0, fail: files.length }; // 行不存在（并发被删），不硬造
    row = { id: crypto.randomUUID(), title: DEFAULT_ROW_TITLE, items: [] };
    rows = [...rows, row];
  }
  const ctx = await vaultCtx(c.id);
  const dir = ctx ? rowDirPath(ctx, row.title) : '';
  const taken = ctx
    ? new Set((await ctx.vault.fs.list(dir)).map((e) => e.name))
    : new Set<string>();
  let ok = 0;
  let fail = 0;
  for (const file of files) {
    const mime = file.type || mimeOfName(file.name);
    if (!mime || !Object.values(IMAGE_MIME).includes(mime)) {
      fail++;
      continue;
    }
    try {
      const b64 = await blobToBase64(file);
      const item: PortraitItem = {
        id: crypto.randomUUID(), source: 'manual', name: file.name, mime, addedAt: Date.now(),
      };
      if (ctx) {
        const fileName = uniqueFileName(taken, file.name);
        await ctx.vault.fs.writeBinary(`${dir}/${fileName}`, b64);
        taken.add(fileName);
        item.fileName = fileName;
      } else {
        item.dataBase64 = b64;
      }
      row.items.push(item);
      ok++;
    } catch {
      fail++;
    }
  }
  await writeSnapshot(c.id, rows, c.portraitCurrentId);
  return { patch: { portraitRows: rows }, ok, fail };
}

/** base64 → ArrayBuffer（embedCharaInPng 入参用） */
function base64ToAb(b64: string): ArrayBuffer {
  const bytes = Uint8Array.from(atob(b64), (ch) => ch.charCodeAt(0));
  return bytes.buffer;
}

/** 非 PNG 图 → PNG base64（canvas 光栅化；透明度保留，动图取首帧） */
async function rasterToPngBase64(b64: string, mime: string): Promise<string> {
  const img = new Image();
  img.src = `data:${mime};base64,${b64}`;
  await img.decode();
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  canvas.getContext('2d')!.drawImage(img, 0, 0);
  const blob = await new Promise<Blob>((res, rej) =>
    canvas.toBlob((b) => (b ? res(b) : rej(new Error('canvas 转 PNG 失败'))), 'image/png'),
  );
  return blobToBase64(blob);
}

/**
 * 设为当前卡面：立绘 PNG 化 + 卡数据嵌回（chara chunk）→ 替换 pngBase64；
 * 旧卡面不在立绘库里时自动归档进「卡面」行（客户端写成文件，网页版存 dataBase64）。
 * 散图（itemId 为空）会先提升为受管条目，再记录 portraitCurrentId。
 */
export async function setPortraitAsCard(c: ArchiveCharacter, item: PortraitViewItem): Promise<Partial<ArchiveCharacter>> {
  const ctx = await vaultCtx(c.id);
  const srcB64 = item.dataBase64 ?? (item.fsPath ? await ctx!.vault.fs.readBinary(item.fsPath) : null);
  if (!srcB64) throw new Error('读不到立绘图片数据');
  const pngB64 = item.mime === 'image/png' ? srcB64 : await rasterToPngBase64(srcB64, item.mime);
  const embedded = embedCharaInPng(base64ToAb(pngB64), c.card);
  const newPng = abToBase64(embedded.buffer as ArrayBuffer);

  let rows = c.portraitRows ?? [];
  let currentId = item.itemId;
  if (!currentId) {
    const targetRow = rows.find((row) => row.id === item.rowId)
      ?? rows.find((row) => row.title === DEFAULT_ROW_TITLE);
    let fileName: string | undefined;
    if (ctx) {
      const dir = rowDirPath(ctx, targetRow?.title ?? DEFAULT_ROW_TITLE);
      const taken = new Set((await ctx.vault.fs.list(dir)).map((entry) => entry.name));
      fileName = uniqueFileName(taken, item.name);
      await ctx.vault.fs.writeBinary(`${dir}/${fileName}`, srcB64);
    }
    const promoted = promotePortraitItem(
      rows,
      { ...item, rowId: targetRow?.id },
      ctx ? undefined : srcB64,
      fileName,
    );
    rows = promoted.rows;
    currentId = promoted.itemId;
  }
  if (c.pngBase64 && !currentStillInRows(c)) {
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const name = `原卡面·${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}.png`;
    if (ctx) {
      const dir = rowDirPath(ctx, CARD_ROW_TITLE);
      const taken = new Set((await ctx.vault.fs.list(dir)).map((e) => e.name));
      const fileName = uniqueFileName(taken, name);
      await ctx.vault.fs.writeBinary(`${dir}/${fileName}`, c.pngBase64);
      rows = archiveOldCard(rows, { name: fileName, fileName });
    } else {
      rows = archiveOldCard(rows, { name, dataBase64: c.pngBase64 });
    }
  }
  await writeSnapshot(c.id, rows, currentId);
  return { pngBase64: newPng, portraitRows: rows, portraitCurrentId: currentId };
}
