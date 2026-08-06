import type { ArchiveCharacter } from '@/types/archive';
import {
  applyRatingTierTag,
  NSFW_TAG,
  RATING_TIER_LABELS,
  ratingTier,
  syncNsfwTag,
} from '@/lib/tag-taxonomy';

type CharacterTagFields = Pick<Partial<ArchiveCharacter>, 'tags' | 'nsfw' | 'rating'>;

function isRatingTierTag(raw: string): boolean {
  return raw.startsWith('评价/') && RATING_TIER_LABELS.includes(raw.slice('评价/'.length) as (typeof RATING_TIER_LABELS)[number]);
}

function validateRating(rating: number | undefined): void {
  if (rating === undefined) return;
  if (!Number.isFinite(rating) || rating < 0 || rating > 10) {
    throw new Error('评分必须在 0 到 10 之间');
  }
}

/** 所有角色标签/评分/NSFW 写入的唯一真源。 */
export function applyCharacterTagPatch(
  current: Pick<ArchiveCharacter, 'tags' | 'nsfw' | 'rating'>,
  patch: CharacterTagFields,
): CharacterTagFields {
  const hasTags = 'tags' in patch;
  const hasNsfw = 'nsfw' in patch;
  const hasRating = 'rating' in patch;
  validateRating(patch.rating);

  let tags = hasTags ? [...(patch.tags ?? [])] : [...current.tags];
  if (tags.some(isRatingTierTag) && patch.rating === undefined && current.rating === undefined) {
    throw new Error('评价档位必须通过评分维护');
  }

  if (hasRating) {
    tags = applyRatingTierTag(tags, patch.rating);
  } else if (current.rating !== undefined) {
    const expected = `评价/${ratingTier(current.rating)}`;
    const suppliedTiers = tags.filter(isRatingTierTag);
    if (suppliedTiers.some((raw) => raw !== expected)) {
      throw new Error('评价档位与评分不一致');
    }
    tags = applyRatingTierTag(tags, current.rating);
  }

  if (hasTags && hasNsfw && Boolean(patch.nsfw) !== tags.includes(NSFW_TAG)) {
    throw new Error('NSFW 字段与卡面标签不一致');
  }
  const nsfw = hasTags ? tags.includes(NSFW_TAG) : hasNsfw ? Boolean(patch.nsfw) : Boolean(current.nsfw);
  if (hasNsfw && !hasTags) tags = syncNsfwTag(tags, nsfw);

  return {
    ...patch,
    ...(hasTags || hasNsfw || hasRating || current.rating !== undefined ? { tags } : {}),
    ...(hasTags || hasNsfw ? { nsfw } : {}),
  };
}
