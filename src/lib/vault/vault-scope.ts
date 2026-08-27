/**
 * 当前库的 localStorage 作用域（按库隔离偏好）。
 *
 * 客户端整个应用跑在同一个 webview origin 上，localStorage 因此天然是**跨库共享**的：
 * 换库不换存储，A 库的引导状态、当前故事 id 会原样出现在 B 库。对「当前故事 id」
 * 这类指向库内实体的键，跨库共享不只是偏好串味，是直接指向不存在的数据。
 *
 * 这里不换存储后端，只给键名加库后缀：`onboarding-home-completed@vault-1a2b3c`。
 * 库 id 是路径哈希（见 vault-registry.stableId），跨重启稳定，可以直接进键名。
 *
 * 启动接线（bootVault）在放行页面前调用 setCurrentVaultId，此后全同步可读——
 * 偏好读写都在渲染期，不能等一个 await。
 */

let currentVaultId: string | null = null;

/** 由 bootVault / registerAndActivateVault 调用。null = 网页版或尚未选库，退回不带后缀的键。 */
export function setCurrentVaultId(id: string | null): void {
  currentVaultId = id && id.trim() ? id.trim() : null;
}

export function getCurrentVaultId(): string | null {
  return currentVaultId;
}

/**
 * 把一个基础键名限定到当前库。没有当前库时原样返回：
 * 网页版只有一个库，旧数据也就落在不带后缀的键上。
 *
 * 注意这里**不做**「本库没有就读旧全局键」的兜底：那会让新建的库继承上一个库的
 * 引导状态和故事指针，正好废掉按库隔离的意义。代价是老客户端升级后引导会重放一次。
 */
export function scopedKey(base: string): string {
  return currentVaultId ? `${base}@${currentVaultId}` : base;
}

export function scopedGet(base: string): string | null {
  try {
    return localStorage.getItem(scopedKey(base));
  } catch {
    return null;
  }
}

export function scopedSet(base: string, value: string): void {
  try {
    localStorage.setItem(scopedKey(base), value);
  } catch { /* 隐私模式存不了就只保留本次会话状态 */ }
}

export function scopedRemove(base: string): void {
  try {
    localStorage.removeItem(scopedKey(base));
  } catch { /* 同上 */ }
}
