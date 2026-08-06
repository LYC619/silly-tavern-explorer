/**
 * 文件库后端（2.0 阶段7.2b）：store → 明文文件 的映射策略层，实现 Repo 契约。
 *
 * 铁律（task_plan 阶段7.2 映射设计十条）：
 * - 永不删不认识的文件：remove/重写只碰规格内命名的文件，目录非空自动保留；
 * - 故事.json 是故事唯一真源；聊天.jsonl / 分支·X.jsonl 是随保存重生成的派生 ST 工作版（只写不读）；
 * - 档案.json 等 JSON 记录整对象往返，未知键（用户手加字段）原样保留；
 * - 重名标题 ensureUnique 语义加 ·N；改名/改绑定优先 rename（文件夹带着用户文件一起搬）。
 *
 * 目录布局（相对库根）：
 *   角色/<名>/档案.json + 卡片.png + 故事/<名>/(故事.json + 聊天.jsonl + 分支·X.jsonl + 记录文件)
 *   临时/<名>/（未绑定故事，同构） 临时/记录/（孤儿总结与故事树） 临时/卡片/（处理区暂存卡）
 *   资产/世界书|预设|正则/<title>.json（ST 兼容 + 顶层 __ste） 资产/模板/（总结·评分模板）
 *
 * 索引：id → 相对路径（角色/故事记文件夹，其余记文件），首次访问全量扫描惰性建立，
 * put/remove 就地维护。读走 id→记录缓存 + 并行 IO（阶段9.1）；put/remove 只失效缓存，
 * 下次读回盘，保证序列化往返真实。
 */
import type { StoreName } from '@/lib/idb';
import type { BaseRecord, Repo } from '@/lib/repo/idb-repo';
import type { ArchiveCharacter, ArchiveStory } from '@/types/archive';
import type { SummaryItem, SummaryTemplate } from '@/types/summary';
import { SUMMARY_KIND_LABELS } from '@/types/summary';
import type { StoryTree } from '@/types/story-tree';
import type { WorldBookItem, WorldBook } from '@/types/worldbook';
import type { PresetItem } from '@/types/preset';
import type { CardItem } from '@/types/character-card';
import type { RatingTemplateItem } from '@/types/rating';
import type { RegexCollectionItem } from '@/lib/regex-db';
import { parsePreset, exportPreset } from '@/lib/preset-parser';
import { serializeChatJsonl } from '@/lib/adapters/st/chat-jsonl';
import type { VaultFs } from './fs';
import { joinPath, parentDir, baseName } from './fs';
import { safeName, ensureUnique } from './naming';
import { serializeFrontmatter, parseFrontmatter } from './frontmatter';

export interface VaultBackend {
  repo<T extends BaseRecord>(store: StoreName): Repo<T>;
  /** 库文件系统（组件读记录外的旁路文件用，如角色 立绘/；只读为宜） */
  fs: VaultFs;
  /** 记录在库内的相对路径（角色/故事=文件夹，其余=文件）；未入索引返回 undefined */
  pathOf(store: StoreName, id: string): Promise<string | undefined>;
}

/** 文件库承接的 store（'books' 已退役不进文件库） */
const VAULT_STORES = [
  'characters',
  'archiveStories',
  'summaries',
  'stories',
  'worldbooks',
  'presets',
  'regexes',
  'cards',
  'summaryTemplates',
  'ratingTemplates',
  'archiveMeta',
] as const;
type VaultStore = (typeof VAULT_STORES)[number];

const DIR_CHAR = '角色';
const DIR_TEMP = '临时';
const DIR_TEMP_RECORDS = '临时/记录';
const DIR_TEMP_CARDS = '临时/卡片';
const DIR_ASSET_WB = '资产/世界书';
const DIR_ASSET_PRESET = '资产/预设';
const DIR_ASSET_REGEX = '资产/正则';
const DIR_ASSET_TPL = '资产/模板';
const DIR_STORIES = '故事'; // 角色文件夹下的故事子目录名
const FILE_PROFILE = '档案.json';
const FILE_CARD_PNG = '卡片.png';
const FILE_STORY = '故事.json';
const FILE_CHAT = '聊天.jsonl';
const FILE_ARCHIVE_META = '库信息.json';
const BRANCH_PREFIX = '分支·';
const TREE_PREFIX = '故事树·';
const TPL_SUMMARY_PREFIX = '总结模板·';
const TPL_RATING_PREFIX = '评分模板·';
/** 临时/ 下这两个名字是布局保留目录，未绑定故事的文件夹不得占用 */
const TEMP_RESERVED = ['记录', '卡片'];

