/**
 * 正则可视化生效预览（2.0 阶段5，定稿第六章）。
 * 对一段文本按规则顺序逐条应用，记录每条规则：是否参与（启用+作用对象匹配）、
 * 是否真的命中改动、应用前后的文本。UI 据此标出"哪条规则改了哪、哪条没命中"。
 * 应用顺序与导出/阅读一致（regex-processor.applyRegexRules 的逐条展开版）。
 */
import type { RegexRule } from '@/types/chat';
import { parseRegex } from '@/lib/regex-processor';

export interface RegexRuleEffect {
  ruleId: string;
  ruleName: string;
  /** 规则被禁用，未参与 */
  disabled: boolean;
  /** 启用且作用对象（用户楼/AI楼）匹配，参与了应用 */
  applied: boolean;
  /** 正则本身无法编译（写错了），参与但无效 */
  invalid: boolean;
  /** 实际命中并造成文本变化 */
  matched: boolean;
  /** 该规则应用前的文本 */
  before: string;
  /** 应用后的文本（未命中时与 before 相同） */
  after: string;
}

export interface RegexPreviewResult {
  final: string;
  effects: RegexRuleEffect[];
  /** 命中且改动文本的规则数 */
  matchedCount: number;
}

export function previewRegexRules(text: string, rules: RegexRule[], isUser = false): RegexPreviewResult {
  let current = text;
  const effects: RegexRuleEffect[] = [];

  for (const rule of rules) {
    const base: Omit<RegexRuleEffect, 'applied' | 'invalid' | 'matched' | 'after'> = {
      ruleId: rule.id,
      ruleName: rule.name,
      disabled: !!rule.disabled,
      before: current,
    };
    if (rule.disabled) {
      effects.push({ ...base, applied: false, invalid: false, matched: false, after: current });
      continue;
    }
    const shouldApply =
      rule.placement.length === 0 ||
      rule.placement.includes('all') ||
      (isUser && rule.placement.includes('user')) ||
      (!isUser && rule.placement.includes('assistant'));
    if (!shouldApply) {
      effects.push({ ...base, applied: false, invalid: false, matched: false, after: current });
      continue;
    }
    const regex = parseRegex(rule.findRegex);
    if (!regex) {
      effects.push({ ...base, applied: true, invalid: true, matched: false, after: current });
      continue;
    }
    const next = current.replace(regex, rule.replaceString);
    effects.push({ ...base, applied: true, invalid: false, matched: next !== current, after: next });
    current = next;
  }

  return { final: current, effects, matchedCount: effects.filter((e) => e.matched).length };
}

/**
 * 前后文本的最小差异切分（公共前后缀裁剪），供 UI 高亮"改了哪里"。
 * 多处改动会被并成中间一段——足够肉眼定位，不追求逐字符 diff。
 */
export function diffParts(before: string, after: string): {
  prefix: string;
  removed: string;
  added: string;
  suffix: string;
} {
  let start = 0;
  const minLen = Math.min(before.length, after.length);
  while (start < minLen && before[start] === after[start]) start++;
  let endB = before.length;
  let endA = after.length;
  while (endB > start && endA > start && before[endB - 1] === after[endA - 1]) {
    endB--;
    endA--;
  }
  return {
    prefix: before.slice(0, start),
    removed: before.slice(start, endB),
    added: after.slice(start, endA),
    suffix: before.slice(endB),
  };
}
