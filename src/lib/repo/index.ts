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

export function createRepo<T extends BaseRecord>(store: StoreName): Repo<T> {
  let idb: Repo<T> | undefined;
  const pick = (): Repo<T> => getActiveVault()?.repo<T>(store) ?? (idb ??= createIdbRepo<T>(store));
  return {
    list: () => pick().list(),
    get: (id) => pick().get(id),
    put: (item) => pick().put(item),
    remove: (id) => pick().remove(id),
  };
}
