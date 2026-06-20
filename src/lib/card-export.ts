import type { STCharacterCard, CharacterCardData, NormalizedCharacterCard } from '@/lib/png-parser';

/**
 * 角色卡写回与导出。
 *
 * round-trip 原则：编辑只覆盖核心文本字段，其余字段（extensions/assets/character_book/
 * spec_version/未知字段）从原始卡 raw 原样保留。写回位置对称于 png-parser 的 normalizeCharacterCard
 * 取值（`card.data ?? card`）：V2/V3 写 data，V1 写顶层。
 */

/** 可编辑的核心字段（扁平，应用内编辑态） */
export interface CardEdits {
  name: string;
  nickname: string;
  description: string;
  personality: string;
  scenario: string;
  firstMessage: string;
  messageExample: string;
  creatorNotes: string;
  systemPrompt: string;
  postHistoryInstructions: string;
  alternateGreetings: string[];
  tags: string[];
  creator: string;
  characterVersion: string;
}

/** 扁平编辑字段 → 角色卡 data 字段名映射 */
const FIELD_MAP: Record<keyof CardEdits, string> = {
  name: 'name',
  nickname: 'nickname',
  description: 'description',
  personality: 'personality',
  scenario: 'scenario',
  firstMessage: 'first_mes',
  messageExample: 'mes_example',
  creatorNotes: 'creator_notes',
  systemPrompt: 'system_prompt',
  postHistoryInstructions: 'post_history_instructions',
  alternateGreetings: 'alternate_greetings',
  tags: 'tags',
  creator: 'creator',
  characterVersion: 'character_version',
};

/**
 * 把编辑后的字段写回原始卡，返回新卡对象（深拷贝，不改原 raw）。
 * V1（无 data）写顶层；V2/V3（有 data）写 data。
 */
export function applyEditsToCard(raw: STCharacterCard, edits: CardEdits): STCharacterCard {
  const clone: STCharacterCard = JSON.parse(JSON.stringify(raw));
  const hasData = clone.data && typeof clone.data === 'object';
  const target: Record<string, unknown> = hasData
    ? (clone.data as CharacterCardData)
    : (clone as Record<string, unknown>);

  (Object.keys(FIELD_MAP) as (keyof CardEdits)[]).forEach((key) => {
    const dataKey = FIELD_MAP[key];
    const value = edits[key];
    // 数组字段：空数组也写（用户可能清空 tags/备选问候）
    target[dataKey] = value;
  });

  // V1 卡如果原本就有 nickname/system_prompt 等 V2 字段写到顶层无妨；保持 V1 不强转 V2。
  return clone;
}

/** 导出为角色卡 JSON 字符串（2 空格缩进） */
export function exportCardJson(card: STCharacterCard): string {
  return JSON.stringify(card, null, 2);
}

/** 从归一化卡提取可编辑字段（编辑态初值） */
export function editsFromNormalized(card: NormalizedCharacterCard): CardEdits {
  return {
    name: card.name,
    nickname: card.nickname,
    description: card.description,
    personality: card.personality,
    scenario: card.scenario,
    firstMessage: card.firstMessage,
    messageExample: card.messageExample,
    creatorNotes: card.creatorNotes,
    systemPrompt: card.systemPrompt,
    postHistoryInstructions: card.postHistoryInstructions,
    alternateGreetings: [...card.alternateGreetings],
    tags: [...card.tags],
    creator: card.creator,
    characterVersion: card.characterVersion,
  };
}
