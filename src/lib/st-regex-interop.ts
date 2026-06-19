import type { RegexRule } from '@/types/chat';

/**
 * SillyTavern 正则脚本互通层。
 * 依据 _reference/st-docs/04-regex-script-format.md。
 *
 * 本应用内部用精简的 RegexRule（findRegex/replaceString/placement('all'|'user'|'assistant')/disabled）。
 * ST 正则脚本字段更全（trimStrings/markdownOnly/promptOnly/runOnEdit/substituteRegex/min,maxDepth）。
 * 导入时把 ST 多出的字段原样存到 RegexRule._raw，导出时拼回去，做到无损 round-trip。
 */

/** ST placement 数字枚举：1=User Input, 2=AI Output, 3=Slash, 4=World Info, 5=Reasoning */
export const ST_PLACEMENT = {
  USER_INPUT: 1,
  AI_OUTPUT: 2,
  SLASH: 3,
  WORLD_INFO: 4,
  REASONING: 5,
} as const;

/** ST 正则脚本对象（导入/导出的线格式） */
export interface STRegexScript {
  id?: string;
  scriptName: string;
  findRegex: string;
  replaceString: string;
  trimStrings?: string[];
  placement: number[];
  disabled?: boolean;
  markdownOnly?: boolean;
  promptOnly?: boolean;
  runOnEdit?: boolean;
  substituteRegex?: number;
  minDepth?: number | null;
  maxDepth?: number | null;
  [key: string]: unknown;
}

/** 把 ST 的数字 placement 数组映射为应用内的 ('all'|'user'|'assistant')[] */
function placementFromST(placement: number[] | undefined): ('all' | 'user' | 'assistant')[] {
  const set = new Set(placement ?? []);
  const hasUser = set.has(ST_PLACEMENT.USER_INPUT);
  const hasAI = set.has(ST_PLACEMENT.AI_OUTPUT);
  if (hasUser && hasAI) return ['all'];
  const result: ('user' | 'assistant')[] = [];
  if (hasUser) result.push('user');
  if (hasAI) result.push('assistant');
  // 既不含 user 也不含 AI（例如只作用于 WI/slash/reasoning）→ 应用内无对应粒度，按 all 兜底
  return result.length > 0 ? result : ['all'];
}

/** 把应用内 placement 映射回 ST 数字数组 */
function placementToST(placement: ('all' | 'user' | 'assistant')[]): number[] {
  if (placement.includes('all')) return [ST_PLACEMENT.USER_INPUT, ST_PLACEMENT.AI_OUTPUT];
  const result: number[] = [];
  if (placement.includes('user')) result.push(ST_PLACEMENT.USER_INPUT);
  if (placement.includes('assistant')) result.push(ST_PLACEMENT.AI_OUTPUT);
  return result.length > 0 ? result : [ST_PLACEMENT.USER_INPUT, ST_PLACEMENT.AI_OUTPUT];
}

/** ST 正则脚本 → 应用内 RegexRule（ST 独有字段存入 _raw 以便无损导回） */
export function stScriptToRule(script: STRegexScript): RegexRule {
  const { id, scriptName, findRegex, replaceString, placement, disabled, ...rest } = script;
  return {
    id: id || crypto.randomUUID(),
    name: scriptName || '未命名规则',
    findRegex: findRegex || '',
    replaceString: replaceString ?? '',
    placement: placementFromST(placement),
    disabled: !!disabled,
    // 保留 ST 独有字段（trimStrings/markdownOnly/... 及任何未知字段），导出时拼回
    _raw: rest,
  };
}

/** 应用内 RegexRule → ST 正则脚本（拼回 _raw 里保留的原始字段） */
export function ruleToSTScript(rule: RegexRule): STRegexScript {
  const raw = (rule._raw as Record<string, unknown> | undefined) ?? {};
  return {
    // ST 默认值（_raw 里有就被覆盖）
    trimStrings: [],
    markdownOnly: false,
    promptOnly: false,
    runOnEdit: true,
    substituteRegex: 0,
    minDepth: null,
    maxDepth: null,
    ...raw,
    // 应用内权威字段始终覆盖
    id: rule.id,
    scriptName: rule.name,
    findRegex: rule.findRegex,
    replaceString: rule.replaceString,
    placement: placementToST(rule.placement),
    disabled: rule.disabled,
  };
}

/**
 * 解析一个 ST 正则导入文件的 JSON。支持三种形态：
 * - 单个脚本对象 { scriptName, findRegex, ... }
 * - 裸数组 [ {...}, {...} ]
 * - 打包对象 { scripts: [ {...} ] }（社区格式）
 * 返回应用内 RegexRule 数组。无法识别时抛错。
 */
export function parseSTRegexImport(json: unknown): RegexRule[] {
  let scripts: unknown[];
  if (Array.isArray(json)) {
    scripts = json;
  } else if (json && typeof json === 'object' && Array.isArray((json as Record<string, unknown>).scripts)) {
    scripts = (json as Record<string, unknown>).scripts as unknown[];
  } else if (json && typeof json === 'object' && 'findRegex' in (json as Record<string, unknown>)) {
    scripts = [json];
  } else {
    throw new Error('无法识别的正则脚本格式（应为单个脚本、脚本数组，或含 scripts 字段的对象）');
  }
  return scripts
    .filter((s): s is STRegexScript => !!s && typeof s === 'object')
    .map(stScriptToRule);
}

/** 把应用内规则导出为 ST 正则脚本 JSON 字符串。
 *  单条 → 单对象（与 ST 单脚本导出一致）；多条 → 数组。 */
export function exportSTRegex(rules: RegexRule[]): string {
  const scripts = rules.map(ruleToSTScript);
  const payload = scripts.length === 1 ? scripts[0] : scripts;
  return JSON.stringify(payload, null, 2);
}
