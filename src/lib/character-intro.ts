/**
 * 角色卡展示简介（10.1 从 Library 抽出；10.0 接入 intro-clean 清洗管道）。
 * 优先级：STE 简介（intro 功能，用户手动/AI 采用）→ cleanIntro 管道
 * （creator_notes 声明类降级 > scenario > personality > description 前100字清洗）→ undefined（调用方显示「暂无简介」）。
 */
import type { ArchiveCharacter } from '@/types/archive';
import { normalizeCharacterCard } from '@/lib/png-parser';
import { cleanIntro } from '@/lib/intro-clean';

export function introOf(c: ArchiveCharacter): string | undefined {
  const intro = c.intro?.current.content.trim();
  if (intro) return intro;
  const n = normalizeCharacterCard(c.card);
  const cleaned = cleanIntro({
    name: c.name,
    creator_notes: n.creatorNotes,
    scenario: n.scenario,
    personality: n.personality,
    description: n.description,
  });
  return cleaned || undefined;
}
