/**
 * 总结生成引擎：把「楼层区间 + 模板 + 可选预设/世界书 + 前情总结」组装成 OpenAI messages 数组。
 *
 * 对齐 SillyTavern 的上下文语义：
 * - 楼层消息落在「聊天历史」块（chatHistory marker）位置；
 * - 模板提示词作为聊天历史最末一条 user 消息注入（D0）——与 ST 用户把总结请求作为最新消息发出一致；
 * - 挂预设时按激活顺序展开各块，chatHistory 处填入楼层消息，其后的 post-history 块（如 jailbreak）
 *   自然落在模板之后；未挂预设时用最小骨架（世界书设定 → 前情 → 楼层 → D0 模板）。
 * - 世界书 position=6 (@depth) 条目按 depth 精确插入聊天倒数第 depth 层（role 按条目 role）；
 *   预设 injection_position=1 的绝对注入块同机制。position 0-5 在无角色卡上下文里近似归位。
 *
 * 纯函数、无副作用、不触网，便于单测。实际请求由调用方用返回的 messages 调 callOpenAIMessages。
 */

import type { ChatSession } from '@/types/chat';
import type { NormalizedPreset, PromptBlock } from '@/types/preset';
import type { WorldBook, WorldBookEntry } from '@/types/worldbook';
import type { SummaryItem } from '@/types/summary';
import type { ChatCompletionMessage, SamplingParams } from '@/components/ai-tools/useOpenAI';
import { substituteVars, estimateTokens, getActiveOrder } from '@/lib/preset-parser';
import { DEFAULT_CHARACTER_ID } from '@/types/preset';

export type WorldbookMode = 'constant' | 'all' | 'manual';

export interface SummaryEngineInput {
  session: ChatSession;
  /** 0-based 闭区间，与聊天页楼层号一致 */
  floorStart: number;
  floorEnd: number;
  /** 模板全文（含 {{char}}/{{user}}/{{volume}} 宏），作为 D0 user 消息 */
  template: string;
  /** 可选挂载的预设 */
  preset?: NormalizedPreset;
  presetCharacterId?: number;
  /** 可选挂载的世界书 */
  worldbook?: WorldBook;
  worldbookMode?: WorldbookMode;
  /** manual 模式下选中的条目 uid */
  worldbookUids?: number[];
  /** 分卷连贯性：前 N-1 卷（按卷号升序） */
  priorSummaries?: SummaryItem[];
  /** kind=volume 时的卷号，替换 {{volume}} */
  volumeNumber?: number;
  options?: {
    /** 楼层消息 content 前是否加「名字: 」前缀（默认 true） */
    speakerPrefix?: boolean;
  };
}

export interface SummaryEngineResult {
  messages: ChatCompletionMessage[];
  tokenEstimate: number;
  /** 采样参数（挂预设时从 originalData 读取，供 callOpenAIMessages 透传） */
  params?: SamplingParams;
  warnings: string[];
}

type Role = 'system' | 'user' | 'assistant';

/** 楼层消息的角色名取法（对齐 AITools/AIUpdateDialog 既有惯例） */
function speakerName(session: ChatSession, isUser: boolean): string {
  return isUser
    ? session.user?.name || 'User'
    : session.character?.name || 'Character';
}

/** 从会话取楼层闭区间的消息，转成 chat message（可选带说话人前缀） */
function buildFloorMessages(
  session: ChatSession,
  floorStart: number,
  floorEnd: number,
  speakerPrefix: boolean
): ChatCompletionMessage[] {
  const lo = Math.max(0, Math.min(floorStart, floorEnd));
  const hi = Math.min(session.messages.length - 1, Math.max(floorStart, floorEnd));
  const out: ChatCompletionMessage[] = [];
  for (let i = lo; i <= hi; i++) {
    const m = session.messages[i];
    if (!m) continue;
    const isUser = m.role === 'user' || m.is_user === true;
    const role: Role = isUser ? 'user' : 'assistant';
    const content = speakerPrefix ? `${speakerName(session, isUser)}: ${m.content}` : m.content;
    out.push({ role, content });
  }
  return out;
}

/**
 * 把一条 @depth 注入消息插入楼层消息数组：depth=0 追加到末尾，depth=N 插到倒数第 N 条之前。
 * 同深度多条按 order 降序（大者更靠近末尾/模型），调用方需先排序好再逐条插入。
 * 返回新数组，不改入参。
 */
export function insertAtDepth(
  floorMessages: ChatCompletionMessage[],
  msg: ChatCompletionMessage,
  depth: number
): ChatCompletionMessage[] {
  const arr = [...floorMessages];
  const d = Math.max(0, Math.floor(depth));
  const idx = Math.max(0, arr.length - d);
  arr.splice(idx, 0, msg);
  return arr;
}

