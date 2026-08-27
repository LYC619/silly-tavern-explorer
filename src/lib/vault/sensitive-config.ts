/**
 * 敏感配置（2.0 阶段7.6，定稿：API Key 存系统配置目录，不进库文件夹）。
 *
 * 全部 AI 调用点同步读 localStorage（loadAPIConfig），不动这个约定；
 * 客户端把提供商配置**镜像**到系统配置目录（config.json，与库文件夹分离，
 * 不随库网盘同步/分享泄漏），启动时反向恢复——webview 数据被清也不丢 Key。
 * 网页版两个函数都是空操作。
 *
 * 按库隔离（发布前一轮）：同一个 webview origin 让 localStorage 跨库共享，
 * API 配置于是也跨库共享。这里加一个每库独立的开关：
 *   - 'shared'（默认）：读写 apiProfiles / apiActiveProfile，与改动前完全一致；
 *   - 'vault'：读写 apiProfilesByVault[库id]，与其它库互不影响。
 * Key 仍然只落在系统配置目录，不进库文件夹——库文件夹会被网盘同步、会被分享出去。
 */
import { getAppConfig, isTauri, setAppConfig } from './tauri-fs';
import { getCurrentVaultId } from './vault-scope';

const PROFILES_KEY = 'st-beautifier-api-profiles';
const ACTIVE_KEY = 'st-beautifier-api-active-profile';
const CFG_PROFILES = 'apiProfiles';
const CFG_ACTIVE = 'apiActiveProfile';
const CFG_BY_VAULT = 'apiProfilesByVault';
const CFG_SCOPE_BY_VAULT = 'apiScopeByVault';

export type ApiConfigScope = 'shared' | 'vault';

interface VaultApiSlot {
  profiles?: string;
  active?: string;
}

/**
 * 当前生效的作用域，hydrate 时确定。
 * mirrorApiProfilesToSystem 是保存路径上的同步调用（不能 await 一次 IPC 再决定写哪个槽），
 * 所以这里留一份模块态。
 */
let activeScope: ApiConfigScope = 'shared';

async function readScopeMap(): Promise<Record<string, ApiConfigScope>> {
  const raw = await getAppConfig<unknown>(CFG_SCOPE_BY_VAULT);
  if (!raw || typeof raw !== 'object') return {};
  const map: Record<string, ApiConfigScope> = {};
  for (const [id, value] of Object.entries(raw as Record<string, unknown>)) {
    if (value === 'vault' || value === 'shared') map[id] = value;
  }
  return map;
}

async function readSlotMap(): Promise<Record<string, VaultApiSlot>> {
  const raw = await getAppConfig<unknown>(CFG_BY_VAULT);
  if (!raw || typeof raw !== 'object') return {};
  const map: Record<string, VaultApiSlot> = {};
  for (const [id, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!value || typeof value !== 'object') continue;
    const slot = value as VaultApiSlot;
    map[id] = {
      ...(typeof slot.profiles === 'string' ? { profiles: slot.profiles } : {}),
      ...(typeof slot.active === 'string' ? { active: slot.active } : {}),
    };
  }
  return map;
}

/** 读当前库的作用域；未选库（引导阶段）一律按共享处理。 */
export async function getApiConfigScope(): Promise<ApiConfigScope> {
  if (!isTauri()) return 'shared';
  const vaultId = getCurrentVaultId();
  if (!vaultId) return 'shared';
  try {
    return (await readScopeMap())[vaultId] ?? 'shared';
  } catch {
    return 'shared';
  }
}

/**
 * 启动时恢复：把当前作用域对应的槽写回 localStorage（以系统配置为准）。
 * bootVault 必须先 setCurrentVaultId 再调用它，否则拿不到「本库单独配置」。
 */
export async function hydrateApiProfilesFromSystem(): Promise<void> {
  if (!isTauri()) return;
  try {
    const vaultId = getCurrentVaultId();
    activeScope = vaultId ? (await readScopeMap())[vaultId] ?? 'shared' : 'shared';

    let profiles: string | null;
    let active: string | null;
    if (activeScope === 'vault' && vaultId) {
      const slot = (await readSlotMap())[vaultId] ?? {};
      profiles = slot.profiles ?? null;
      active = slot.active ?? null;
      // 本库槽还没有内容（刚切过来就被清了 webview 数据）：不要把共享配置读进来，
      // 否则「本库单独」在用户眼里等于没生效。宁可显示未配置。
      if (!profiles) {
        localStorage.removeItem(PROFILES_KEY);
        localStorage.removeItem(ACTIVE_KEY);
        return;
      }
    } else {
      profiles = await getAppConfig<string>(CFG_PROFILES);
      active = await getAppConfig<string>(CFG_ACTIVE);
    }
    if (profiles) localStorage.setItem(PROFILES_KEY, profiles);
    if (active) localStorage.setItem(ACTIVE_KEY, active);
  } catch (err) {
    console.warn('恢复 API 配置失败（继续用 localStorage 现值）', err);
  }
}

/** 保存时镜像：与 persistProfiles 同数据异步写系统配置；失败不打断保存（localStorage 已落） */
export function mirrorApiProfilesToSystem(profilesJson: string, activeId: string): void {
  if (!isTauri()) return;
  const vaultId = getCurrentVaultId();
  if (activeScope === 'vault' && vaultId) {
    void writeVaultSlot(vaultId, profilesJson, activeId)
      .catch((err) => console.warn('镜像 API 配置到本库槽失败', err));
    return;
  }
  void setAppConfig(CFG_PROFILES, profilesJson)
    .then(() => setAppConfig(CFG_ACTIVE, activeId))
    .catch((err) => console.warn('镜像 API 配置到系统目录失败', err));
}

/** 读-改-写整个映射：config_set 的粒度是顶层键，没有子键写入。 */
async function writeVaultSlot(vaultId: string, profilesJson: string, activeId: string): Promise<void> {
  const map = await readSlotMap();
  map[vaultId] = { profiles: profilesJson, active: activeId };
  await setAppConfig(CFG_BY_VAULT, map);
}

/**
 * 切换当前库的作用域，并把 localStorage 换成新作用域的内容。
 * 调用方随后需要重载 API 表单（useApiProfiles.reload）。
 *
 * 首次切到 'vault' 时用当前 localStorage 里的配置**播种**本库槽：
 * 直接给一个空配置会让所有 AI 功能立刻失效，用户还以为切换把配置弄丢了。
 * 播种是复制，不是共享——此后两边各改各的。
 */
export async function setApiConfigScope(scope: ApiConfigScope): Promise<void> {
  if (!isTauri()) return;
  const vaultId = getCurrentVaultId();
  if (!vaultId) throw new Error('尚未选择文件库，无法按库保存 API 配置');

  const map = await readScopeMap();
  map[vaultId] = scope;
  await setAppConfig(CFG_SCOPE_BY_VAULT, map);
  activeScope = scope;

  if (scope === 'vault') {
    const slots = await readSlotMap();
    if (!slots[vaultId]?.profiles) {
      const seedProfiles = localStorage.getItem(PROFILES_KEY);
      const seedActive = localStorage.getItem(ACTIVE_KEY) ?? '';
      if (seedProfiles) await writeVaultSlot(vaultId, seedProfiles, seedActive);
    }
  }
  await hydrateApiProfilesFromSystem();
}
