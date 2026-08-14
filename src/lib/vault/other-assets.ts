import type { VaultEntry, VaultFs } from './fs';
import { joinPath } from './fs';

export const OTHER_ASSET_ROOT = '资产/其他/SillyTavern';
export const TEXT_PREVIEW_LIMIT = 512 * 1024;
export const IMAGE_PREVIEW_LIMIT = 12 * 1024 * 1024;

export type OtherAssetCategoryId =
  | 'extensions'
  | 'assets'
  | 'quick-replies'
  | 'personas'
  | 'backgrounds'
  | 'appearance'
  | 'user-media';

export interface OtherAssetCategoryMeta {
  id: OtherAssetCategoryId;
  label: string;
  description: string;
  relativePath: string;
}

export interface OtherAssetCategorySummary extends OtherAssetCategoryMeta {
  count: number;
}

export const OTHER_ASSET_CATEGORIES: readonly OtherAssetCategoryMeta[] = [
  { id: 'extensions', label: '扩展', description: '查看扩展清单、版本与归档源码', relativePath: 'extensions' },
  { id: 'assets', label: '扩展资产', description: '浏览扩展资产文件，保持原相对路径', relativePath: 'assets' },
  { id: 'quick-replies', label: '快速回复', description: '直接核对回复选项与命令正文', relativePath: 'quick-replies' },
  { id: 'personas', label: '用户人设', description: '查看用户名称、头像、描述与关联', relativePath: 'personas' },
  { id: 'backgrounds', label: '背景', description: '浏览并预览聊天背景图片', relativePath: 'backgrounds' },
  { id: 'appearance', label: '主题与布局', description: '查看主题配色和界面布局配置', relativePath: 'appearance' },
  { id: 'user-media', label: '用户媒体', description: '浏览用户图片、文件与工作流', relativePath: 'user-media' },
] as const;

export interface ArchivedExtension {
  directory: string;
  name: string;
  version?: string;
  author?: string;
  description?: string;
  homepage?: string;
  path: string;
  manifestPath?: string;
  manifestError?: string;
}

export interface QuickReplyItem {
  id: string;
  label: string;
  title?: string;
  message: string;
  preventAutoExecute: boolean;
  hidden: boolean;
  triggers: string[];
}

export interface QuickReplySet {
  path: string;
  fileName: string;
  name: string;
  disableSend: boolean;
  placeBeforeInput: boolean;
  injectInput: boolean;
  color?: string;
  items: QuickReplyItem[];
  parseError?: string;
}

export interface ArchivedPersona {
  fileName: string;
  name: string;
  description: string;
  title?: string;
  position?: number;
  depth?: number;
  role?: number;
  lorebook?: string;
  avatarPath?: string;
}

export type ArchivePreviewKind = 'directory' | 'json' | 'text' | 'image' | 'unsupported';

