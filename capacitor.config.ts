import type { CapacitorConfig } from '@capacitor/cli';

/**
 * 移动端（Android）外壳配置。桌面端走 Tauri，两边共用 dist/ 里同一份前端。
 *
 * appId 与 src-tauri/tauri.conf.json 的 identifier 保持一致（com.ste.explorer）：
 * 同一个产品的两个壳，将来做「电脑上打开」这类跨端跳转、或者按包名归档崩溃日志时
 * 不用记两个 ID。appName 同 productName「ST Explorer」。
 *
 * 注意 webDir 指向 dist，所以顺序永远是 `npm run build` 再 `npx cap sync`——
 * sync 只是把 dist 拷进 android/app/src/main/assets/public（那个目录在 .gitignore 里）。
 *
 * iOS 不做（已拍板）：只有 Android。
 */
const config: CapacitorConfig = {
  appId: 'com.ste.explorer',
  appName: 'ST Explorer',
  webDir: 'dist',
  android: {
    // 后退键交给前端的路由/抽屉去处理，不让 WebView 直接退出 Activity。
    // 阅读态下按后退应该是「关掉沉浸/退回故事列表」，而不是整个应用消失。
    // TODO(capacitor): 前端还需要接 App.addListener('backButton')，见 lib/runtime.ts
    webContentsDebuggingEnabled: false,
    // 允许混合内容会让 http 资源在 https 页面里加载，这里不需要（全是本地资源）。
    allowMixedContent: false,
    // 长按选中文本是阅读场景要的（摘句、写观感），不能关。
    captureInput: false,
  },
  server: {
    // 本地资源用 https 方案：IndexedDB / localStorage 在 http://localhost 方案下
    // 会被算成不安全上下文，而库的整个 web 兜底路径都压在 IndexedDB 上。
    androidScheme: 'https',
  },
};

export default config;
