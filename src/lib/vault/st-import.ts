/**
 * 首次接入 SillyTavern（2.0 阶段7.3，定稿第八章「首次接入 ST」）——纯函数层，无 UI。
 *
 * 流程：指定 ST 目录 → scanSTUserDir 扫描列清单（数量/体积）→ 用户勾选 → importSelected
 * 复制进库并记来源路径（sourcePath），供 7.4 检查更新用。不全量强导。
 * 扫描范围：characters/*.png、chats/<角色>/*.jsonl、worlds/*.json、OpenAI Settings/*.json、
 * settings.json 中的全局正则与世界书关系，以及 extensions/assets 的递归原样归档清单。
 *
 * 约束：
 * - 传入的 VaultFs 以「用户所选目录」为根；选的是 ST 安装根目录（含 data/default-user
 *   子目录）时自动下钻，返回的所有相对路径都已带下钻前缀。
 * - 只读 ST 目录，绝不写（备份/写回是 7.5 的事）。目录缺失一律当空组，不抛错。
 * - 重复导入判定：同 sourcePath 的角色/故事/世界书已在库中 → 跳过并计数（skipped）；
 *   解析失败的文件单独计数（failed），两者在汇总里分开，UI 好解释。
 * - 已导入过的角色卡再跑一遍时，其名下新勾选的聊天仍会绑到「已存在的那个角色」上
 *   （按 sourcePath 找回原角色 id），不会产生第二个角色。
 * - 角色卡解析失败（PNG 无 chara/ccv3 块等）时，名下勾选的聊天降级为未绑定故事导入
 *   （进 临时/），聊天数据不因卡坏而丢。
 */
import type { VaultFs } from './fs';
import { joinPath } from './fs';
import { extractCharacterFromPngBuffer, normalizeCharacterCard } from '@/lib/png-parser';
import {
  buildCharacterFromCard,
  buildStoryFromSession,
  getAllArchiveStories,
  getAllCharacters,
  saveArchiveStory,
  saveCharacter,
} from '@/lib/archive-db';
import { parseJsonl } from '@/lib/adapters/st/chat-jsonl';
import { generateWorldBookId, parseWorldBook } from '@/types/worldbook';
import { getAllWorldBooks, saveWorldBook } from '@/lib/worldbook-db';
import type { WorldBookItem } from '@/types/worldbook';
import type { ChatSession, STMetadata } from '@/types/chat';
import { parsePreset } from '@/lib/preset-parser';
import { generatePresetId, type PresetItem } from '@/types/preset';
import { getAllPresets, savePreset } from '@/lib/preset-db';
import { parseSTRegexImport } from '@/lib/st-regex-interop';
import { buildRegexCollection, getAllRegexCollections, saveRegexCollection } from '@/lib/regex-db';
import { importEmbeddedAssets } from '@/lib/card-embedded-assets';
import { getActiveVault } from '@/lib/vault/active';
import type { ArchiveCharacter, ArchiveStory, AssetRef, STAssetRelation, UnresolvedAssetRef } from '@/types/archive';

// ---------- 扫描 ----------

export interface STScanChat {
  /** 文件名去 .jsonl（用作故事标题） */
  name: string;
  /** 相对所选目录的路径（含下钻前缀），如 'chats/赫敏/主线.jsonl' */
  path: string;
  size: number;
  /** chats/ 下的分组文件夹名（= ST 里的角色文件名） */
  characterDir: string;
}

export interface STScanCharacter {
  /** PNG 文件名去 .png（= ST 的角色标识） */
  name: string;
  pngPath: string;
  pngSize: number;
  /** 该角色名下的聊天（chats/<角色名>/*.jsonl） */
  chats: STScanChat[];
  /** 聊天总字节（清单显示体积用） */
  chatBytes: number;
}

export interface STScanWorldbook {
  /** 文件名去 .json（ST 世界书名即文件名） */
  name: string;
  path: string;
  size: number;
}

/** 预设：ST 的聊天补全预设在 OpenAI Settings/*.json（TextGen 等其他后端预设 STE 不认，不扫） */
export interface STScanPreset {
  name: string;
  path: string;
  size: number;
}

/** 全局正则：ST 不单独存文件，在 settings.json 的 extensions.regex 里（整组导入为一套规则集） */
export interface STScanRegex {
  /** settings.json 相对所选根的路径 */
  path: string;
  /** 脚本条数 */
  count: number;
}

export type STArchiveKind = 'extensions' | 'assets';

export interface STScanArchiveFile {
  /** 相对用户目录的完整来源路径。 */
  path: string;
  /** 相对 extensions/ 或 assets/ 的路径，归档时保持不变。 */
  relativePath: string;
  size: number;
}

export interface STScanArchiveGroup {
  kind: STArchiveKind;
  rootPath: string;
  files: STScanArchiveFile[];
  bytes: number;
}

export interface STScanRelationships {
  status: 'missing' | 'parsed' | 'invalid';
  settingsPath?: string;
  globalWorldbooks: string[];
  characterWorldbooks: Array<{ characterFile: string; worldbooks: string[] }>;
}

