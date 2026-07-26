/**
 * 当前激活的文件库后端（模块态开关）。
 * 网页版永不激活（保持 IndexedDB）；客户端在启动接线（7.2c）时 setActiveVault。
 * repo 层每次调用现查，激活/停用即时生效，上层 *-db.ts 无需重建。
 */
import type { VaultBackend } from './vault-backend';

let active: VaultBackend | null = null;

export function setActiveVault(v: VaultBackend | null): void {
  active = v;
}

export function getActiveVault(): VaultBackend | null {
  return active;
}
