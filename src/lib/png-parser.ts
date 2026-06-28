/**
 * Parse SillyTavern character card data from a PNG (tEXt chunks) or JSON.
 *
 * 依据 _reference/st-docs/02-character-card-v2-v3.md：
 * - V1：无 spec，字段平铺在顶层
 * - V2：{ spec:"chara_card_v2", spec_version, data:{...} }
 * - V3：{ spec:"chara_card_v3", spec_version, data:{...} }，data 含 V2 全部字段 + assets/nickname 等
 * - PNG：tEXt chunk，keyword `chara`(V1/V2) / `ccv3`(V3)；ccv3 优先；同名 chunk 取最后一个；非 zTXt
 */

/** V3 内嵌资源 */
export interface CardAsset {
  type?: string;   // icon | background | user_icon | emotion | x-*
  uri?: string;    // embeded://... | ccdefault: | http(s):// | data:
  name?: string;
  ext?: string;
}

/** 角色卡 data 部分（V2/V3 共用，V3 字段标注） */
export interface CharacterCardData {
  name?: string;
  description?: string;
  personality?: string;
  scenario?: string;
  first_mes?: string;
  mes_example?: string;
  creator_notes?: string;
  system_prompt?: string;
  post_history_instructions?: string;
  alternate_greetings?: string[];
  tags?: string[];
  creator?: string;
  character_version?: string;
  extensions?: Record<string, unknown>;
  character_book?: unknown;
  // V3
  assets?: CardAsset[];
  nickname?: string;
  creator_notes_multilingual?: Record<string, string>;
  source?: string[];
  group_only_greetings?: string[];
  creation_date?: number;
  modification_date?: number;
  [key: string]: unknown;
}

/** 原始角色卡（可能是 V1 平铺、或 V2/V3 带 data 包裹） */
export interface STCharacterCard {
  spec?: string;
  spec_version?: string;
  data?: CharacterCardData;
  // V1 平铺字段（也兜底用于无 data 的卡）
  name?: string;
  description?: string;
  personality?: string;
  first_mes?: string;
  mes_example?: string;
  scenario?: string;
  creator_notes?: string;
  tags?: string[];
  creator?: string;
  character_version?: string;
  avatar?: string;
  [key: string]: unknown;
}

/** 归一化后的角色卡：统一从 data（或 V1 顶层）取字段，附带版本标记 */
export interface NormalizedCharacterCard {
  spec: 'v1' | 'v2' | 'v3';
  name: string;
  description: string;
  personality: string;
  scenario: string;
  firstMessage: string;
  messageExample: string;
  creatorNotes: string;
  systemPrompt: string;
  postHistoryInstructions: string;
  alternateGreetings: string[];
  groupOnlyGreetings: string[];
  tags: string[];
  creator: string;
  characterVersion: string;
  nickname: string;
  assets: CardAsset[];
  /** 角色卡内记录的头像/立绘引用（V2/V3 的 data.avatar）；可能是文件名/'none'/URL，显示层自行判断 */
  avatar: string;
  /** 内嵌世界书（character_book），未解析的原始对象；用 normalizeCharacterBook 转换 */
  characterBook: unknown;
  extensions: Record<string, unknown>;
  /** 原始卡，便于查看未覆盖字段 */
  raw: STCharacterCard;
}

const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];

/** 把 PNG tEXt chunk 的 base64 文本解码为 UTF-8 字符串（处理可能的 latin1→utf8） */
function decodeBase64Utf8(b64: string): string {
  const binary = atob(b64.trim());
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder('utf-8').decode(bytes);
}

/**
 * 从 PNG 读取所有 tEXt chunk，返回 keyword→value(原始 base64 文本) 映射。
 * 同名 keyword 取最后一个（与 ST 实际行为一致）。
 */