export interface STScanWarning {
  path: string;
  reason: 'symlink' | 'depth-limit' | 'unsafe-path';
}

export interface STScanResult {
  /** 实际扫描的用户目录（相对所选根）：直接选中用户目录时为 ''，选安装根时为 'data/default-user' */
  userDir: string;
  characters: STScanCharacter[];
  /** 散聊天：chats/ 下找不到同名角色卡的分组（卡被删/改名过），仍可导入为未绑定故事 */
  strayChats: STScanChat[];
  worldbooks: STScanWorldbook[];
  presets: STScanPreset[];
  /** null = settings.json 不存在/解析失败/没有全局正则脚本 */
  regex: STScanRegex | null;
  /** 不执行、不解析的扩展与媒体目录原样归档清单。 */
  archives: STScanArchiveGroup[];
  /** settings.json 中可恢复的世界书关系。 */
  relationships: STScanRelationships;
  /** 为保证根目录边界或遍历上限而未纳入扫描的项目。 */
  warnings: STScanWarning[];
}

function entryPath(dir: string, name: string): string {
  return dir ? `${dir}/${name}` : name;
}

function safeEntryName(name: string): boolean {
  return !!name && name !== '.' && name !== '..' && !name.includes('/') && !name.includes('\\');
}

/** 列出目录下指定扩展名的文件（目录不存在 = 空数组，VaultFs.list 已保证） */
async function listFiles(
  fs: VaultFs,
  dir: string,
  ext: string,
  warnings: STScanWarning[],
): Promise<{ name: string; path: string; size: number }[]> {
  const out: { name: string; path: string; size: number }[] = [];
  for (const e of await fs.list(dir)) {
    const path = entryPath(dir, e.name);
    if (!safeEntryName(e.name)) warnings.push({ path, reason: 'unsafe-path' });
    else if (e.isSymlink) warnings.push({ path, reason: 'symlink' });
    else if (!e.isDir && e.name.toLowerCase().endsWith(ext)) {
      out.push({ name: e.name.slice(0, -ext.length), path, size: e.size });
    }
  }
  return out;
}

async function listTreeFiles(fs: VaultFs, root: string, warnings: STScanWarning[]): Promise<STScanArchiveFile[]> {
  const out: STScanArchiveFile[] = [];
  const walk = async (dir: string, depth: number): Promise<void> => {
    if (depth > 32) {
      warnings.push({ path: dir, reason: 'depth-limit' });
      return;
    }
    for (const entry of await fs.list(dir)) {
      const rawPath = entryPath(dir, entry.name);
      if (!safeEntryName(entry.name)) {
        warnings.push({ path: rawPath, reason: 'unsafe-path' });
        continue;
      }
      const path = joinPath(dir, entry.name);
      if (entry.isSymlink) warnings.push({ path, reason: 'symlink' });
      else if (entry.isDir) await walk(path, depth + 1);
      else out.push({ path, relativePath: path.slice(root.length + 1), size: entry.size });
    }
  };
  await walk(root, 0);
  out.sort((a, b) => (a.relativePath < b.relativePath ? -1 : a.relativePath > b.relativePath ? 1 : 0));
  return out;
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((item): item is string => typeof item === 'string').map((item) => item.trim()).filter(Boolean))];
}

/**
 * 扫描 ST 用户目录，返回结构化清单。
 * fs 以用户所选目录为根；三个子目录（characters/chats/worlds）都不在、
 * 但存在 data/default-user 时视为选中了 ST 安装根目录，自动下钻。
 */
