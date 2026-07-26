/**
 * 敏感配置（2.0 阶段7.6，定稿：API Key 存系统配置目录，不进库文件夹）。
 *
 * 全部 AI 调用点同步读 localStorage（loadAPIConfig），不动这个约定；
 * 客户端把提供商配置**镜像**到系统配置目录（config.json，与库文件夹分离，
 * 不随库网盘同步/分享泄漏），启动时反向恢复——webview 数据被清也不丢 Key。
 * 网页版两个函数都是空操作。
 */
import { getAppConfig, isTauri, setAppConfig } from './tauri-fs';

const PROFILES_KEY = 'st-beautifier-api-profiles';
const ACTIVE_KEY = 'st-beautifier-api-active-profile';
const CFG_PROFILES = 'apiProfiles';
const CFG_ACTIVE = 'apiActiveProfile';

/** 启动时恢复：系统配置有值就写回 localStorage（以系统配置为准）。VaultGate boot 时机调用 */
export async function hydrateApiProfilesFromSystem(): Promise<void> {
  if (!isTauri()) return;
  try {
    const profiles = await getAppConfig<string>(CFG_PROFILES);
    const active = await getAppConfig<string>(CFG_ACTIVE);
    if (profiles) localStorage.setItem(PROFILES_KEY, profiles);
    if (active) localStorage.setItem(ACTIVE_KEY, active);
  } catch (err) {
    console.warn('恢复 API 配置失败（继续用 localStorage 现值）', err);
  }
}

/** 保存时镜像：与 persistProfiles 同数据异步写系统配置；失败不打断保存（localStorage 已落） */
export function mirrorApiProfilesToSystem(profilesJson: string, activeId: string): void {
  if (!isTauri()) return;
  void setAppConfig(CFG_PROFILES, profilesJson)
    .then(() => setAppConfig(CFG_ACTIVE, activeId))
    .catch((err) => console.warn('镜像 API 配置到系统目录失败', err));
}
