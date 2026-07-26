// API 提供商的持久化与领域逻辑（无 UI）。
// 全应用唯一的 AI 配置数据层：多提供商存 localStorage，客户端镜像到系统配置目录。
// 拆自原 APIConfigCard.tsx（阶段8.1 codex P2.1：把 460 行 God 组件的持久化层独立、可单测）。
import { mirrorApiProfilesToSystem } from '@/lib/vault/sensitive-config';

// 旧单配置 keys（仅用于一次性迁移到多提供商）
const LEGACY_KEY = 'st-beautifier-openai-key';
const LEGACY_URL = 'st-beautifier-api-url';
const LEGACY_MODEL = 'st-beautifier-api-model';
const LEGACY_MODEL_LIST = 'st-beautifier-model-list';

const PROFILES_KEY = 'st-beautifier-api-profiles';
const ACTIVE_KEY = 'st-beautifier-api-active-profile';

export const DEFAULT_API_URL = 'https://api.openai.com/v1/chat/completions';
export const DEFAULT_MODEL = 'gpt-4o-mini';

export interface APIConfig {
  apiKey: string;
  apiUrl: string;
  model: string;
}

/** 一个 API 提供商配置（OpenAI 兼容）。模型列表属于该提供商的元数据。 */
export interface ApiProfile extends APIConfig {
  id: string;
  name: string;
  modelList?: string[];
}

export function generateProfileId(): string {
  return `api_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function persistProfiles(profiles: ApiProfile[], activeId: string): void {
  const json = JSON.stringify(profiles);
  localStorage.setItem(PROFILES_KEY, json);
  localStorage.setItem(ACTIVE_KEY, activeId);
  // 客户端同时镜像到系统配置目录（阶段7.6：Key 不进库、不怕 webview 数据被清）
  mirrorApiProfilesToSystem(json, activeId);
}

/** 读取全部提供商；首次调用时把旧的单配置 4 个 key 迁移成「默认」提供商并清掉旧 key。 */
export function loadApiProfiles(): { profiles: ApiProfile[]; activeId: string } {
  try {
    const raw = localStorage.getItem(PROFILES_KEY);
    if (raw) {
      const profiles = JSON.parse(raw) as ApiProfile[];
      if (Array.isArray(profiles) && profiles.length > 0) {
        const stored = localStorage.getItem(ACTIVE_KEY);
        const activeId = profiles.some((p) => p.id === stored) ? (stored as string) : profiles[0].id;
        return { profiles, activeId };
      }
    }
  } catch { /* 坏数据当作未初始化，走迁移 */ }

  let modelList: string[] = [];
  try { modelList = JSON.parse(localStorage.getItem(LEGACY_MODEL_LIST) || '[]'); } catch { /* ignore */ }
  const first: ApiProfile = {
    id: generateProfileId(),
    name: '默认',
    apiKey: localStorage.getItem(LEGACY_KEY) || '',
    apiUrl: localStorage.getItem(LEGACY_URL) || DEFAULT_API_URL,
    model: localStorage.getItem(LEGACY_MODEL) || DEFAULT_MODEL,
    modelList,
  };
  persistProfiles([first], first.id);
  [LEGACY_KEY, LEGACY_URL, LEGACY_MODEL, LEGACY_MODEL_LIST].forEach((k) => localStorage.removeItem(k));
  return { profiles: [first], activeId: first.id };
}

export function getActiveProfile(): ApiProfile {
  const { profiles, activeId } = loadApiProfiles();
  return profiles.find((p) => p.id === activeId) ?? profiles[0];
}

/** 兼容旧签名：返回活跃提供商的调用配置。全部 AI 调用点（总结/故事树/世界书/批量）继续用它。 */
export function loadAPIConfig(): APIConfig {
  const p = getActiveProfile();
  return {
    apiKey: p?.apiKey || '',
    apiUrl: p?.apiUrl || DEFAULT_API_URL,
    model: p?.model || DEFAULT_MODEL,
  };
}

/** 兼容旧签名：写入活跃提供商。 */
export function saveAPIConfig(config: APIConfig): void {
  const { profiles, activeId } = loadApiProfiles();
  const idx = profiles.findIndex((p) => p.id === activeId);
  if (idx < 0) return;
  profiles[idx] = { ...profiles[idx], ...config };
  persistProfiles(profiles, activeId);
}

/** 兼容旧签名：清空活跃提供商的凭据（不删除该提供商）。 */
export function clearAPIConfig(): void {
  const { profiles, activeId } = loadApiProfiles();
  const idx = profiles.findIndex((p) => p.id === activeId);
  if (idx < 0) return;
  profiles[idx] = { ...profiles[idx], apiKey: '', apiUrl: DEFAULT_API_URL, model: DEFAULT_MODEL, modelList: [] };
  persistProfiles(profiles, activeId);
}
