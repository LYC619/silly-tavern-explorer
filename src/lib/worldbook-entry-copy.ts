/**
 * 世界书条目跨书复制/转移（2.0 阶段9.8 余项）。
 * 纯函数：把一批条目追加进目标世界书，uid 按目标现有最大值顺延重编号，
 * 避免与目标撞号；条目内容深拷贝，与来源书完全解耦。
 * 「转移」= 复制到目标 + 调用方从来源书删除（删除复用现有批量删除逻辑）。
 */
import type { WorldBook, WorldBookEntry } from '@/types/worldbook';

export function appendEntries(target: WorldBook, entries: WorldBookEntry[]): WorldBook {
  const merged = { ...target.entries };
  let nextUid = -1;
  for (const [key, e] of Object.entries(merged)) {
    const n = typeof e.uid === 'number' ? e.uid : Number(key);
    if (Number.isFinite(n) && n > nextUid) nextUid = n;
  }
  nextUid += 1;
  for (const e of entries) {
    const clone = JSON.parse(JSON.stringify(e)) as WorldBookEntry;
    clone.uid = nextUid;
    merged[String(nextUid)] = clone;
    nextUid += 1;
  }
  return { ...target, entries: merged };
}