export async function scanSTUserDir(fs: VaultFs): Promise<STScanResult> {
  let userDir = '';
  const warnings: STScanWarning[] = [];
  const warned = new Set<string>();
  const warn = (warning: STScanWarning) => {
    const key = `${warning.reason}:${warning.path}`;
    if (!warned.has(key)) {
      warned.add(key);
      warnings.push(warning);
    }
  };
  const hasAny = async (base: string) => {
    const names = new Set(['characters', 'chats', 'worlds', 'extensions', 'assets', 'OpenAI Settings']);
    let found = false;
    for (const entry of await fs.list(base)) {
      if (!names.has(entry.name)) continue;
      if (entry.isSymlink) {
        warn({ path: joinPath(base, entry.name), reason: 'symlink' });
        continue;
      }
      if (entry.isDir) found = true;
    }
    return found;
  };
  if (!(await hasAny(''))) {
    const nested = 'data/default-user';
    const dataEntry = (await fs.list('')).find((entry) => entry.name === 'data');
    if (dataEntry?.isSymlink) warn({ path: 'data', reason: 'symlink' });
    else if (dataEntry?.isDir) {
      const userEntry = (await fs.list('data')).find((entry) => entry.name === 'default-user');
      if (userEntry?.isSymlink) warn({ path: nested, reason: 'symlink' });
      else if (userEntry?.isDir && (await hasAny(nested))) userDir = nested;
    }
  }
  const userEntries = await fs.list(userDir);
  const hasSafeDir = (name: string) => {
    const entry = userEntries.find((item) => item.name === name);
    return !!entry && safeEntryName(entry.name) && !entry.isSymlink && entry.isDir;
  };

  // 角色卡：characters/*.png
  const charFiles = hasSafeDir('characters')
    ? await listFiles(fs, joinPath(userDir, 'characters'), '.png', warnings)
    : [];
  const characters: STScanCharacter[] = charFiles.map((f) => ({
    name: f.name,
    pngPath: f.path,
    pngSize: f.size,
    chats: [],
    chatBytes: 0,
  }));
  // 聊天按角色归组：chats/<角色名>/*.jsonl；分组名与卡名匹配不区分大小写（Windows 文件系统语义）
  const byName = new Map(characters.map((c) => [c.name.toLowerCase(), c]));
  const strayChats: STScanChat[] = [];
  for (const e of hasSafeDir('chats') ? await fs.list(joinPath(userDir, 'chats')) : []) {
    const path = entryPath(joinPath(userDir, 'chats'), e.name);
    if (!safeEntryName(e.name)) {
      warnings.push({ path, reason: 'unsafe-path' });
      continue;
    }
    if (e.isSymlink) {
      warnings.push({ path, reason: 'symlink' });
      continue;
    }
    if (!e.isDir) continue;
    const files = await listFiles(fs, joinPath(userDir, 'chats', e.name), '.jsonl', warnings);
    const chats: STScanChat[] = files.map((f) => ({ ...f, characterDir: e.name }));
    const owner = byName.get(e.name.toLowerCase());
    if (owner) {
      owner.chats.push(...chats);
      owner.chatBytes += chats.reduce((s, c) => s + c.size, 0);
    } else {
      strayChats.push(...chats);
    }
  }
  // 世界书：worlds/*.json
  const worldbooks: STScanWorldbook[] = hasSafeDir('worlds')
    ? await listFiles(fs, joinPath(userDir, 'worlds'), '.json', warnings)
    : [];
  // 预设：OpenAI Settings/*.json（聊天补全预设，STE 能解析的那类）
  const presets: STScanPreset[] = hasSafeDir('OpenAI Settings')
    ? await listFiles(fs, joinPath(userDir, 'OpenAI Settings'), '.json', warnings)
    : [];
  // 全局正则：settings.json → extensions.regex（读失败/没有脚本 = null，不打扰）
  let regex: STScanRegex | null = null;
  let relationships: STScanRelationships = { status: 'missing', globalWorldbooks: [], characterWorldbooks: [] };
  const settingsPath = joinPath(userDir, 'settings.json');
  const settingsEntry = userEntries.find((entry) => entry.name === 'settings.json');
  if (settingsEntry?.isSymlink) warn({ path: settingsPath, reason: 'symlink' });
  else if (settingsEntry && !settingsEntry.isDir) {
    try {
      const settings = JSON.parse(await fs.readText(settingsPath)) as {
        extensions?: { regex?: unknown[] };
        world_info_settings?: { world_info?: { globalSelect?: unknown; charLore?: unknown } };
      };
      const scripts = settings.extensions?.regex;
      if (Array.isArray(scripts) && scripts.length > 0) regex = { path: settingsPath, count: scripts.length };
      const worldInfo = settings.world_info_settings?.world_info;
      const characterWorldbooks = Array.isArray(worldInfo?.charLore)
        ? worldInfo.charLore.flatMap((item) => {
            if (!item || typeof item !== 'object') return [];
            const row = item as { name?: unknown; extraBooks?: unknown };
            if (typeof row.name !== 'string' || !row.name.trim()) return [];
            const worldbooks = stringList(row.extraBooks);
            return worldbooks.length > 0 ? [{ characterFile: row.name.trim(), worldbooks }] : [];
          })
        : [];
      relationships = {
        status: 'parsed',
        settingsPath,
        globalWorldbooks: stringList(worldInfo?.globalSelect),
        characterWorldbooks,
      };
    } catch (err) {
      relationships = { status: 'invalid', settingsPath, globalWorldbooks: [], characterWorldbooks: [] };
      console.warn(`[st-import] settings.json 解析失败，跳过世界书关系与全局正则:`, err);
    }
  }

  // 码点序（不用 localeCompare：拼音排序依赖 ICU 数据，测试环境间不稳定）
  const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
  characters.sort((a, b) => cmp(a.name, b.name));
  for (const c of characters) c.chats.sort((a, b) => cmp(a.name, b.name));
  strayChats.sort((a, b) => cmp(a.name, b.name));
  worldbooks.sort((a, b) => cmp(a.name, b.name));
  presets.sort((a, b) => cmp(a.name, b.name));
  const archives: STScanArchiveGroup[] = [];
  for (const kind of ['extensions', 'assets'] as const) {
    const rootPath = joinPath(userDir, kind);
    const rootEntry = userEntries.find((entry) => entry.name === kind);
    if (rootEntry?.isSymlink) {
      warn({ path: rootPath, reason: 'symlink' });
      continue;
    }
    if (!rootEntry?.isDir) continue;
    const files = await listTreeFiles(fs, rootPath, warnings);
    if (files.length > 0) archives.push({ kind, rootPath, files, bytes: files.reduce((sum, file) => sum + file.size, 0) });
  }
  return { userDir, characters, strayChats, worldbooks, presets, regex, archives, relationships, warnings };
}

