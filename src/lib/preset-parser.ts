import type { RegexRule } from '@/types/chat';
import type {
  NormalizedPreset,
  PromptBlock,
  PromptOrderGroup,
  OrderEntry,
} from '@/types/preset';
import { DEFAULT_CHARACTER_ID } from '@/types/preset';
import {
  parseSTRegexImport,
  ruleToSTScript,
  type STRegexScript,
} from '@/lib/st-regex-interop';

/**
 * SillyTavern 预设解析 / 导出。
 * round-trip 范式同 worldbook.ts：非规范顶层字段存进 originalData，导出 {...originalData, 规范字段} 拼回。
 * extensions.regex_scripts 复用 st-regex-interop（含 _raw 无损）。
 */

/** 校验是否是有效预设（ST 预设必有 prompts + prompt_order 两个数组） */
export function isValidPreset(json: unknown): json is Record<string, unknown> {
  if (!json || typeof json !== 'object') return false;
  const o = json as Record<string, unknown>;
  return Array.isArray(o.prompts) && Array.isArray(o.prompt_order);
}

/** 解析导入的预设 JSON → 应用内 NormalizedPreset。无效时抛错。 */
export function parsePreset(json: unknown): NormalizedPreset {
  if (!isValidPreset(json)) {
    throw new Error('无效的 SillyTavern 预设（应包含 prompts 与 prompt_order 数组）');
  }
  const raw = json as Record<string, unknown>;

  const prompts = (raw.prompts as PromptBlock[]).map((p) => ({ ...p }));
  const promptOrder = (raw.prompt_order as PromptOrderGroup[]).map((g) => ({
    character_id: g.character_id ?? DEFAULT_CHARACTER_ID,
    order: Array.isArray(g.order)
      ? g.order.map((o) => ({ identifier: o.identifier, enabled: o.enabled !== false }))
      : [],
  }));

  // extensions.regex_scripts → 应用内 RegexRule[]（缺失则空）
  const extensions = raw.extensions as Record<string, unknown> | undefined;
  const rawScripts = extensions?.regex_scripts;
  const hasRegexExtension = Array.isArray(rawScripts);
  let regexRules: RegexRule[] = [];
  if (hasRegexExtension && (rawScripts as unknown[]).length > 0) {
    try {
      regexRules = parseSTRegexImport(rawScripts);
    } catch {
      regexRules = [];
    }
  }

  // originalData = 全部原始字段，剔除已规范建模的三项（导出时重新拼回）
  const originalData: Record<string, unknown> = { ...raw };
  delete originalData.prompts;
  delete originalData.prompt_order;
  // extensions 保留（里面可能有 regex_scripts 之外的字段），导出时单独覆盖 regex_scripts

  return { prompts, promptOrder, regexRules, hasRegexExtension, originalData };
}

/** 把应用内规则拼回 extensions（保留 extensions 里的其它字段） */
function buildExtensions(np: NormalizedPreset): Record<string, unknown> | undefined {
  const origExt = (np.originalData.extensions as Record<string, unknown>) ?? undefined;
  // 没有原 extensions 且应用内也无正则 → 不写出 extensions
  if (!origExt && np.regexRules.length === 0 && !np.hasRegexExtension) return undefined;
  const scripts: STRegexScript[] = np.regexRules.map(ruleToSTScript);
  return {
    ...(origExt ?? {}),
    regex_scripts: scripts,
  };
}

/**
 * 导出为 ST 兼容预设 JSON 字符串。
 * - mode='full'：保留全部分组与条目（默认）
 * - mode='group'：只保留所选分组（含禁用条目），prompt_order 压成单组
 * - mode='smart'：只保留所选分组里 enabled 的条目，prompt_order 压成单组
 * 选组优先 groupIndex（能区分 character_id 重复的分组），否则按 activeCharacterId 匹配，兜底第一组。
 */
export function exportPreset(
  np: NormalizedPreset,
  options: { mode?: 'full' | 'group' | 'smart'; activeCharacterId?: number; groupIndex?: number } = {}
): string {
  const { mode = 'full', activeCharacterId, groupIndex } = options;

  let prompts = np.prompts;
  let promptOrder = np.promptOrder;

  if (mode !== 'full') {
    const group = (groupIndex !== undefined ? np.promptOrder[groupIndex] : undefined)
      ?? np.promptOrder.find((g) => g.character_id === activeCharacterId)
      ?? np.promptOrder[0];
    const keptOrder = mode === 'group'
      ? (group?.order ?? [])
      : (group?.order ?? []).filter((o) => o.enabled);
    const keptIds = new Set(keptOrder.map((o) => o.identifier));
    // ST 内置 marker（chatHistory/worldInfo/charDescription 等）即便未启用也必须保留，
    // 否则 ST 重新加载预设时会判定缺失并重置为默认，破坏用户配置。
    prompts = np.prompts.filter((p) => keptIds.has(p.identifier) || p.marker === true);
    // prompt_order 也要保留 marker 条目（以原启用状态），否则块在 prompts 里却不在 order 里，
    // 与 ST 原生行为（禁用块以 enabled:false 留在 order）不一致，导致插槽位置丢失。
    const markerOrder = (group?.order ?? []).filter((o) => {
      if (keptIds.has(o.identifier)) return false; // 已在 keptOrder 里
      const block = np.prompts.find((p) => p.identifier === o.identifier);
      return block?.marker === true;
    });
    promptOrder = [{ character_id: group?.character_id ?? activeCharacterId ?? DEFAULT_CHARACTER_ID, order: [...keptOrder, ...markerOrder] }];
  }

  const extensions = buildExtensions(np);
  const output: Record<string, unknown> = {
    ...np.originalData,
    prompts,
    prompt_order: promptOrder,
  };
  if (extensions) output.extensions = extensions;
  else delete output.extensions;

  return JSON.stringify(output, null, 2);
}

