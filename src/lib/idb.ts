/**
 * IndexedDB 公共连接层：全应用唯一的 openDB 实现（7 个模块共享一条连接）。
 *
 * 自愈能力：本地库版本号已到位但 object store 缺失（开发期热更/中断升级的遗留）时，
 * 事务会报 "One of the specified object stores was not found"。这里在打开成功后自检
 * store 完整性，缺失则以 实际版本+1 重开触发 onupgradeneeded 幂等补建。
 */

export const DB_NAME = 'st-chat-beautifier';
export const DB_VERSION = 6;

/** 全部 object store 名单。新增 store：在此登记 + DB_VERSION 加 1，所有调用点自动跟随。 */
export const ALL_STORES = [
  'books', // v1 书架
  'worldbooks', // v2 世界书
  'presets', // v3 预设
  'cards', // v4 角色卡
  'summaries', // v5 总结
  'summaryTemplates', // v5 总结模板
  'stories', // v6 故事树
] as const;

export type StoreName = (typeof ALL_STORES)[number];

let dbInstance: IDBDatabase | null = null;
let opening: Promise<IDBDatabase> | null = null;

/** 所有 store 同构：keyPath 'id' + updatedAt/title 两个非唯一索引；contains 守卫保证幂等。 */
function ensureAllStores(db: IDBDatabase) {
  for (const name of ALL_STORES) {
    if (!db.objectStoreNames.contains(name)) {
      const store = db.createObjectStore(name, { keyPath: 'id' });
      store.createIndex('updatedAt', 'updatedAt', { unique: false });
      store.createIndex('title', 'title', { unique: false });
    }
  }
}

function missingStores(db: IDBDatabase): string[] {
  return ALL_STORES.filter((name) => !db.objectStoreNames.contains(name));
}

function requestOpen(version?: number): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = version === undefined ? indexedDB.open(DB_NAME) : indexedDB.open(DB_NAME, version);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = () => ensureAllStores(request.result);
  });
}

async function openWithHeal(): Promise<IDBDatabase> {
  let db: IDBDatabase;
  try {
    db = await requestOpen(DB_VERSION);
  } catch (err) {
    // 本地实际版本高于代码常量（例如跑过更高版本的开发分支）：按现有版本打开，不降级
    if ((err as { name?: string } | null)?.name === 'VersionError') {
      db = await requestOpen();
    } else {
      throw err;
    }
  }

  const missing = missingStores(db);
  if (missing.length > 0) {
    // 自愈：用实际 version+1（而非 DB_VERSION+1，本地版本可能更高）触发升级补建
    const bumped = db.version + 1;
    db.close();
    db = await requestOpen(bumped);
    const still = missingStores(db);
    if (still.length > 0) {
      db.close();
      throw new Error(`IndexedDB 自愈失败，仍缺少 store：${still.join(', ')}`);
    }
  }
  return db;
}

export function openDB(): Promise<IDBDatabase> {
  if (dbInstance) return Promise.resolve(dbInstance);
  if (opening) return opening;
  opening = openWithHeal()
    .then((db) => {
      dbInstance = db;
      // 其他标签页升级版本时主动让路，避免对方 onblocked
      db.onversionchange = () => {
        db.close();
        if (dbInstance === db) dbInstance = null;
      };
      db.onclose = () => {
        if (dbInstance === db) dbInstance = null;
      };
      return db;
    })
    .finally(() => {
      opening = null;
    });
  return opening;
}

/** 关闭共享连接并清空单例（显式 close 不触发 onclose 事件，需手动清）。主要供测试使用。 */
export function closeDB(): void {
  dbInstance?.close();
  dbInstance = null;
}