const toJson = (v: unknown) => JSON.stringify(v, null, 2);

/** IO 并发上限：客户端每次读文件都是一趟 IPC，串行读几十张卡是加载慢的主因 */
const IO_LIMIT = 8;

/** 按并发上限跑 IO 任务，结果保持原序（fn 内部自行吞错时对应位置为其返回值） */
async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      for (let i = next++; i < items.length; i = next++) out[i] = await fn(items[i]);
    }),
  );
  return out;
}

/** 资产文件的 __ste 元数据键（进 ST 兼容 JSON 顶层，ST 导入时会忽略） */
function steMeta(rec: BaseRecord): Record<string, unknown> {
  const src = rec as unknown as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  // sourcePath：阶段7.3 从 ST 目录导入的资产记来源路径（重复导入判定），须随 __ste 往返存活
  for (const k of ['id', 'title', 'createdAt', 'updatedAt', 'autoSaved', 'derived', 'sourcePath']) {
    if (src[k] !== undefined) out[k] = src[k];
  }
  return out;
}

/** frontmatter 文件：除 content 外全部字段进头部（JSON 值行），body=content */
function serializeMd(rec: BaseRecord): string {
  const { content, ...fields } = rec as BaseRecord & { content?: string };
  return serializeFrontmatter(fields, content ?? '');
}

