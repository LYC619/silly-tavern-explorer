/**
 * 仓库入口（2.0 阶段7.2b）：createRepo 返回惰性代理 Repo——
 * 每次调用时看文件库是否激活：激活走 vault.repo(store)（客户端明文文件库），
 * 未激活走原 createIdbRepo 单例（网页版行为完全不变）。
 * 各 *-db.ts 一律从这里拿 Repo，不再直接用 createIdbRepo。
 */
import type { StoreName } from '@/lib/idb';
import { getActiveVault } from '@/lib/vault/active';
import { createIdbRepo, type BaseRecord, type Repo } from './idb-repo';

export type { BaseRecord, Repo } from './idb-repo';
export { pruneAutoSaved } from './idb-repo';

/**
 * 在一次业务操作开始时捕获当前后端。
 * 文件库切换会替换模块态 active；调用方若需要排队写入，必须在入队前捕获，
 * 否则排队任务真正执行时可能把旧库数据写进新库。
 */
export function getCurrentRepo<T extends BaseRecord>(store: StoreName): Repo<T> {
  const active = getActiveVault();
  if (active) return active.repo<T>(store);
  const cached = idbRepos.get(store);
  if (cached) return cached as Repo<T>;
  const created = createIdbRepo<T>(store);
  idbRepos.set(store, created as Repo<BaseRecord>);
  return created;
}

const idbRepos = new Map<StoreName, Repo<BaseRecord>>();

export function createRepo<T extends BaseRecord>(store: StoreName): Repo<T> {
  return {
    list: () => getCurrentRepo<T>(store).list(),
    listLight: () => getCurrentRepo<T>(store).listLight(),
    get: (id) => getCurrentRepo<T>(store).get(id),
    put: (item, opts) => getCurrentRepo<T>(store).put(item, opts),
    remove: (id) => getCurrentRepo<T>(store).remove(id),
  };
}