function readPngTextChunks(buffer: ArrayBuffer): Map<string, string> {
  const view = new DataView(buffer);
  for (let i = 0; i < 8; i++) {
    if (view.getUint8(i) !== PNG_SIGNATURE[i]) {
      throw new Error('不是有效的 PNG 文件');
    }
  }
  const chunks = new Map<string, string>();
  let offset = 8;
  while (offset < buffer.byteLength) {
    const length = view.getUint32(offset);
    const typeBytes = new Uint8Array(buffer, offset + 4, 4);
    const type = String.fromCharCode(...typeBytes);
    if (type === 'tEXt') {
      const data = new Uint8Array(buffer, offset + 8, length);
      let nullIdx = -1;
      for (let i = 0; i < data.length; i++) {
        if (data[i] === 0) { nullIdx = i; break; }
      }
      if (nullIdx > 0) {
        const keyword = new TextDecoder('latin1').decode(data.slice(0, nullIdx));
        const value = new TextDecoder('latin1').decode(data.slice(nullIdx + 1));
        chunks.set(keyword, value); // 后写覆盖前写 = 最后一个 wins
      }
    }
    offset += 12 + length;
    if (type === 'IEND') break;
  }
  return chunks;
}

/** 从 PNG 提取角色卡原始对象。ccv3 优先，回退 chara。 */
export async function extractCharacterFromPng(file: File): Promise<STCharacterCard> {
  const buffer = await file.arrayBuffer();
  const chunks = readPngTextChunks(buffer);

  const ccv3 = chunks.get('ccv3');
  if (ccv3) {
    try {
      return JSON.parse(decodeBase64Utf8(ccv3)) as STCharacterCard;
    } catch {
      // ccv3 损坏则回退 chara
    }
  }
  const chara = chunks.get('chara');
  if (chara) {
    return JSON.parse(decodeBase64Utf8(chara)) as STCharacterCard;
  }
  throw new Error('PNG 文件中未找到角色卡数据（缺少 chara / ccv3 tEXt 块）');
}

/** 探测卡版本 */
function detectSpec(card: STCharacterCard): 'v1' | 'v2' | 'v3' {
  const spec = (card.spec || '').toLowerCase();
  if (spec === 'chara_card_v3') return 'v3';
  if (spec === 'chara_card_v2') return 'v2';
  if (card.data) return 'v2'; // 有 data 包裹但 spec 缺失，按 v2
  return 'v1';
}

const asStr = (v: unknown): string => (typeof v === 'string' ? v : '');
const asStrArr = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];

/** 把任意 V1/V2/V3 角色卡归一化为统一结构，便于只读展示 */
export function normalizeCharacterCard(card: STCharacterCard): NormalizedCharacterCard {
  const spec = detectSpec(card);
  // V1 字段在顶层，V2/V3 在 data；用 data 优先、顶层兜底
  const d: CharacterCardData = card.data ?? card;
  return {
    spec,
    name: asStr(d.name) || asStr(card.name) || 'Character',
    description: asStr(d.description),
    personality: asStr(d.personality),
    scenario: asStr(d.scenario),
    firstMessage: asStr(d.first_mes),
    messageExample: asStr(d.mes_example),
    creatorNotes: asStr(d.creator_notes),
    systemPrompt: asStr(d.system_prompt),
    postHistoryInstructions: asStr(d.post_history_instructions),
    alternateGreetings: asStrArr(d.alternate_greetings),
    groupOnlyGreetings: asStrArr(d.group_only_greetings),
    tags: asStrArr(d.tags),
    creator: asStr(d.creator),
    characterVersion: asStr(d.character_version),
    nickname: asStr(d.nickname),
    assets: Array.isArray(d.assets) ? (d.assets as CardAsset[]) : [],
    avatar: asStr(d.avatar),
    characterBook: d.character_book ?? null,
    extensions: (d.extensions as Record<string, unknown>) ?? {},
    raw: card,
  };
}

/** 解析角色卡 JSON 文件文本为原始卡对象 */
export function parseCharacterCardJson(text: string): STCharacterCard {
  return JSON.parse(text) as STCharacterCard;
}

// ---- 向后兼容的旧访问器（ChatImporter 仍在用，保持签名不变） ----

export function getCharacterName(card: STCharacterCard): string {
  return card.data?.name || card.name || 'Character';
}

export function getCharacterDescription(card: STCharacterCard): string {
  return card.data?.description || card.description || '';
}

export function getFirstMessage(card: STCharacterCard): string {
  return card.data?.first_mes || card.first_mes || '';
}
