/**
 * 阅读包（`.ste-reading`）格式定义。
 *
 * 用途：把「读」需要的东西打成一个文件，在设备之间搬。第一版的动机是电脑 → 手机
 * （手机上没有 ST 目录，也拿不到明文库，见 .planning/mobile-client-design/architecture.md），
 * 但格式本身是**对称的**：两端用的是同一套导出/导入代码，所以手机 → 电脑天然成立
 * （云酒馆玩家主要在手机上玩，反向搬运是真需求）。manifest 记 producedBy，
 * 接收端据此知道包是从哪种壳出来的。
 *
 * 不带的东西：预设、世界书、正则规则。那些是编辑期的资产，移动端不编辑；
 * 带上它们会让包大一个量级，而且会牵进「独立资产 + 写时复制」那套引用关系。
 *
 * 容器是 zip（`.ste-reading` 只是换了后缀，方便识别和关联打开方式）。布局：
 *
 *   manifest.json          格式版本 + 产出方 + 清单（够画导入预览，不用解正文）
 *   characters/<id>.json   PackCharacter
 *   stories/<id>.json      PackStory
 *   summaries/<id>.json    SummaryItem（属于被选故事的）
 *   media/<name>           真二进制（卡面 PNG、立绘图）
 *
 * 图片走独立 zip 条目而不是内联 base64，两个理由：
 * 1. base64 先 +33%，再交给 deflate 只能捞回一部分；PNG 本身已压过，直接存字节更省。
 * 2. 导入预览只需要读 manifest.json。图片内联进 JSON 的话，光是解析实体文件就要把
 *    几十 MB base64 拉进内存——手机上这一下就够呛。
 */
import type { ArchiveCharacter, ArchiveStory, PortraitRow } from '@/types/archive';
import type { SummaryItem } from '@/types/summary';
import type { Runtime } from '@/lib/runtime';

/** 当前格式版本。破坏性改动才 +1；加可选字段不动它。 */
export const READING_PACK_FORMAT = 1;

/** 包内固定路径 */
export const PACK_MANIFEST_PATH = 'manifest.json';
export const PACK_CHARACTER_DIR = 'characters';
export const PACK_STORY_DIR = 'stories';
export const PACK_SUMMARY_DIR = 'summaries';
export const PACK_MEDIA_DIR = 'media';

export const READING_PACK_EXT = '.ste-reading';

/**
 * 包体积硬上限。整库备份那边是 500MB，阅读包只装选中的故事，正常远低于此；
 * 超过多半是误选了别的文件。
 * ponytail: unzipSync 会把整个包解进内存，所以这个上限同时是内存上限。
 * 真要处理超大包得换 fflate 的流式 Unzip 按条目解，第一版不上。
 */
export const MAX_READING_PACK_BYTES = 300 * 1024 * 1024;

/** 立绘条目在包里的形态：图片挪去 media/，这里只留路径 */
export interface PackPortraitItem {
  id: string;
  source: 'manual' | 'replaced';
  name?: string;
  /** 包内路径，如 `media/portrait-<charId>-<rowId>-<itemId>.png` */
  mediaPath?: string;
  mime?: string;
  addedAt: number;
}

export interface PackPortraitRow extends Omit<PortraitRow, 'items'> {
  items: PackPortraitItem[];
}

/**
 * 包里的角色。
 * - 去掉 pngBase64，换成 cardMediaPath（字节在 media/）
 * - 去掉 attachments：那是客户端专有的库内相对路径，搬到别的设备上必然指空
 * - 去掉 assets / unresolvedAssets：指向独立资产库，包里没带资产
 * - 去掉 sourcePath：来源机器上的路径，换设备后无意义
 */
export interface PackCharacter extends Omit<
  ArchiveCharacter,
  'pngBase64' | 'portraitRows' | 'attachments' | 'assets' | 'unresolvedAssets' | 'sourcePath'
> {
  cardMediaPath?: string;
  portraitRows?: PackPortraitRow[];
}

/**
 * 包里的故事。正文/章节/书签/分支/评分/状态全带，只去掉设备相关的字段。
 * writebacks 是「写回 ST 的历史」，含库内备份路径，换设备后指空；
 * sourcePath 同理。
 */
export type PackStory = Omit<
  ArchiveStory,
  'sourcePath' | 'writebacks' | 'assets' | 'unresolvedAssets'
>;

/** manifest 里每个角色的摘要，够画预览 */
export interface PackCharacterEntry {
  id: string;
  name: string;
  updatedAt: number;
  /** 该角色在包内的故事数 */
  storyCount: number;
}

/** manifest 里每个故事的摘要 */
export interface PackStoryEntry {
  id: string;
  characterId?: string;
  title: string;
  updatedAt: number;
  /** 主线楼数（预览显示「多少楼」） */
  floors: number;
}

export interface ReadingPackManifest {
  /** 固定标记，认包用；与整库备份的 app 标记同源 */
  app: 'silly-tavern-explorer';
  kind: 'reading-pack';
  format: number;
  exportedAt: string;
  /** 产出方：哪种壳、哪个版本。反向搬运时接收端据此判断来路 */
  producedBy: {
    runtime: Runtime;
    appVersion: string;
  };
  characters: PackCharacterEntry[];
  stories: PackStoryEntry[];
  /** 总结条数（预览用；明细在 summaries/） */
  summaryCount: number;
  /** media/ 下的条目数 */
  mediaCount: number;
}

/** 解析后的包：manifest + 各实体 + 原始 media 字节 */
export interface ParsedReadingPack {
  manifest: ReadingPackManifest;
  characters: PackCharacter[];
  stories: PackStory[];
  summaries: SummaryItem[];
  /** 包内路径 → 字节 */
  media: Map<string, Uint8Array>;
}