export interface ArchiveFileItem extends VaultEntry {
  path: string;
  relativePath: string;
  preview: ArchivePreviewKind;
}

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringField(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function numberField(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function boolField(value: unknown): boolean {
  return value === true;
}

function withoutExtension(name: string): string {
  return name.replace(/\.[^.]+$/, '');
}

function archivePath(relativePath = ''): string {
  const parts = relativePath.replace(/\\/g, '/').split('/').filter(Boolean);
  if (parts.some((part) => part === '.' || part === '..')) throw new Error('归档路径越界');
  return joinPath(OTHER_ASSET_ROOT, ...parts);
}

async function readJson(fs: VaultFs, path: string): Promise<unknown> {
  return JSON.parse(await fs.readText(path)) as unknown;
}

async function safeList(fs: VaultFs, path: string): Promise<VaultEntry[]> {
  try {
    return (await fs.list(path)).filter((entry) => !entry.isSymlink);
  } catch {
    return [];
  }
}

function authorField(value: unknown): string | undefined {
  if (typeof value === 'string') return stringField(value);
  return isRecord(value) ? stringField(value.name) : undefined;
}

function homepageField(record: UnknownRecord): string | undefined {
  const direct = stringField(record.homePage) ?? stringField(record.homepage);
  if (direct) return direct;
  if (typeof record.repository === 'string') return stringField(record.repository);
  return isRecord(record.repository) ? stringField(record.repository.url) : undefined;
}

function extensionFromRecord(directory: string, record: UnknownRecord): ArchivedExtension {
  return {
    directory,
    name: stringField(record.display_name) ?? stringField(record.name) ?? directory,
    version: stringField(record.version),
    author: authorField(record.author),
    description: stringField(record.description),
    homepage: homepageField(record),
    path: archivePath(joinPath('extensions', directory)),
  };
}

async function loadExtension(fs: VaultFs, directory: string): Promise<ArchivedExtension> {
  const root = archivePath(joinPath('extensions', directory));
  const manifestPath = joinPath(root, 'manifest.json');
  const packagePath = joinPath(root, 'package.json');
  let manifestError: string | undefined;

  try {
    const raw = await readJson(fs, manifestPath);
    if (!isRecord(raw)) throw new Error('manifest root is not an object');
    return { ...extensionFromRecord(directory, raw), manifestPath };
  } catch {
    const manifestExists = (await fs.stat(manifestPath).catch(() => ({ exists: false, isDir: false }))).exists;
    if (manifestExists) manifestError = '清单格式异常';
  }

  try {
    const raw = await readJson(fs, packagePath);
    if (!isRecord(raw)) throw new Error('package root is not an object');
    return { ...extensionFromRecord(directory, raw), manifestPath: packagePath, manifestError };
  } catch {
    return {
      directory,
      name: directory,
      path: root,
      manifestError,
    };
  }
}

export async function loadExtensions(fs: VaultFs): Promise<ArchivedExtension[]> {
  const root = archivePath('extensions');
  const directories = (await safeList(fs, root)).filter((entry) => entry.isDir);
  return Promise.all(directories.map((entry) => loadExtension(fs, entry.name)));
}

const QUICK_REPLY_TRIGGERS: Array<[key: string, label: string]> = [
  ['executeOnStartup', '启动时'],
  ['executeOnUser', '用户消息后'],
  ['executeOnAi', 'AI 消息后'],
  ['executeOnChatChange', '切换聊天时'],
  ['executeOnNewChat', '新聊天时'],
  ['executeBeforeGeneration', '生成前'],
];

function parseQuickReplyItem(raw: unknown, index: number): QuickReplyItem {
  const record = isRecord(raw) ? raw : {};
  const title = stringField(record.title);
  return {
    id: String(record.id ?? index + 1),
    label: stringField(record.label) ?? title ?? `回复 ${index + 1}`,
    title,
    message: typeof record.message === 'string' ? record.message : '',
    preventAutoExecute: boolField(record.preventAutoExecute),
    hidden: boolField(record.isHidden),
    triggers: QUICK_REPLY_TRIGGERS.filter(([key]) => record[key] === true).map(([, label]) => label),
  };
}

async function loadQuickReplySet(fs: VaultFs, entry: VaultEntry): Promise<QuickReplySet> {
  const path = archivePath(joinPath('quick-replies', entry.name));
  const fallback: QuickReplySet = {
    path,
    fileName: entry.name,
    name: withoutExtension(entry.name),
    disableSend: false,
    placeBeforeInput: false,
    injectInput: false,
    items: [],
  };
  try {
    const raw = await readJson(fs, path);
    if (!isRecord(raw)) throw new Error('quick reply root is not an object');
    return {
      ...fallback,
      name: stringField(raw.name) ?? fallback.name,
      disableSend: boolField(raw.disableSend),
      placeBeforeInput: boolField(raw.placeBeforeInput),
      injectInput: boolField(raw.injectInput),
      color: stringField(raw.color),
      items: Array.isArray(raw.qrList) ? raw.qrList.map(parseQuickReplyItem) : [],
    };
  } catch {
    return { ...fallback, parseError: 'JSON 格式异常' };
  }
}

export async function loadQuickReplySets(fs: VaultFs): Promise<QuickReplySet[]> {
  const root = archivePath('quick-replies');
  const files = (await safeList(fs, root)).filter((entry) => !entry.isDir && entry.name.toLowerCase().endsWith('.json'));
  return Promise.all(files.map((entry) => loadQuickReplySet(fs, entry)));
}

export async function loadPersonas(fs: VaultFs): Promise<ArchivedPersona[]> {
  const manifestPath = archivePath('personas/personas.json');
  let raw: unknown;
  try {
    raw = await readJson(fs, manifestPath);
  } catch {
    return [];
  }
  if (!isRecord(raw) || !isRecord(raw.personas)) return [];
  const descriptions = isRecord(raw.personaDescriptions) ? raw.personaDescriptions : {};
  const avatarRoot = archivePath('personas/avatars');
  const avatarNames = new Set((await safeList(fs, avatarRoot)).filter((entry) => !entry.isDir).map((entry) => entry.name));

  return Object.entries(raw.personas).map(([fileName, rawName]) => {
    const detail = isRecord(descriptions[fileName]) ? descriptions[fileName] : {};
    return {
      fileName,
      name: stringField(rawName) ?? withoutExtension(fileName),
      description: typeof detail.description === 'string' ? detail.description : '',
      title: stringField(detail.title),
      position: numberField(detail.position),
      depth: numberField(detail.depth),
      role: numberField(detail.role),
      lorebook: stringField(detail.lorebook),
      avatarPath: avatarNames.has(fileName) ? joinPath(avatarRoot, fileName) : undefined,
    };
  });
}

async function countImmediateFiles(fs: VaultFs, relativePath: string): Promise<number> {
  return (await safeList(fs, archivePath(relativePath))).filter((entry) => !entry.isDir).length;
}

async function countFilesOneLevel(fs: VaultFs, relativePath: string): Promise<number> {
  const root = archivePath(relativePath);
  const entries = await safeList(fs, root);
  const nested = await Promise.all(entries.filter((entry) => entry.isDir).map((entry) => safeList(fs, joinPath(root, entry.name))));
  return entries.filter((entry) => !entry.isDir).length
    + nested.reduce((sum, children) => sum + children.filter((entry) => !entry.isDir).length, 0);
}

export async function loadOtherAssetOverview(fs: VaultFs): Promise<OtherAssetCategorySummary[]> {
  const [extensions, assets, quickReplies, personas, backgrounds, appearance, userMedia] = await Promise.all([
    safeList(fs, archivePath('extensions')).then((entries) => entries.filter((entry) => entry.isDir).length),
    countFilesOneLevel(fs, 'assets'),
    countImmediateFiles(fs, 'quick-replies'),
    loadPersonas(fs).then((items) => items.length),
    countImmediateFiles(fs, 'backgrounds'),
    countFilesOneLevel(fs, 'appearance'),
    countFilesOneLevel(fs, 'user-media'),
  ]);
  const counts: Record<OtherAssetCategoryId, number> = {
    extensions,
    assets,
    'quick-replies': quickReplies,
    personas,
    backgrounds,
    appearance,
    'user-media': userMedia,
  };
  return OTHER_ASSET_CATEGORIES.map((category) => ({ ...category, count: counts[category.id] }));
}

const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp']);
const JSON_EXTENSIONS = new Set(['json']);
const TEXT_EXTENSIONS = new Set([
  'txt', 'md', 'markdown', 'js', 'mjs', 'cjs', 'jsx', 'ts', 'tsx', 'css', 'scss', 'less',
  'html', 'htm', 'xml', 'yml', 'yaml', 'toml', 'ini', 'log', 'csv', 'gitignore',
]);

export function classifyArchivePreview(file: { name: string; size: number; isDir?: boolean }): ArchivePreviewKind {
  if (file.isDir) return 'directory';
  const lower = file.name.toLowerCase();
  const extension = lower.includes('.') ? lower.split('.').pop() ?? '' : '';
  if (IMAGE_EXTENSIONS.has(extension)) return file.size <= IMAGE_PREVIEW_LIMIT ? 'image' : 'unsupported';
  if (JSON_EXTENSIONS.has(extension)) return file.size <= TEXT_PREVIEW_LIMIT ? 'json' : 'unsupported';
  if (TEXT_EXTENSIONS.has(extension) || /^readme(?:\.|$)/i.test(file.name)) {
    return file.size <= TEXT_PREVIEW_LIMIT ? 'text' : 'unsupported';
  }
  return 'unsupported';
}

export async function listArchiveDirectory(fs: VaultFs, relativePath: string): Promise<ArchiveFileItem[]> {
  const normalized = relativePath.replace(/\\/g, '/').split('/').filter(Boolean).join('/');
  const root = archivePath(normalized);
  const entries = (await fs.list(root)).filter((entry) => !entry.isSymlink);
  return entries.map((entry) => ({
    ...entry,
    path: joinPath(root, entry.name),
    relativePath: joinPath(normalized, entry.name),
    preview: classifyArchivePreview(entry),
  }));
}

export function imageMimeType(name: string): string {
  const extension = name.toLowerCase().split('.').pop();
  if (extension === 'jpg' || extension === 'jpeg') return 'image/jpeg';
  if (extension === 'gif') return 'image/gif';
  if (extension === 'webp') return 'image/webp';
  if (extension === 'bmp') return 'image/bmp';
  return 'image/png';
}

export function formatArchiveBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  if (bytes < 1024 * 1024) return `${Number((bytes / 1024).toFixed(1))} KB`;
  return `${Number((bytes / (1024 * 1024)).toFixed(1))} MB`;
}