// ---------- 导入 ----------

export interface STImportPlan {
  /** 用户所选目录的绝对路径（与 createTauriFs 的 root 一致）；sourcePath = stRoot + '/' + 相对路径 */
  stRoot: string;
  /** 勾选的角色（连带各自勾选的聊天） */
  characters: Array<Pick<STScanCharacter, 'name' | 'pngPath'> & { chats: Array<Pick<STScanChat, 'name' | 'path'>> }>;
  /** 勾选的散聊天 → 未绑定故事（进 临时/） */
  strayChats: Array<Pick<STScanChat, 'name' | 'path'>>;
  worldbooks: Array<Pick<STScanWorldbook, 'name' | 'path'>>;
  presets: Array<Pick<STScanPreset, 'name' | 'path'>>;
  /** 勾选了全局正则时传入（一套规则集整组导入） */
  regex?: STScanRegex | null;
  /** 勾选的扩展/媒体目录，内部文件保持相对路径原样复制。 */
  archives?: STScanArchiveGroup[];
  /** 扫描时从 settings.json 读取的关系。 */
  relationships?: STScanRelationships;
  scanWarnings?: STScanWarning[];
}

export interface STUnresolvedRelationship {
  owner: string;
  name: string;
  relation: STAssetRelation | 'global';
  reason: 'missing' | 'ambiguous';
}

export interface STImportDetail {
  status: 'imported' | 'archived' | 'linked' | 'skipped' | 'failed' | 'unresolved';
  kind: string;
  name: string;
  sourcePath?: string;
  target?: string;
}

export interface STImportSummary {
  /** 新导入的角色数 */
  characters: number;
  /** 新导入的故事数（含绑定与未绑定） */
  stories: number;
  worldbooks: number;
  presets: number;
  /** 导入的正则规则集数（全局正则整组算 1） */
  regexes: number;
  /** 同 sourcePath 已在库中 → 跳过 */
  skipped: number;
  /** 文件解析失败 → 跳过（与 skipped 分开，toast 好解释） */
  failed: number;
  /** 已恢复的主绑定/额外/全局/对话级关系数。 */
  relationships: number;
  unresolvedRelationships: STUnresolvedRelationship[];
  /** extensions/assets 原样归档文件数与体积。 */
  archivedFiles: number;
  archiveBytes: number;
  /** 用户可核对的逐项结果；完整副本同时写入库内最近一次导入清单。 */
  details: STImportDetail[];
  scanWarnings: STScanWarning[];
}

/** ST 绝对来源路径：所选根（去尾部分隔符）+ '/' + 相对路径，与 createTauriFs 实际读的路径一致 */
function sourcePathOf(stRoot: string, rel: string): string {
  return `${stRoot.replace(/[\\/]+$/, '')}/${rel}`;
}

