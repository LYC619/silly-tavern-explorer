/**
 * 运行环境判定：同一份前端跑在三个壳里，能力不一样。
 *
 * - `web`       浏览器/PWA。没有文件系统，库落在 IndexedDB。
 * - `tauri`     桌面客户端。有真文件系统和原生对话框，库是明文目录。
 * - `capacitor` Android 客户端。有文件系统但没有「让用户选一个目录当库」这件事
 *               （Android 的 SAF 是按 URI 授权的，不是路径），所以它既不是
 *               web 也不能照抄 tauri 那条路。
 *
 * 判定方式都是嗅探壳注入的全局对象，不 import 各自的 SDK。这样网页版打包不会
 * 把 @capacitor/core 拖进 bundle，也不用为了判环境去 await 一个动态 import。
 *
 * isTauri() 的实现原本在 lib/vault/tauri-fs.ts，二十多处在用；那边现在转发到这里，
 * 语义不变（导入路径也不用改）。新代码建议直接从本模块拿。
 */

export type Runtime = 'web' | 'tauri' | 'capacitor';

interface TauriGlobals {
  __TAURI_INTERNALS__?: unknown;
}

interface CapacitorGlobals {
  Capacitor?: {
    /** 原生壳里为 true；`npx cap serve` 那种浏览器预览为 false */
    isNativePlatform?: () => boolean;
    getPlatform?: () => string;
  };
}

/** 是否运行在 Tauri 桌面客户端里 */
export function isTauri(): boolean {
  return typeof window !== 'undefined'
    && '__TAURI_INTERNALS__' in (window as unknown as TauriGlobals);
}

/**
 * 是否运行在 Capacitor 原生壳里。
 *
 * 只认 isNativePlatform() 为真的情况：Capacitor 的 web 目标也会注入这个全局，
 * 但那时能力和普通网页一样，按原生走会去调根本不存在的插件。
 */
export function isCapacitor(): boolean {
  if (typeof window === 'undefined') return false;
  const cap = (window as unknown as CapacitorGlobals).Capacitor;
  return typeof cap?.isNativePlatform === 'function' && cap.isNativePlatform() === true;
}

/**
 * 当前环境。Tauri 优先判：两个壳不可能同时在，但真出现异常注入时，
 * 桌面端的能力是超集，误判成它比误判成移动端安全。
 */
export function detectRuntime(): Runtime {
  if (isTauri()) return 'tauri';
  if (isCapacitor()) return 'capacitor';
  return 'web';
}

/** 有本机文件系统（能读写真文件），与「库是不是明文目录」是两件事 */
export function hasNativeFs(): boolean {
  return detectRuntime() !== 'web';
}

/** 给用户看的环境名，设置页的「运行环境」那一行用 */
export const RUNTIME_LABEL: Record<Runtime, string> = {
  web: '网页版',
  tauri: '桌面客户端',
  capacitor: 'Android 客户端',
};