/** WorldBookEntry.role 数字 → chat role */
function wbRole(role: number | undefined): Role {
  if (role === 1) return 'user';
  if (role === 2) return 'assistant';
  return 'system';
}

/**
 * 按模式收集入选的世界书条目（仅启用条目）。
 * constant=仅常驻(蓝灯)；all=全部启用；manual=uid 命中且启用。
 */
export function collectWorldbookEntries(
  wb: WorldBook,
  mode: WorldbookMode,
  uids?: number[]
): WorldBookEntry[] {
  const uidSet = new Set(uids ?? []);
  return Object.values(wb.entries)
    .filter((e) => e.enabled !== false)
    .filter((e) => {
      if (mode === 'all') return true;
      if (mode === 'constant') return e.constant === true;
      return uidSet.has(e.uid);
    });
}

/** 把非 @depth 世界书条目（position 0-5）合并为一块文本；@depth(6) 条目由调用方单独插入 */
function worldbookStaticBlock(entries: WorldBookEntry[]): string {
  const statics = entries
    .filter((e) => e.position !== 6)
    .sort((a, b) => (a.position - b.position) || (b.order - a.order));
  const parts = statics.map((e) => e.content?.trim()).filter(Boolean) as string[];
  return parts.join('\n\n');
}

/** 前情存档块：前 N-1 卷拼接，格式借鉴 st-memory-wizzard formatRecordForInject */
export function buildPriorBlock(priors: SummaryItem[]): string {
  const parts = priors.map((s) => {
    const label = s.volumeNumber != null
      ? `第${s.volumeNumber}卷 - ${s.title}`
      : s.title;
    const range = `楼层 ${s.floorStart}~${s.floorEnd}`;
    return `【${label} | ${range}】\n${s.content.trim()}`;
  });
  return parts.join('\n\n---\n\n');
}

/**
 * 下一卷卷号 = 已有最大卷号 + 1（无已存卷 → 1）。
 * 旧版把「起始楼层相同」视为重做同卷并沿用其卷号，实测反直觉：用户生成第一卷后不改楼层
 * 再点生成，得到的还是"第一卷"。现在永远顺延；重做某卷/自定义号时在页面的卷号输入框手改。
 */
export function inferVolumeNumber(
  priorVolumes: Pick<SummaryItem, 'volumeNumber'>[]
): number {
  return priorVolumes.length
    ? Math.max(...priorVolumes.map((v) => v.volumeNumber ?? 0)) + 1
    : 1;
}

