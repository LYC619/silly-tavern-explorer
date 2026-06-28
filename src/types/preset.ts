import type { RegexRule } from '@/types/chat';

/**
 * SillyTavern Chat Completion 预设（Preset）类型定义。
 *
 * 设计原则（对齐本项目世界书/正则的 round-trip 范式）：
 * 预设顶层有 40+ 字段（各家服务商的 *_model / 采样参数 / 工具型 prompt 等），
 * 逐字段建模既不现实也会丢字段。因此只对 prompts / prompt_order / extensions.regex_scripts
 * 做规范建模，其余顶层字段全部原样存入 NormalizedPreset.originalData，导出时拼回，做到无损 round-trip。
 *
 * 参考：_reference/projects/sillytavern-prompt-studio-main 的 types/preset.ts（同栈印证）
 * 与真实样本 _reference/samples/Default.json。
 */

/** 单个提示词块（prompts[] 的元素） */
export interface PromptBlock {
  identifier: string;
  name: string;
  role?: 'system' | 'user' | 'assistant';
  content?: string;
  /** ST 标记此块为"系统提示"（UI flag，与 role 独立） */
  system_prompt?: boolean;
  /** true=系统插槽占位块（chatHistory/worldInfo 等），运行时动态填充，无 content/role，不可编辑内容 */
  marker?: boolean;
  /** @depth 注入相关（部分块才有） */
  injection_position?: number;
  injection_depth?: number;
  /** 保留任何未知字段，导出无损还原 */
  [key: string]: unknown;
}

/** prompt_order 组内的单个排序项 */
export interface OrderEntry {
  identifier: string;
  enabled: boolean;
}

/** 按角色分组的激活顺序（单人对话约定 character_id=100000） */
export interface PromptOrderGroup {
  character_id: number;
  order: OrderEntry[];
}

/** 单人对话的约定 character_id（ST 默认） */
export const DEFAULT_CHARACTER_ID = 100000;

/**
 * 规范化后的预设（应用内使用）。
 * - prompts / prompt_order：规范字段，可编辑
 * - regexRules：由 extensions.regex_scripts 经 st-regex-interop 转成的应用内规则（含 _raw 无损）
 * - hasRegexExtension：原预设是否带 extensions.regex_scripts（决定导出时是否写回该字段）
 * - originalData：除 prompts/prompt_order/extensions.regex_scripts 外的全部原始数据，导出时拼回
 */
export interface NormalizedPreset {
  prompts: PromptBlock[];
  promptOrder: PromptOrderGroup[];
  regexRules: RegexRule[];
  hasRegexExtension: boolean;
  originalData: Record<string, unknown>;
}

/** 持久化记录（IndexedDB presets store），仿 WorldBookItem 双轨 autoSaved 设计 */
export interface PresetItem {
  id: string;
  title: string;
  preset: NormalizedPreset;
  createdAt: number;
  updatedAt: number;
  /** true=自动保留的导入历史(最近5份，超出自动清理)；false/undefined=手动保存到书架，永久留存 */
  autoSaved?: boolean;
}

/** prompt 块的 role 中文标签 */
export const PROMPT_ROLE_LABELS: Record<string, string> = {
  system: '系统',
  user: '用户',
  assistant: '助手',
};

/**
 * SillyTavern 内置 marker（系统插槽）identifier → 中文显示名。
 * 仅用于 UI 友好显示，不改导出的 identifier/name，不影响 round-trip。
 * 8 个内置 marker 依据 ST 源码 PromptManager.js chatCompletionDefaultPrompts。
 */
export const MARKER_LABELS: Record<string, string> = {
  worldInfoBefore: '世界书（前置）',
  worldInfoAfter: '世界书（后置）',
  charDescription: '角色描述',
  charPersonality: '角色性格',
  scenario: '场景',
  dialogueExamples: '对话示例',
  chatHistory: '聊天历史',
  personaDescription: '用户角色描述',
};

/** 块的友好显示名：内置 marker 显示"中文 · 英文原名"，其余直接用 name/identifier */
export function blockDisplayName(block: { identifier: string; name?: string; marker?: boolean }): string {
  const zh = MARKER_LABELS[block.identifier];
  if (zh) return `${zh} · ${block.name || block.identifier}`;
  return block.name || block.identifier;
}

export function generatePresetId(): string {
  return `preset_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}
