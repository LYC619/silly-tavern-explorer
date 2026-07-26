/**
 * 检查 ST 更新（2.0 阶段7.4，定稿：开故事时轻量比楼层数→角落提示→点击导入）。
 * 纯函数层：文本进、结果出；读 sourcePath 文件的 IO 在组件侧（readAbsText）。
 * 合并复用 4.2 的 mergeReimport 规则；只作用于主线（sourcePath 记录的就是主线来源，
 * 分支文件的更新走 IOPanel 手动重导）。
 */
import { parseJsonl } from '@/lib/adapters/st/chat-jsonl';
import { mergeReimport, type ReimportMergeResult } from '@/lib/adapters/st';
import { updateBranchLine } from '@/lib/archive-db';
import type { ArchiveStory } from '@/types/archive';

export interface STUpdateStatus {
  stFloors: number;
  steFloors: number;
  /** ST 端多出的楼数（提示文案用） */
  extraFloors: number;
  /** 仅楼层数变多才提示——同楼数的内容差异不打扰，用户可随时手动重导 */
  hasUpdate: boolean;
}

/** 轻量比对：只数楼层，不合并不写 */
export function compareSTText(jsonlText: string, story: ArchiveStory): STUpdateStatus {
  const stFloors = parseJsonl(jsonlText).messages.length;
  const steFloors = story.session.messages.length;
  return {
    stFloors,
    steFloors,
    extraFloors: Math.max(0, stFloors - steFloors),
    hasUpdate: stFloors > steFloors,
  };
}

/** 按 4.2 规则把 ST 文件合并进主线；调用方拿 result.changed 决定是否落库 */
export function mergeSTText(
  jsonlText: string,
  story: ArchiveStory,
): { story: ArchiveStory; result: ReimportMergeResult } {
  const result = mergeReimport(story.session, parseJsonl(jsonlText));
  const updated = updateBranchLine(story, null, { session: result.session });
  return { story: { ...updated, lastImportedAt: Date.now() }, result };
}