/** 从 AI 输出提取标题：分卷取「第X卷 - 卷名」，日记取首个 **标题**，失败返回空串（回退手输） */
export function extractTitle(kind: 'volume' | 'diary' | 'diy', output: string): string {
  if (kind === 'volume') {
    const m = output.match(/第\s*[\d一二三四五六七八九十百]+\s*卷\s*[-—:：]\s*([^\n#*]+)/);
    if (m) return m[1].trim();
  }
  if (kind === 'diary') {
    const m = output.match(/\*\*([^*\n]+)\*\*/);
    if (m) return m[1].trim();
  }
  return '';
}

/** 读预设采样参数（originalData 里的常见字段），供透传 */
function readSamplingParams(preset: NormalizedPreset): SamplingParams | undefined {
  const od = preset.originalData;
  const params: SamplingParams = {};
  const num = (v: unknown): number | undefined => (typeof v === 'number' && isFinite(v) ? v : undefined);
  const t = num(od.temperature); if (t !== undefined) params.temperature = t;
  const tp = num(od.top_p); if (tp !== undefined) params.top_p = tp;
  const fp = num(od.frequency_penalty); if (fp !== undefined) params.frequency_penalty = fp;
  const pp = num(od.presence_penalty); if (pp !== undefined) params.presence_penalty = pp;
  const mt = num(od.openai_max_tokens) ?? num(od.max_tokens);
  if (mt !== undefined) params.max_tokens = mt;
  return Object.keys(params).length ? params : undefined;
}

/**
 * 主入口：组装总结请求的 messages。
 */
export function buildSummaryMessages(input: SummaryEngineInput): SummaryEngineResult {
  const {
    session, floorStart, floorEnd, template,
    preset, presetCharacterId, worldbook, worldbookMode = 'constant', worldbookUids,
    priorSummaries = [], volumeNumber, options = {},
  } = input;

  const speakerPrefix = options.speakerPrefix !== false;
  const warnings: string[] = [];

  const charName = session.character?.name || 'Character';
  const userName = session.user?.name || 'User';

  // 宏替换：{{char}}/{{user}} + {{volume}}
  const macro = (text: string): string => {
    let t = substituteVars(text, charName, userName);
    if (volumeNumber != null) t = t.replace(/\{\{volume\}\}/gi, String(volumeNumber));
    return t;
  };

  const templateMsg: ChatCompletionMessage = { role: 'user', content: macro(template) };

  // 楼层消息（可能被 @depth 条目插入）
  let floorMsgs = buildFloorMessages(session, floorStart, floorEnd, speakerPrefix);
  if (floorMsgs.length === 0) warnings.push('选中的楼层范围没有消息');

  // 世界书条目
  const wbEntries = worldbook ? collectWorldbookEntries(worldbook, worldbookMode, worldbookUids) : [];
  const wbStatic = wbEntries.length ? worldbookStaticBlock(wbEntries) : '';
  const wbDepthEntries = wbEntries.filter((e) => e.position === 6);
  // @depth 注入：按 depth 分组，同 depth 内 order 升序逐条插入（order 大者后插=更靠近末尾）
  const applyDepthInjections = () => {
    const sorted = [...wbDepthEntries].sort((a, b) => (a.depth - b.depth) || (a.order - b.order));
    for (const e of sorted) {
      const content = macro(e.content?.trim() || '');
      if (!content) continue;
      floorMsgs = insertAtDepth(floorMsgs, { role: wbRole(e.role), content }, e.depth ?? 4);
    }
  };

  const priorBlock = priorSummaries.length ? buildPriorBlock(priorSummaries) : '';

  const messages: ChatCompletionMessage[] = [];

  if (!preset) {
    // ---- 无预设：最小骨架 ----
    if (wbStatic) messages.push({ role: 'system', content: `【世界观设定】\n${wbStatic}` });
    if (priorBlock) messages.push({ role: 'system', content: `【前情存档】\n${priorBlock}` });
    applyDepthInjections();
    messages.push(...floorMsgs);
    messages.push(templateMsg);
  } else {
    // ---- 挂预设：按激活顺序展开 ----
    const charId = presetCharacterId ?? DEFAULT_CHARACTER_ID;
    const order = getActiveOrder(preset, charId);
    const blockMap = new Map<string, PromptBlock>(preset.prompts.map((p) => [p.identifier, p]));

    // 先处理预设自身的绝对注入块（injection_position=1）——按 @depth 插入楼层
    const injectionBlocks = preset.prompts.filter(
      (p) => !p.marker && p.injection_position === 1 && typeof p.content === 'string' && p.content.trim()
    );
    const injSorted = [...injectionBlocks].sort(
      (a, b) => ((a.injection_depth ?? 4) - (b.injection_depth ?? 4))
        || (((a.injection_order as number) ?? 100) - ((b.injection_order as number) ?? 100))
    );
    applyDepthInjections();
    for (const b of injSorted) {
      floorMsgs = insertAtDepth(
        floorMsgs,
        { role: (b.role as Role) ?? 'system', content: macro(b.content!) },
        b.injection_depth ?? 4
      );
    }

    const injectionIds = new Set(injectionBlocks.map((b) => b.identifier));
    let chatHistoryEmitted = false;

    for (const entry of order) {
      if (!entry.enabled) continue;
      const block = blockMap.get(entry.identifier);
      if (!block) continue;
      if (injectionIds.has(block.identifier)) continue; // 注入块已处理

      if (block.marker) {
        switch (block.identifier) {
          case 'chatHistory':
            if (priorBlock) messages.push({ role: 'system', content: `【前情存档】\n${priorBlock}` });
            messages.push(...floorMsgs);
            messages.push(templateMsg); // D0：模板作为聊天末尾的用户消息
            chatHistoryEmitted = true;
            break;
          case 'worldInfoBefore':
          case 'worldInfoAfter':
            if (wbStatic) messages.push({ role: 'system', content: `【世界观设定】\n${wbStatic}` });
            break;
          // charDescription/charPersonality/scenario/dialogueExamples/personaDescription：
          // 一期无角色卡挂载，跳过（marker 运行时无内容）
          default:
            break;
        }
      } else if (typeof block.content === 'string' && block.content.trim()) {
        messages.push({ role: (block.role as Role) ?? 'system', content: macro(block.content) });
      }
    }

    // 预设未启用 chatHistory（异常）→ 兜底把楼层+模板追加到末尾
    if (!chatHistoryEmitted) {
      warnings.push('预设未启用「聊天历史」块，已把楼层与模板追加到末尾');
      if (priorBlock) messages.push({ role: 'system', content: `【前情存档】\n${priorBlock}` });
      messages.push(...floorMsgs);
      messages.push(templateMsg);
    }

    // 世界书挂了但预设没有 worldInfo marker → 提示可能未注入
    if (wbStatic && !order.some((o) => o.enabled && (o.identifier === 'worldInfoBefore' || o.identifier === 'worldInfoAfter'))) {
      warnings.push('已挂世界书，但预设未启用「世界书」插槽，静态条目未注入');
    }
  }

  const tokenEstimate = messages.reduce((sum, m) => sum + estimateTokens(m.content), 0);
  const params = preset ? readSamplingParams(preset) : undefined;

  return { messages, tokenEstimate, params, warnings };
}
