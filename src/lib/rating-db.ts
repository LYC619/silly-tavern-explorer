/**
 * 评分模板存储（2.0 阶段6，定稿第四章·评分）。
 * 内置模板是代码常量（lib/rating-templates.ts），不入库；
 * 此处只存用户自定义模板（内置复制出来的副本也算自定义）。
 */
import type { RatingTemplateItem } from '@/types/rating';
import { createIdbRepo } from '@/lib/repo/idb-repo';

const repo = createIdbRepo<RatingTemplateItem>('ratingTemplates');

export async function getAllRatingTemplates(): Promise<RatingTemplateItem[]> {
  return repo.list();
}

export async function getRatingTemplate(id: string): Promise<RatingTemplateItem | undefined> {
  return repo.get(id);
}

export async function saveRatingTemplate(item: RatingTemplateItem): Promise<void> {
  return repo.put(item);
}

export async function deleteRatingTemplate(id: string): Promise<void> {
  return repo.remove(id);
}