/** 导出为可读 Markdown 文档（参数表 + 激活顺序表 + 条目详情） */
export function exportPresetMarkdown(np: NormalizedPreset, name = '预设'): string {
  const lines: string[] = [];
  lines.push(`# ${name}`);
  lines.push('');

  // 全局参数
  const od = np.originalData;
  const paramKeys = [
    'temperature', 'top_p', 'top_k', 'min_p', 'frequency_penalty', 'presence_penalty',
    'openai_max_context', 'openai_max_tokens',
  ];
  const params = paramKeys.filter((k) => od[k] !== undefined);
  if (params.length > 0) {
    lines.push('## 全局参数');
    lines.push('');
    params.forEach((k) => lines.push(`- **${k}**: ${String(od[k])}`));
    lines.push('');
  }

  // 激活顺序表（用第一组）
  const group = np.promptOrder[0];
  if (group) {
    lines.push('## 激活顺序');
    lines.push('');
    lines.push('| # | 名称 | 角色 | 状态 |');
    lines.push('| --- | --- | --- | --- |');
    group.order.forEach((o, i) => {
      const block = np.prompts.find((p) => p.identifier === o.identifier);
      const roleTxt = block?.marker ? 'marker' : (block?.role ?? '-');
      lines.push(`| ${i + 1} | ${block?.name ?? o.identifier} | ${roleTxt} | ${o.enabled ? '✅' : '⬜'} |`);
    });
    lines.push('');
  }

  // 条目详情
  lines.push('## 条目详情');
  lines.push('');
  np.prompts.forEach((block) => {
    lines.push(`### ${block.name || block.identifier}`);
    if (block.marker) {
      lines.push('');
      lines.push('> （系统插槽，运行时动态填充）');
      lines.push('');
      return;
    }
    lines.push(`- 角色: ${block.role ?? '-'}`);
    if (block.injection_position !== undefined) {
      lines.push(`- 注入位置: ${block.injection_position} / 深度: ${block.injection_depth ?? '-'}`);
    }
    lines.push('');
    const content = (block.content ?? '').trim();
    if (content) {
      content.split('\n').forEach((ln) => lines.push(`> ${ln}`));
    } else {
      lines.push('> （空）');
    }
    lines.push('');
  });

  return lines.join('\n');
}

// ---- 条目状态判定 ----

/** 收集所有 prompt_order 组里引用过的 identifier */
export function collectReferencedIds(promptOrder: PromptOrderGroup[]): Set<string> {
  const set = new Set<string>();
  promptOrder.forEach((g) => g.order.forEach((o) => set.add(o.identifier)));
  return set;
}

/** prompt 是否未被任何 order 组引用 */
export function isUnreferenced(block: PromptBlock, referenced: Set<string>): boolean {
  return !referenced.has(block.identifier);
}

/** prompt 在指定 order 里 enabled=false 且无内容（空条目） */
export function isEmptyDisabled(block: PromptBlock, order: OrderEntry[]): boolean {
  if (block.marker) return false;
  const entry = order.find((o) => o.identifier === block.identifier);
  if (!entry || entry.enabled) return false;
  return !(block.content && block.content.trim());
}

// ---- 预览辅助 ----

/** 替换 {{char}} / {{user}} 宏（大小写不敏感） */
export function substituteVars(text: string, charName: string, userName: string): string {
  return text
    .replace(/\{\{char\}\}/gi, charName)
    .replace(/\{\{user\}\}/gi, userName);
}

/** 粗略 token 估算（~4 chars/token，仅供参考） */
export function estimateTokens(text: string): number {
  return Math.ceil((text?.length ?? 0) / 4);
}

/** 取当前角色组的 order */
export function getActiveOrder(np: NormalizedPreset, characterId: number): OrderEntry[] {
  return np.promptOrder.find((g) => g.character_id === characterId)?.order ?? [];
}

/** 探测预设使用的模型来源/模型名（用于概览展示） */
export function detectSourceModel(od: Record<string, unknown>): { source: string; model: string } {
  const source = (od.chat_completion_source as string) ?? '';
  const bySource = source ? (od[`${source}_model`] as string) : undefined;
  const model = bySource || (od.openai_model as string) || (od.claude_model as string)
    || (od.google_model as string) || '';
  return { source, model };
}