/** base64（无前缀）→ ArrayBuffer，解析 PNG 卡用 */
function base64ToArrayBuffer(b64: string): ArrayBuffer {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

function normalizedAssetName(name: string): string {
  return name.trim().replace(/\.json$/i, '').toLowerCase();
}

function normalizedCharacterFile(name: string): string {
  return name.trim().replace(/\.png$/i, '').toLowerCase();
}

function sourceStem(path: string): string {
  return path.replace(/\\/g, '/').split('/').pop()?.replace(/\.json$/i, '') ?? '';
}

function sameSourcePath(a: string, b: string): boolean {
  const normalize = (value: string) => value.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
  return normalize(a) === normalize(b);
}

function addRelation(refs: AssetRef[] | undefined, assetId: string, relation: STAssetRelation): AssetRef[] {
  const list = refs ?? [];
  const index = list.findIndex((ref) => ref.kind === 'worldbook' && ref.assetId === assetId);
  if (index < 0) return [...list, { kind: 'worldbook', assetId, relations: [relation] }];
  const current = list[index];
  if (current.relations?.includes(relation)) return list;
  const next = [...list];
  next[index] = { ...current, relations: [...(current.relations ?? []), relation] };
  return next;
}

function chatWorldbookNames(metadata?: STMetadata): string[] {
  const value = metadata?.chat_metadata?.world_info;
  if (typeof value === 'string') return value.trim() ? [value.trim()] : [];
  return stringList(value);
}

const ST_IMPORT_GUIDE = `# SillyTavern 导入说明

STE 只读取 SillyTavern 来源目录，导入不会移动、删除或改写来源文件。

| SillyTavern 来源 | STE 去向 | 处理方式 |
| --- | --- | --- |
| characters/*.png | 角色/<角色名>/ | 解析为角色档案，PNG 原件保留 |
| chats/<角色>/*.jsonl | 角色/<角色名>/故事/ 或 临时/ | 解析为故事，并保留原始元数据与消息字段 |
| worlds/*.json | 资产/世界书/ | 解析为世界书资产 |
| OpenAI Settings/*.json | 资产/预设/ | 解析为聊天补全预设 |
| settings.json -> extensions.regex | 资产/正则/ | 整组解析为全局正则规则集 |
| extensions/ | 资产/其他/SillyTavern/extensions/ | 原样复制，绝不执行扩展代码 |
| assets/ | 资产/其他/SillyTavern/assets/ | 原样复制并保持相对路径 |

角色卡主绑定、settings.json 额外链接与全局世界书、聊天元数据中的对话级世界书会优先连接当前 ST 根下 worlds/ 的同名来源文件。找不到或存在歧义的名称会列在最近一次导入清单中，不会猜测资产。settings.json 损坏时不会清理已有关系；不同 ST 根的全局标记分别记录来源。

扫描与实际文件操作都会拒绝符号链接、路径穿越名称和超过深度上限的目录，防止越出所选 ST 根；遗漏项会写入扫描警告。来源聊天或角色卡损坏时，重新扫描会保留已有关系并报告失败。角色专属派生世界书在来源关系未改变时不会被复扫换回原件。
`;

/**
 * 按勾选项执行导入。写入走 archive-db / worldbook-db 的保存入口
 * （createRepo 惰性代理：客户端落文件库，vitest 里 setActiveVault(内存库) 即可验证）。
 */
export async function importSelected(stFs: VaultFs, plan: STImportPlan): Promise<STImportSummary> {
  const summary: STImportSummary = {
    characters: 0,
    stories: 0,
    worldbooks: 0,
    presets: 0,
    regexes: 0,
    skipped: 0,
    failed: 0,
    relationships: 0,
    unresolvedRelationships: [],
    archivedFiles: 0,
    archiveBytes: 0,
    details: [],
    scanWarnings: plan.scanWarnings ?? [],
  };
  const detail = (item: STImportDetail) => summary.details.push(item);

  // 独立世界书必须先入库，角色卡与聊天随后才能把名称解析为稳定 id。
  const existingWorldbooks = await getAllWorldBooks();
  const wbSources = new Set(existingWorldbooks.map((w) => w.sourcePath).filter(Boolean));
  const worldbooks = [...existingWorldbooks];
  for (const wb of plan.worldbooks) {
    const src = sourcePathOf(plan.stRoot, wb.path);
    if (wbSources.has(src)) {
      summary.skipped++;
      detail({ status: 'skipped', kind: '世界书', name: wb.name, sourcePath: src });
      continue;
    }
    try {
      const json = JSON.parse(await stFs.readText(wb.path)) as Record<string, unknown>;
      const now = Date.now();
      const item: WorldBookItem = {
        id: generateWorldBookId(),
        title: wb.name,
        worldbook: parseWorldBook(json),
        sourcePath: src,
        createdAt: now,
        updatedAt: now,
      };
      await saveWorldBook(item);
      worldbooks.push(item);
      wbSources.add(src);
      summary.worldbooks++;
      detail({ status: 'imported', kind: '世界书', name: wb.name, sourcePath: src, target: '资产/世界书' });
    } catch (err) {
      console.warn(`[st-import] 世界书解析失败，跳过 ${wb.path}:`, err);
      summary.failed++;
      detail({ status: 'failed', kind: '世界书', name: wb.name, sourcePath: src });
    }
  }

  const normalizedRoot = plan.stRoot.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
  const isCurrentSource = (path?: string) => (
    !!path && path.replace(/\\/g, '/').toLowerCase().startsWith(`${normalizedRoot}/`)
  );
  const resolveWorldbook = (name: string): { book?: WorldBookItem; reason: 'missing' | 'ambiguous' } => {
    const key = normalizedAssetName(name);
    const currentSource = worldbooks.filter((book) => (
      isCurrentSource(book.sourcePath) && normalizedAssetName(sourceStem(book.sourcePath!)) === key
    ));
    if (currentSource.length === 1) return { book: currentSource[0], reason: 'missing' };
    if (currentSource.length > 1) return { reason: 'ambiguous' };

    const manual = worldbooks.filter((book) => (
      !book.sourcePath && !book.embedded && !book.derived && normalizedAssetName(book.title) === key
    ));
    if (manual.length === 1) return { book: manual[0], reason: 'missing' };
    const anyNamed = worldbooks.some((book) => (
      normalizedAssetName(book.title) === key
      || (!!book.sourcePath && normalizedAssetName(sourceStem(book.sourcePath)) === key)
    ));
    return { reason: manual.length > 1 || anyNamed ? 'ambiguous' : 'missing' };
  };
  const unresolved = (
    owner: string,
    name: string,
    relation: STAssetRelation | 'global',
    reason: 'missing' | 'ambiguous',
  ) => {
    summary.unresolvedRelationships.push({ owner, name, relation, reason });
    detail({ status: 'unresolved', kind: '世界书关联', name: `${owner} -> ${name}`, target: relation });
  };
  const linked = (owner: string, book: WorldBookItem, relation: STAssetRelation | 'global') => {
    summary.relationships++;
    detail({ status: 'linked', kind: '世界书关联', name: `${owner} -> ${book.title}`, target: relation });
  };

  // settings.json 全局世界书没有角色所有者，标记在世界书资产本身。
  if (plan.relationships?.status === 'parsed' && plan.relationships.settingsPath) {
    const settingsSource = sourcePathOf(plan.stRoot, plan.relationships.settingsPath);
    const selectedGlobal = new Set(plan.relationships.globalWorldbooks.map(normalizedAssetName));
    for (const book of worldbooks) {
      const sources = book.stGlobalSources ?? [];
      const sourceName = book.sourcePath ? normalizedAssetName(sourceStem(book.sourcePath)) : normalizedAssetName(book.title);
      if (sources.some((source) => sameSourcePath(source, settingsSource)) && !selectedGlobal.has(sourceName)) {
        book.stGlobalSources = sources.filter((source) => !sameSourcePath(source, settingsSource));
        book.stGlobal = book.stGlobalSources.length > 0;
        book.updatedAt = Date.now();
        await saveWorldBook(book);
      }
    }
    for (const name of plan.relationships.globalWorldbooks) {
      const resolved = resolveWorldbook(name);
      if (!resolved.book) {
        unresolved('全局', name, 'global', resolved.reason);
        continue;
      }
      const book = resolved.book;
      linked('全局', book, 'global');
      const sources = book.stGlobalSources ?? [];
      if (!sources.some((source) => sameSourcePath(source, settingsSource))) {
        book.stGlobalSources = [...sources, settingsSource];
        book.stGlobal = true;
        book.updatedAt = Date.now();
        await saveWorldBook(book);
      }
    }
  }

  // 现有库里按 sourcePath 建索引（重复导入判定）
  const existingCharacters = await getAllCharacters();
  const charBySource = new Map<string, ArchiveCharacter>();
  for (const character of existingCharacters) {
    if (character.sourcePath) charBySource.set(character.sourcePath, character);
  }
  const storyBySource = new Map<string, ArchiveStory>();
  for (const story of await getAllArchiveStories()) {
    if (story.sourcePath) storyBySource.set(story.sourcePath, story);
  }
  const presetSources = new Set((await getAllPresets()).map((p) => p.sourcePath).filter(Boolean));
  const regexSources = new Set((await getAllRegexCollections()).map((r) => r.sourcePath).filter(Boolean));

  const applyCharacterRelations = (
    character: ArchiveCharacter,
    scanName: string,
    primaryOverride?: string | null,
    reconcilePrimary = true,
  ): boolean => {
    const before = JSON.stringify([character.assets, character.unresolvedAssets]);
    const reconcileExtras = plan.relationships?.status === 'parsed';
    const existingRefs = character.assets ?? [];
    let refs = existingRefs.flatMap((ref) => {
      if (!ref.relations) return [ref];
      const relations = ref.relations.filter((relation) => (
        (!reconcilePrimary || relation !== 'primary') && (!reconcileExtras || relation !== 'extra')
      ));
      return relations.length > 0 ? [{ ...ref, relations }] : [];
    });
    const pending: UnresolvedAssetRef[] = [];
    let primary = reconcilePrimary ? primaryOverride ?? '' : '';
    if (reconcilePrimary && primaryOverride === undefined) {
      try {
        const value = normalizeCharacterCard(character.card).extensions.world;
        if (typeof value === 'string') primary = value.trim();
      } catch { /* 卡已成功导入但字段形状异常时不阻塞 */ }
    }
    const extras = (reconcileExtras ? plan.relationships?.characterWorldbooks ?? [] : [])
      .filter((row) => normalizedCharacterFile(row.characterFile) === normalizedCharacterFile(scanName))
      .flatMap((row) => row.worldbooks);
    for (const [name, relation] of [
      ...(reconcilePrimary && primary ? [[primary, 'primary' as const]] : []),
      ...extras.map((name) => [name, 'extra' as const] as const),
    ] as const) {
      const resolved = resolveWorldbook(name);
      if (resolved.book) {
        const derivedTarget = existingRefs
          .filter((ref) => ref.kind === 'worldbook' && ref.relations?.includes(relation))
          .map((ref) => worldbooks.find((book) => book.id === ref.assetId))
          .find((book) => (
            book?.derived?.derivedFrom === resolved.book!.id
            && book.derived.characterId === character.id
          ));
        const target = derivedTarget ?? resolved.book;
        refs = addRelation(refs, target.id, relation);
        linked(character.name, target, relation);
      } else {
        pending.push({ kind: 'worldbook', name, relation, reason: resolved.reason });
        unresolved(character.name, name, relation, resolved.reason);
      }
    }
    character.assets = refs.length > 0 ? refs : undefined;
    const preserved = (character.unresolvedAssets ?? []).filter((item) => (
      (!reconcilePrimary || item.relation !== 'primary') && (!reconcileExtras || item.relation !== 'extra')
    ));
    character.unresolvedAssets = [...preserved, ...pending];
    if (character.unresolvedAssets.length === 0) character.unresolvedAssets = undefined;
    return before !== JSON.stringify([character.assets, character.unresolvedAssets]);
  };

  const applyChatRelations = (story: ArchiveStory, names: string[]): boolean => {
    const before = JSON.stringify([story.assets, story.unresolvedAssets]);
    let refs = (story.assets ?? []).flatMap((ref) => {
      if (!ref.relations) return [ref];
      const relations = ref.relations.filter((relation) => relation !== 'chat');
      return relations.length > 0 ? [{ ...ref, relations }] : [];
    });
    const pending: UnresolvedAssetRef[] = [];
    for (const name of names) {
      const resolved = resolveWorldbook(name);
      if (resolved.book) {
        refs = addRelation(refs, resolved.book.id, 'chat');
        linked(story.title, resolved.book, 'chat');
      } else {
        pending.push({ kind: 'worldbook', name, relation: 'chat', reason: resolved.reason });
        unresolved(story.title, name, 'chat', resolved.reason);
      }
    }
    story.assets = refs.length > 0 ? refs : undefined;
    const preserved = (story.unresolvedAssets ?? []).filter((item) => item.relation !== 'chat');
    story.unresolvedAssets = [...preserved, ...pending];
    if (story.unresolvedAssets.length === 0) story.unresolvedAssets = undefined;
    return before !== JSON.stringify([story.assets, story.unresolvedAssets]);
  };

  /** 导入一条聊天为归档故事；characterId 省略 = 未绑定。返回是否计入 stories */
  const importChat = async (chat: Pick<STScanChat, 'name' | 'path'>, fallbackCharName: string, characterId?: string) => {
    const src = sourcePathOf(plan.stRoot, chat.path);
    const existingStory = storyBySource.get(src);
    if (existingStory) {
      summary.skipped++;
      detail({ status: 'skipped', kind: '聊天', name: chat.name, sourcePath: src });
      try {
        const { messages, metadata, diagnostics } = parseJsonl(await stFs.readText(chat.path));
        if (!metadata || messages.length === 0 || diagnostics.invalidLines > 0) {
          throw new Error(`聊天文件不完整（坏行 ${diagnostics.invalidLines}）`);
        }
        if (applyChatRelations(existingStory, chatWorldbookNames(metadata))) {
          existingStory.updatedAt = Date.now();
          await saveArchiveStory(existingStory);
        }
      } catch (err) {
        console.warn(`[st-import] 已有聊天的关系刷新失败，保留原关系 ${chat.path}:`, err);
        summary.failed++;
        detail({ status: 'failed', kind: '聊天关系', name: chat.name, sourcePath: src });
      }
      return;
    }
    try {
      const { messages, metadata } = parseJsonl(await stFs.readText(chat.path));
      if (messages.length === 0) throw new Error('空聊天文件');
      const session: ChatSession = {
        id: crypto.randomUUID(),
        title: chat.name,
        messages,
        character: { name: metadata?.character_name || fallbackCharName },
        user: { name: metadata?.user_name || 'User' },
        createdAt: Date.now(),
        rawMetadata: metadata,
      };
      const story = buildStoryFromSession(session, characterId);
      story.sourcePath = src;
      story.lastImportedAt = Date.now();
      applyChatRelations(story, chatWorldbookNames(metadata));
      await saveArchiveStory(story);
      storyBySource.set(src, story);
      summary.stories++;
      detail({ status: 'imported', kind: '聊天', name: chat.name, sourcePath: src, target: characterId ? '角色故事' : '临时故事' });
    } catch (err) {
      console.warn(`[st-import] 聊天解析失败，跳过 ${chat.path}:`, err);
      summary.failed++;
      detail({ status: 'failed', kind: '聊天', name: chat.name, sourcePath: src });
    }
  };

  // 角色卡（先导卡拿到 id，聊天才有绑定目标）
  for (const c of plan.characters) {
    const src = sourcePathOf(plan.stRoot, c.pngPath);
    let character = charBySource.get(src);
    let charId = character?.id;
    if (character) {
      summary.skipped++; // 卡已导入过：不重复建，但名下新聊天仍绑到原角色
      detail({ status: 'skipped', kind: '角色卡', name: c.name, sourcePath: src });
      let primaryOverride: string | null | undefined;
      let reconcilePrimary = true;
      try {
        const latestCard = extractCharacterFromPngBuffer(base64ToArrayBuffer(await stFs.readBinary(c.pngPath)));
        const value = normalizeCharacterCard(latestCard).extensions.world;
        primaryOverride = typeof value === 'string' && value.trim() ? value.trim() : null;
      } catch (err) {
        reconcilePrimary = false;
        console.warn(`[st-import] 已有角色卡的主绑定刷新失败，保留原关系 ${c.pngPath}:`, err);
        summary.failed++;
        detail({ status: 'failed', kind: '角色卡关系', name: c.name, sourcePath: src });
      }
      if (applyCharacterRelations(character, c.name, primaryOverride, reconcilePrimary)) {
        character.updatedAt = Date.now();
        await saveCharacter(character);
      }
    } else {
      try {
        const base64 = await stFs.readBinary(c.pngPath);
        const card = extractCharacterFromPngBuffer(base64ToArrayBuffer(base64));
        character = buildCharacterFromCard(card, base64);
        character.sourcePath = src;
        // 卡内嵌世界书/正则自动入库并挂关联（阶段9.5）
        const refs = await importEmbeddedAssets(character);
        if (refs.length > 0) {
          character.assets = refs.map((ref) => ({ ...ref, relations: ['embedded'] }));
          for (const ref of refs) detail({ status: 'linked', kind: ref.kind === 'worldbook' ? '内嵌世界书' : '内嵌正则', name: character.name, target: ref.assetId });
        }
        applyCharacterRelations(character, c.name);
        await saveCharacter(character);
        charBySource.set(src, character);
        charId = character.id;
        summary.characters++;
        detail({ status: 'imported', kind: '角色卡', name: c.name, sourcePath: src, target: '角色档案' });
      } catch (err) {
        console.warn(`[st-import] 角色卡解析失败，其聊天降级为未绑定导入 ${c.pngPath}:`, err);
        summary.failed++;
        detail({ status: 'failed', kind: '角色卡', name: c.name, sourcePath: src });
      }
    }
    for (const chat of c.chats) await importChat(chat, c.name, charId);
  }

  // 散聊天：未绑定故事（落 临时/）
  for (const chat of plan.strayChats) await importChat(chat, 'Character');

  // 预设（OpenAI Settings 聊天补全预设）
  for (const p of plan.presets) {
    const src = sourcePathOf(plan.stRoot, p.path);
    if (presetSources.has(src)) {
      summary.skipped++;
      detail({ status: 'skipped', kind: '预设', name: p.name, sourcePath: src });
      continue;
    }
    try {
      const preset = parsePreset(JSON.parse(await stFs.readText(p.path)));
      const now = Date.now();
      const item: PresetItem = {
        id: generatePresetId(),
        title: p.name,
        preset,
        sourcePath: src,
        createdAt: now,
        updatedAt: now,
      };
      await savePreset(item);
      presetSources.add(src);
      summary.presets++;
      detail({ status: 'imported', kind: '预设', name: p.name, sourcePath: src, target: '资产/预设' });
    } catch (err) {
      console.warn(`[st-import] 预设解析失败，跳过 ${p.path}:`, err);
      summary.failed++;
      detail({ status: 'failed', kind: '预设', name: p.name, sourcePath: src });
    }
  }

  // 全局正则：settings.json → extensions.regex，整组导入为一套规则集
  if (plan.regex) {
    const src = sourcePathOf(plan.stRoot, plan.regex.path);
    if (regexSources.has(src)) {
      summary.skipped++;
      detail({ status: 'skipped', kind: '全局正则', name: 'ST 全局正则', sourcePath: src });
    } else {
      try {
        const settings = JSON.parse(await stFs.readText(plan.regex.path)) as {
          extensions?: { regex?: unknown[] };
        };
        const rules = parseSTRegexImport(settings.extensions?.regex ?? []);
        if (rules.length === 0) throw new Error('settings.json 里没有全局正则脚本');
        const item = { ...buildRegexCollection('ST 全局正则', rules), sourcePath: src };
        await saveRegexCollection(item);
        summary.regexes++;
        detail({ status: 'imported', kind: '全局正则', name: 'ST 全局正则', sourcePath: src, target: '资产/正则' });
      } catch (err) {
        console.warn(`[st-import] 全局正则解析失败，跳过 ${plan.regex.path}:`, err);
        summary.failed++;
        detail({ status: 'failed', kind: '全局正则', name: 'ST 全局正则', sourcePath: src });
      }
    }
  }

  // 扩展与媒体只做二进制原样复制，不加载、不执行，也不尝试解释未知插件格式。
  const vaultFs = getActiveVault()?.fs;
  for (const group of plan.archives ?? []) {
    for (const file of group.files) {
      const src = sourcePathOf(plan.stRoot, file.path);
      const target = joinPath('资产/其他/SillyTavern', group.kind, file.relativePath);
      try {
        if (!vaultFs) throw new Error('当前未激活客户端文件库');
        await vaultFs.writeBinary(target, await stFs.readBinary(file.path));
        summary.archivedFiles++;
        summary.archiveBytes += file.size;
        detail({ status: 'archived', kind: group.kind, name: file.relativePath, sourcePath: src, target });
      } catch (err) {
        console.warn(`[st-import] 原样归档失败 ${file.path}:`, err);
        summary.failed++;
        detail({ status: 'failed', kind: group.kind, name: file.relativePath, sourcePath: src, target });
      }
    }
  }

  const selectedAnything = plan.characters.length + plan.strayChats.length + plan.worldbooks.length + plan.presets.length
    + (plan.regex ? 1 : 0) + (plan.archives?.reduce((sum, group) => sum + group.files.length, 0) ?? 0)
    + (plan.relationships?.status === 'parsed' ? 1 : 0) > 0;
  if (vaultFs && selectedAnything) {
    try {
      const guidePath = '说明/SillyTavern 导入说明.md';
      if (!(await vaultFs.stat(guidePath)).exists) await vaultFs.writeText(guidePath, ST_IMPORT_GUIDE);
      await vaultFs.writeText('说明/SillyTavern 最近一次导入.json', JSON.stringify({
        sourceRoot: plan.stRoot,
        importedAt: new Date().toISOString(),
        summary,
      }, null, 2));
    } catch (err) {
      console.warn('[st-import] 写入导入说明/清单失败:', err);
      summary.failed++;
      detail({ status: 'failed', kind: '导入清单', name: '说明/SillyTavern 最近一次导入.json' });
    }
  }

  return summary;
}
