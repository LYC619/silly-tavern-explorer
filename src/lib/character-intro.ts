/**
 * 角色卡展示简介（10.1 从 Library 抽出，首页/角色库共用）。
 * 优先级：STE 简介（intro 功能）→ 卡的 creator_notes 首行（subtitle）→ 卡内 description 摘要。
 * description 是角色定义原文，可能含 {{char}}/{{user}} 宏，展示前替换为角色名/「你」。
 * 注：10.0 会引入 intro-clean.ts 清洗管道（声明类识别/代码块过滤等），届时本函数升级为其调用方。
 */
import type { ArchiveCharacter } from '@/types/archive';

export function introOf(c: ArchiveCharacter): string | undefined {
  const intro = c.intro?.current.content.trim();
  if (intro) return intro;
  if (c.subtitle) return c.subtitle;
  const card = c.card as { data?: { description?: string }; description?: string };
  const desc = (card.data?.description ?? card.description ?? '')
    .replace(/\{\{char\}\}/gi, c.name)
    .replace(/\{\{user\}\}/gi, '你')
    .replace(/\s+/g, ' ')
    .trim();
  return desc ? desc.slice(0, 120) : undefined;
}
