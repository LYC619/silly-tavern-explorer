/**
 * 简介清洗管道（10.0，0801 反馈 角色库#5 + 角色页#1）。
 * 很多卡的字段是 prompt 而非人读简介，展示前按优先级找第一段「像人话」的内容：
 *   creator_notes（先过声明类识别，版权声明降级）> scenario > personality > description 前100字清洗 > ''（调用方显示「暂无简介」）
 * 过滤：代码块 / YAML / JSON / {{char}} 等占位符开头 / 英文 prompt 指令。
 * 消费方：角色库卡面、首页角色卡、角色页默认简介（经 lib/character-intro 统一出口）。
 */

/** 声明类文本（版权/授权声明不是简介）：命中即整段跳过降级。中英关键词，用户库里有实例 */
const DECLARATION_PATTERNS = [
  /禁止/, /转载/, /盗用/, /商用/, /授权/, /二传/, /搬运/,
  /commercial/i, /repost/i, /copyright/i, /all rights reserved/i, /do not (use|copy|share|repost|redistribute)/i,
];

export function isDeclarationText(s: string): boolean {
  return DECLARATION_PATTERNS.some((p) => p.test(s));
}

/** 英文 prompt 指令开头（对普通用户是乱码的那类） */
const PROMPT_INSTRUCTION_PATTERNS = [
  /^you are\b/i, /^you're\b/i, /^\[?system note/i, /^as an ai\b/i,
  /^this (character|card|bot)\b/i, /^instructions?\s*[:：]/i, /^respond (as|in|with)\b/i, /^always\b/i, /^never\b/i,
];

/**
 * 不可读判定：整段是给模型看的格式化文本，不适合当简介。
 * - 代码块/代码标记开头（``` 或 <tag> 或 # 注释式标题带配置词）
 * - YAML（--- 开头 / 前几行是 key: value 形态）
 * - JSON（{ 或 [ 开头）
 * - {{char}}/{{user}} 等宏占位符开头
 * - 英文 prompt 指令开头
 */
export function isUnreadable(s: string): boolean {
  const t = s.trim();
  if (!t) return true;
  if (t.startsWith('```') || t.startsWith('<') || t.startsWith('{') || t.startsWith('[')) return true;
  if (t.startsWith('---')) return true;
  if (/^\{\{[^}]+\}\}/.test(t)) return true;
  if (PROMPT_INSTRUCTION_PATTERNS.some((p) => p.test(t))) return true;
  // YAML/配置形态：首行是 key: 或 key = （容忍前置 # 注释行）
  const firstLine = t.split('\n').find((l) => l.trim() && !l.trim().startsWith('#'))?.trim() ?? '';
  if (/^[A-Za-z_][\w-]*\s*[:=]\s*($|\S)/.test(firstLine) && !/^https?:/.test(firstLine)) return true;
  return false;
}

/** 单候选清洗：不可读→null；可读则替换宏、压空白 */
function cleanCandidate(s: string | undefined, charName: string): string | null {
  if (!s) return null;
  const t = s.trim();
  if (isUnreadable(t)) return null;
  const cleaned = t
    .replace(/\{\{char\}\}/gi, charName || '角色')
    .replace(/\{\{user\}\}/gi, '你')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned || null;
}

export interface IntroSource {
  name?: string;
  creator_notes?: string;
  scenario?: string;
  personality?: string;
  description?: string;
}

/**
 * 按优先级取第一段可读简介；全军覆没返回 ''（调用方显示「暂无简介」）。
 * creator_notes 先过声明类识别；description 清洗后截前 100 字。
 */
export function cleanIntro(src: IntroSource): string {
  const name = src.name ?? '';
  const notes = src.creator_notes?.trim();
  if (notes && !isDeclarationText(notes)) {
    const c = cleanCandidate(notes, name);
    if (c) return c;
  }
  const scenario = cleanCandidate(src.scenario, name);
  if (scenario) return scenario;
  const personality = cleanCandidate(src.personality, name);
  if (personality) return personality;
  const desc = cleanCandidate(src.description, name);
  if (desc) return desc.slice(0, 100);
  return '';
}