export function createVault(fs: VaultFs): VaultBackend {
  // ---- 索引：id → 相对路径 ----
  const idx = new Map<VaultStore, Map<string, string>>(VAULT_STORES.map((s) => [s, new Map()]));
  const of = (s: VaultStore) => idx.get(s)!;
  let indexReady: Promise<void> | null = null;
  const ensureIndex = () => (indexReady ??= buildIndex());

  // ---- 记录读缓存（阶段9.1 性能）：id → 记录本体 ----
  // 读时填充；put/remove 只失效不回填（下次读回盘，序列化往返保持真实，测试不被缓存遮蔽）。
  // 代价：应用运行中用户手改库文件不被感知，重启可见——本地单用户可接受。
  const recCache = new Map<VaultStore, Map<string, BaseRecord>>(VAULT_STORES.map((s) => [s, new Map()]));

  async function readRecordCached(store: VaultStore, id: string, path: string): Promise<BaseRecord | null> {
    const m = recCache.get(store)!;
    const hit = m.get(id);
    // 出入缓存都克隆：调用方拿到的对象与缓存互不别名（与 IDB 每次返回新对象的语义一致）
    if (hit) return structuredClone(hit);
    const rec = await readRecord(store, path);
    if (rec) m.set(id, structuredClone(rec));
    return rec;
  }

  const warnSkip = (path: string, err: unknown) => console.warn(`[vault] 跳过无法读取的文件 ${path}:`, err);

  /** 目录整体改名后，把所有 store 里位于旧前缀下的索引路径同步搬过去 */
  function fixupPrefixes(from: string, to: string): void {
    for (const m of idx.values()) {
      for (const [id, p] of m) {
        if (p === from) m.set(id, to);
        else if (p.startsWith(from + '/')) m.set(id, to + p.slice(from.length));
      }
    }
  }

  async function readJson(path: string): Promise<Record<string, unknown> | null> {
    try {
      return JSON.parse(await fs.readText(path)) as Record<string, unknown>;
    } catch (err) {
      warnSkip(path, err);
      return null;
    }
  }

  /**
   * 在 parent 下找不撞名的 stem：对每个 ext（目录传 ['']）拼出的名字都不占用才算空闲。
   * selfNames=本记录当前占用的名字（改名时先让位给自己，避免 ·N 无谓递增）；
   * reserve=布局保留名（如 临时/ 下的 记录、卡片），即使目录还不存在也视为占用。
   */
  async function uniqueStem(parent: string, stem: string, exts: string[], selfNames: string[] = [], reserve: string[] = []): Promise<string> {
    const taken = new Set((await fs.list(parent)).map((e) => e.name.toLowerCase()));
    for (const r of reserve) taken.add(r.toLowerCase());
    for (const s of selfNames) taken.delete(s.toLowerCase());
    const free = (s: string) => exts.every((e) => !taken.has((s + e).toLowerCase()));
    if (free(stem)) return stem;
    for (let i = 2; ; i++) {
      const cand = `${stem}·${i}`;
      if (free(cand)) return cand;
    }
  }

  // ---- 全量扫描（惰性建索引） ----

  async function scanSteJsonDir(dir: string, store: VaultStore): Promise<void> {
    const m = of(store);
    const files = (await fs.list(dir)).filter((e) => !e.isDir && e.name.endsWith('.json'));
    await mapLimit(files, IO_LIMIT, async (e) => {
      const path = joinPath(dir, e.name);
      const rec = await readJson(path);
      const ste = rec?.__ste as Record<string, unknown> | undefined;
      // 无 __ste = 用户自己放进来的 ST 文件，不认领（也永不删改）
      if (ste && typeof ste.id === 'string') m.set(ste.id, path);
    });
  }

  async function scanMdFile(path: string, m: Map<string, string>): Promise<void> {
    try {
      const { fields } = parseFrontmatter(await fs.readText(path));
      if (typeof fields.id === 'string') m.set(fields.id, path);
    } catch (err) {
      warnSkip(path, err);
    }
  }

  async function buildIndex(): Promise<void> {
    // 1. 角色：角色/*/档案.json
    const chars = of('characters');
    await mapLimit((await fs.list(DIR_CHAR)).filter((e) => e.isDir), IO_LIMIT, async (e) => {
      const dir = joinPath(DIR_CHAR, e.name);
      if (!(await fs.stat(joinPath(dir, FILE_PROFILE))).exists) return; // 用户自己的文件夹
      const rec = await readJson(joinPath(dir, FILE_PROFILE));
      if (rec && typeof rec.id === 'string') chars.set(rec.id, dir);
    });
    // 2. 故事候选目录：角色/*/故事/* + 临时/*（除保留目录）
    const storyDirs: string[] = [];
    const charDirLists = await mapLimit([...chars.values()], IO_LIMIT, async (dir) => ({
      dir,
      entries: await fs.list(joinPath(dir, DIR_STORIES)),
    }));
    for (const { dir, entries } of charDirLists) {
      for (const e of entries) {
        if (e.isDir) storyDirs.push(joinPath(dir, DIR_STORIES, e.name));
      }
    }
    for (const e of await fs.list(DIR_TEMP)) {
      if (e.isDir && !TEMP_RESERVED.includes(e.name)) storyDirs.push(joinPath(DIR_TEMP, e.name));
    }
    const storyIdx = of('archiveStories');
    await mapLimit(storyDirs, IO_LIMIT, async (dir) => {
      if (!(await fs.stat(joinPath(dir, FILE_STORY))).exists) return;
      const rec = await readJson(joinPath(dir, FILE_STORY));
      if (rec && typeof rec.id === 'string') storyIdx.set(rec.id, dir);
    });
    // 3. 记录文件（总结 md + 故事树 json）：全部故事候选目录 + 临时/记录
    //    故事被删后遗留在原文件夹里的记录也要扫到，所以扫候选目录而非仅已索引的故事目录
    const summaryLabels = Object.values(SUMMARY_KIND_LABELS);
    await mapLimit([...storyDirs, DIR_TEMP_RECORDS], IO_LIMIT, async (dir) => {
      for (const e of await fs.list(dir)) {
        if (e.isDir) continue;
        const path = joinPath(dir, e.name);
        if (e.name.endsWith('.md') && summaryLabels.some((l) => e.name.startsWith(l + '·'))) {
          await scanMdFile(path, of('summaries'));
        } else if (e.name.startsWith(TREE_PREFIX) && e.name.endsWith('.json')) {
          const rec = await readJson(path);
          if (rec && typeof rec.id === 'string') of('stories').set(rec.id, path);
        }
      }
    });
    // 4. 资产
    await scanSteJsonDir(DIR_ASSET_WB, 'worldbooks');
    await scanSteJsonDir(DIR_ASSET_PRESET, 'presets');
    await scanSteJsonDir(DIR_ASSET_REGEX, 'regexes');
    // 5. 处理区暂存卡
    for (const e of await fs.list(DIR_TEMP_CARDS)) {
      if (e.isDir || !e.name.endsWith('.json')) continue;
      const path = joinPath(DIR_TEMP_CARDS, e.name);
      const rec = await readJson(path);
      if (rec && typeof rec.id === 'string') of('cards').set(rec.id, path);
    }
    // 6. 模板
    for (const e of await fs.list(DIR_ASSET_TPL)) {
      if (e.isDir) continue;
      const path = joinPath(DIR_ASSET_TPL, e.name);
      if (e.name.startsWith(TPL_SUMMARY_PREFIX) && e.name.endsWith('.md')) {
        await scanMdFile(path, of('summaryTemplates'));
      } else if (e.name.startsWith(TPL_RATING_PREFIX) && e.name.endsWith('.json')) {
        const rec = await readJson(path);
        if (rec && typeof rec.id === 'string') of('ratingTemplates').set(rec.id, path);
      }
    }
    // 7. 归档库内部元数据（schema 版本）
    if ((await fs.stat(FILE_ARCHIVE_META)).exists) {
      const rec = await readJson(FILE_ARCHIVE_META);
      if (rec && typeof rec.id === 'string') of('archiveMeta').set(rec.id, FILE_ARCHIVE_META);
    }
  }

  // ---- 读取（路径 → 记录）：JSON 整对象往返，未知键原样保留 ----

  async function readJsonRecord(path: string): Promise<BaseRecord | null> {
    const rec = await readJson(path);
    return rec && typeof rec.id === 'string' ? (rec as unknown as BaseRecord) : null;
  }

  async function readMdRecord(path: string): Promise<BaseRecord | null> {
    try {
      const { fields, body } = parseFrontmatter(await fs.readText(path));
      if (typeof fields.id !== 'string') return null;
      return { ...fields, content: body } as unknown as BaseRecord;
    } catch (err) {
      warnSkip(path, err);
      return null;
    }
  }

  async function readCharacter(dir: string): Promise<BaseRecord | null> {
    const rec = await readJson(joinPath(dir, FILE_PROFILE));
    if (!rec || typeof rec.id !== 'string') return null;
    const png = joinPath(dir, FILE_CARD_PNG);
    if ((await fs.stat(png)).exists) rec.pngBase64 = await fs.readBinary(png);
    return rec as unknown as BaseRecord;
  }

  async function readWorldbook(path: string): Promise<BaseRecord | null> {
    const rec = await readJson(path);
    if (!rec) return null;
    const { __ste, entries, ...rest } = rec;
    const ste = __ste as Record<string, unknown> | undefined;
    if (!ste || typeof ste.id !== 'string') return null;
    return {
      ...ste,
      worldbook: { entries: (entries ?? {}) as WorldBook['entries'], originalData: rest },
    } as unknown as BaseRecord;
  }

  async function readPreset(path: string): Promise<BaseRecord | null> {
    const rec = await readJson(path);
    const ste = rec?.__ste as Record<string, unknown> | undefined;
    if (!rec || !ste || typeof ste.id !== 'string') return null;
    const stJson = { ...rec };
    delete stJson.__ste;
    try {
      return { ...ste, preset: parsePreset(stJson) } as unknown as BaseRecord;
    } catch (err) {
      warnSkip(path, err);
      return null;
    }
  }

  async function readRegexes(path: string): Promise<BaseRecord | null> {
    const rec = await readJson(path);
    const ste = rec?.__ste as Record<string, unknown> | undefined;
    if (!rec || !ste || typeof ste.id !== 'string') return null;
    return { ...ste, rules: rec.rules ?? [] } as unknown as BaseRecord;
  }

  async function readCard(path: string): Promise<BaseRecord | null> {
    const rec = await readJson(path);
    if (!rec || typeof rec.id !== 'string') return null;
    const png = path.replace(/\.json$/, '.png');
    if ((await fs.stat(png)).exists) rec.pngBase64 = await fs.readBinary(png);
    return rec as unknown as BaseRecord;
  }

  function readRecord(store: VaultStore, path: string): Promise<BaseRecord | null> {
    switch (store) {
      case 'characters': return readCharacter(path);
      case 'archiveStories': return readJsonRecord(joinPath(path, FILE_STORY));
      case 'summaries':
      case 'summaryTemplates': return readMdRecord(path);
      case 'stories':
      case 'ratingTemplates':
      case 'archiveMeta': return readJsonRecord(path);
      case 'worldbooks': return readWorldbook(path);
      case 'presets': return readPreset(path);
      case 'regexes': return readRegexes(path);
      case 'cards': return readCard(path);
    }
  }

  // ---- 写入 ----

  /**
   * 单文件记录通用落盘：定位（标题/归属变化 → 换名换目录，等效 rename，内容反正整写）+ 写入 + 维护索引。
   * 搬出后的旧目录若空则收走（非空 = 还有别的记录或用户文件，保留）。
   */
  async function putSingleFile(store: VaultStore, id: string, parent: string, stem: string, ext: string, content: string): Promise<void> {
    const m = of(store);
    const cur = m.get(id);
    const sameParent = cur !== undefined && parentDir(cur) === parent;
    const name = await uniqueStem(parent, stem, [ext], sameParent ? [baseName(cur)] : []);
    const target = joinPath(parent, name + ext);
    if (cur && cur !== target) {
      if ((await fs.stat(cur)).exists) await fs.removeFile(cur);
      if (!sameParent) await fs.removeEmptyDir(parentDir(cur));
    }
    await fs.writeText(target, content);
    m.set(id, target);
  }

  async function putCharacter(rec: ArchiveCharacter): Promise<void> {
    const m = of('characters');
    const cur = m.get(rec.id);
    const stem = safeName(rec.name, '未命名角色');
    let dir: string;
    if (!cur) {
      dir = joinPath(DIR_CHAR, await uniqueStem(DIR_CHAR, stem, ['']));
      await fs.mkdir(dir);
    } else {
      // name 变化 → 文件夹 rename（用户放的立绘等一起搬）；目标被占 → ·N
      dir = joinPath(DIR_CHAR, await uniqueStem(DIR_CHAR, stem, [''], [baseName(cur)]));
      if (dir !== cur) {
        await fs.rename(cur, dir);
        fixupPrefixes(cur, dir);
      }
    }
    m.set(rec.id, dir);
    const { pngBase64, ...profile } = rec;
    await fs.writeText(joinPath(dir, FILE_PROFILE), toJson(profile));
    const pngPath = joinPath(dir, FILE_CARD_PNG);
    if (pngBase64) {
      await fs.writeBinary(pngPath, pngBase64);
    } else if ((await fs.stat(pngPath)).exists) {
      // 记录不再带原图时同步删掉规格内的 卡片.png，否则 get 会把旧图读回来破坏往返
      await fs.removeFile(pngPath);
    }
  }

  async function putStory(rec: ArchiveStory): Promise<void> {
    const m = of('archiveStories');
    const charDir = rec.characterId ? of('characters').get(rec.characterId) : undefined;
    // 绑定且角色在库 → 角色文件夹下；否则进 临时/（characterId 悬空同样按未绑定落位）
    const parent = charDir ? joinPath(charDir, DIR_STORIES) : DIR_TEMP;
    const reserve = parent === DIR_TEMP ? TEMP_RESERVED : [];
    const stem = safeName(rec.title, '未命名故事');
    const cur = m.get(rec.id);
    let dir: string;
    if (!cur) {
      dir = joinPath(parent, await uniqueStem(parent, stem, [''], [], reserve));
      await fs.mkdir(dir);
    } else {
      const sameParent = parentDir(cur) === parent;
      dir = joinPath(parent, await uniqueStem(parent, stem, [''], sameParent ? [baseName(cur)] : [], reserve));
      if (dir !== cur) {
        await fs.mkdir(parent);
        await fs.rename(cur, dir);
        fixupPrefixes(cur, dir);
        if (!sameParent) await fs.removeEmptyDir(parentDir(cur));
      }
    }
    m.set(rec.id, dir);
    // 故事.json = 唯一真源（全记录，含 session/branches，messageId 锚点不破）
    await fs.writeText(joinPath(dir, FILE_STORY), toJson(rec));
    // 派生 ST 工作版：只写不读，随保存整体重生成
    await fs.writeText(joinPath(dir, FILE_CHAT), serializeChatJsonl(rec.session));
    const branchFiles = new Set<string>();
    const stems: string[] = [];
    for (const b of rec.branches ?? []) {
      const bStem = ensureUnique(BRANCH_PREFIX + safeName(b.name, '未命名分支'), stems);
      stems.push(bStem);
      branchFiles.add(bStem + '.jsonl');
      await fs.writeText(joinPath(dir, bStem + '.jsonl'), serializeChatJsonl(b.session));
    }
    await removeStaleBranchFiles(dir, branchFiles);
  }

  /** 清掉上一版派生的 分支·*.jsonl（规格内命名才动；用户自己的文件不碰） */
  async function removeStaleBranchFiles(dir: string, keep: Set<string>): Promise<void> {
    for (const e of await fs.list(dir)) {
      if (!e.isDir && e.name.startsWith(BRANCH_PREFIX) && e.name.endsWith('.jsonl') && !keep.has(e.name)) {
        await fs.removeFile(joinPath(dir, e.name));
      }
    }
  }

  async function putCard(rec: CardItem): Promise<void> {
    const m = of('cards');
    const cur = m.get(rec.id);
    const curStem = cur ? baseName(cur).replace(/\.json$/, '') : undefined;
    const stem = safeName(rec.title, '未命名卡片');
    const name = await uniqueStem(DIR_TEMP_CARDS, stem, ['.json', '.png'], curStem !== undefined ? [curStem + '.json', curStem + '.png'] : []);
    const target = joinPath(DIR_TEMP_CARDS, name + '.json');
    if (cur && cur !== target) {
      for (const p of [cur, cur.replace(/\.json$/, '.png')]) {
        if ((await fs.stat(p)).exists) await fs.removeFile(p);
      }
    }
    const { pngBase64, ...rest } = rec;
    await fs.writeText(target, toJson(rest));
    const pngPath = joinPath(DIR_TEMP_CARDS, name + '.png');
    if (pngBase64) {
      await fs.writeBinary(pngPath, pngBase64);
    } else if ((await fs.stat(pngPath)).exists) {
      await fs.removeFile(pngPath);
    }
    m.set(rec.id, target);
  }

  /** 总结/故事树的落位目录：bookId（归档故事 id）能解析到 → 故事文件夹；否则孤儿进 临时/记录/ */
  function recordParent(bookId: string | null | undefined): string {
    return (bookId && of('archiveStories').get(bookId)) || DIR_TEMP_RECORDS;
  }

  function serializeWorldbook(rec: WorldBookItem): string {
    // ST 可直接导入的形状：原顶层键 + entries；__ste 收 STE 自有元数据，回读时剥离
    return toJson({ ...(rec.worldbook.originalData ?? {}), entries: rec.worldbook.entries, __ste: steMeta(rec) });
  }

  function serializePresetFile(rec: PresetItem): string {
    // exportPreset 产出 ST 兼容全量 JSON（originalData+prompts+prompt_order+extensions），再挂 __ste
    const st = JSON.parse(exportPreset(rec.preset)) as Record<string, unknown>;
    st.__ste = steMeta(rec);
    return toJson(st);
  }

  function putRecord(store: VaultStore, rec: BaseRecord): Promise<void> {
    switch (store) {
      case 'characters':
        return putCharacter(rec as ArchiveCharacter);
      case 'archiveStories':
        return putStory(rec as ArchiveStory);
      case 'cards':
        return putCard(rec as CardItem);
      case 'summaries': {
        const r = rec as SummaryItem;
        const stem = `${SUMMARY_KIND_LABELS[r.kind]}·${safeName(r.title)}`;
        return putSingleFile(store, r.id, recordParent(r.bookId), stem, '.md', serializeMd(rec));
      }
      case 'stories': {
        const r = rec as StoryTree;
        return putSingleFile(store, r.id, recordParent(r.bookId), TREE_PREFIX + safeName(r.title), '.json', toJson(r));
      }
      case 'worldbooks': {
        const r = rec as WorldBookItem;
        return putSingleFile(store, r.id, DIR_ASSET_WB, safeName(r.title), '.json', serializeWorldbook(r));
      }
      case 'presets': {
        const r = rec as PresetItem;
        return putSingleFile(store, r.id, DIR_ASSET_PRESET, safeName(r.title), '.json', serializePresetFile(r));
      }
      case 'regexes': {
        const r = rec as RegexCollectionItem;
        return putSingleFile(store, r.id, DIR_ASSET_REGEX, safeName(r.title), '.json', toJson({ __ste: steMeta(r), rules: r.rules }));
      }
      case 'summaryTemplates': {
        const r = rec as SummaryTemplate;
        return putSingleFile(store, r.id, DIR_ASSET_TPL, TPL_SUMMARY_PREFIX + safeName(r.title), '.md', serializeMd(rec));
      }
      case 'ratingTemplates': {
        const r = rec as RatingTemplateItem;
        return putSingleFile(store, r.id, DIR_ASSET_TPL, TPL_RATING_PREFIX + safeName(r.title), '.json', toJson(r));
      }
      case 'archiveMeta':
        return fs.writeText(FILE_ARCHIVE_META, toJson(rec)).then(() => {
          of('archiveMeta').set(rec.id, FILE_ARCHIVE_META);
        });
    }
  }

  // ---- 删除：只删规格内文件，然后 removeEmptyDir（用户文件在场 = 目录保留） ----

  async function removeIfExists(path: string): Promise<void> {
    if ((await fs.stat(path)).exists) await fs.removeFile(path);
  }

  async function removeRecord(store: VaultStore, id: string): Promise<void> {
    const m = of(store);
    const path = m.get(id);
    if (!path) return;
    switch (store) {
      case 'characters':
        await removeIfExists(joinPath(path, FILE_PROFILE));
        await removeIfExists(joinPath(path, FILE_CARD_PNG));
        await fs.removeEmptyDir(joinPath(path, DIR_STORIES));
        await fs.removeEmptyDir(path);
        break;
      case 'archiveStories':
        await removeIfExists(joinPath(path, FILE_STORY));
        await removeIfExists(joinPath(path, FILE_CHAT));
        await removeStaleBranchFiles(path, new Set());
        await fs.removeEmptyDir(path);
        break;
      case 'cards':
        await removeIfExists(path);
        await removeIfExists(path.replace(/\.json$/, '.png'));
        await fs.removeEmptyDir(parentDir(path));
        break;
      case 'archiveMeta':
        await removeIfExists(path);
        break;
      default:
        await removeIfExists(path);
        await fs.removeEmptyDir(parentDir(path));
    }
    m.delete(id);
  }

  // ---- Repo 契约 ----

  function buildRepo(store: VaultStore): Repo<BaseRecord> {
    return {
      async list() {
        await ensureIndex();
        // 并行读 + 缓存命中直接返回；坏文件已在 readRecord 里 warn + null
        const recs = await mapLimit([...of(store).entries()], IO_LIMIT, ([id, path]) =>
          readRecordCached(store, id, path),
        );
        return recs
          .filter((r): r is BaseRecord => r !== null)
          .sort((a, b) => b.updatedAt - a.updatedAt);
      },
      async get(id) {
        await ensureIndex();
        const path = of(store).get(id);
        if (!path) return undefined;
        return (await readRecordCached(store, id, path)) ?? undefined;
      },
      async put(item) {
        await ensureIndex();
        recCache.get(store)!.delete(item.id);
        await putRecord(store, item);
      },
      async remove(id) {
        await ensureIndex();
        recCache.get(store)!.delete(id);
        await removeRecord(store, id);
      },
    };
  }

  const repos = new Map<VaultStore, Repo<BaseRecord>>();
  return {
    repo<T extends BaseRecord>(store: StoreName): Repo<T> {
      if (!(VAULT_STORES as readonly string[]).includes(store)) {
        throw new Error(`文件库不支持 store：${store}`);
      }
      const s = store as VaultStore;
      let r = repos.get(s);
      if (!r) {
        r = buildRepo(s);
        repos.set(s, r);
      }
      return r as Repo<T>;
    },
    fs,
    async pathOf(store: StoreName, id: string): Promise<string | undefined> {
      if (!(VAULT_STORES as readonly string[]).includes(store)) return undefined;
      await ensureIndex();
      return of(store as VaultStore).get(id);
    },
  };
}
