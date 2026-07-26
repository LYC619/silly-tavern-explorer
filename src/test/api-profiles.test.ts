import { beforeEach, describe, it, expect } from 'vitest';
import {
  loadApiProfiles, getActiveProfile, loadAPIConfig, saveAPIConfig, clearAPIConfig,
  persistProfiles, DEFAULT_API_URL, DEFAULT_MODEL, type ApiProfile,
} from '@/components/ai-tools/api-profiles';

const PROFILES_KEY = 'st-beautifier-api-profiles';
const ACTIVE_KEY = 'st-beautifier-api-active-profile';

beforeEach(() => {
  localStorage.clear();
});

describe('api-profiles 持久化层', () => {
  it('从旧单配置 4 个 key 一次性迁移成「默认」提供商并清掉旧 key', () => {
    localStorage.setItem('st-beautifier-openai-key', 'sk-legacy');
    localStorage.setItem('st-beautifier-api-url', 'https://relay.example/v1/chat/completions');
    localStorage.setItem('st-beautifier-api-model', 'gpt-legacy');
    localStorage.setItem('st-beautifier-model-list', JSON.stringify(['a', 'b']));

    const { profiles, activeId } = loadApiProfiles();

    expect(profiles).toHaveLength(1);
    expect(profiles[0].name).toBe('默认');
    expect(profiles[0].apiKey).toBe('sk-legacy');
    expect(profiles[0].apiUrl).toBe('https://relay.example/v1/chat/completions');
    expect(profiles[0].model).toBe('gpt-legacy');
    expect(profiles[0].modelList).toEqual(['a', 'b']);
    expect(activeId).toBe(profiles[0].id);
    // 旧 key 已清理
    expect(localStorage.getItem('st-beautifier-openai-key')).toBeNull();
    expect(localStorage.getItem('st-beautifier-model-list')).toBeNull();
  });

  it('无任何配置时迁移出一个空的默认提供商（缺省地址/模型）', () => {
    const { profiles } = loadApiProfiles();
    expect(profiles).toHaveLength(1);
    expect(profiles[0].apiKey).toBe('');
    expect(profiles[0].apiUrl).toBe(DEFAULT_API_URL);
    expect(profiles[0].model).toBe(DEFAULT_MODEL);
  });

  it('坏 JSON 当作未初始化，走迁移而非抛错', () => {
    localStorage.setItem(PROFILES_KEY, '{不是合法 JSON');
    const { profiles } = loadApiProfiles();
    expect(profiles).toHaveLength(1);
    expect(profiles[0].name).toBe('默认');
  });

  it('activeId 指向不存在的提供商时回退到第一个', () => {
    const ps: ApiProfile[] = [
      { id: 'p1', name: 'A', apiKey: 'k1', apiUrl: DEFAULT_API_URL, model: 'm1' },
      { id: 'p2', name: 'B', apiKey: 'k2', apiUrl: DEFAULT_API_URL, model: 'm2' },
    ];
    localStorage.setItem(PROFILES_KEY, JSON.stringify(ps));
    localStorage.setItem(ACTIVE_KEY, 'gone');

    const { activeId } = loadApiProfiles();
    expect(activeId).toBe('p1');
    expect(getActiveProfile().id).toBe('p1');
  });

  it('saveAPIConfig / loadAPIConfig 只写读活跃提供商', () => {
    const ps: ApiProfile[] = [
      { id: 'p1', name: 'A', apiKey: 'k1', apiUrl: DEFAULT_API_URL, model: 'm1' },
      { id: 'p2', name: 'B', apiKey: 'k2', apiUrl: DEFAULT_API_URL, model: 'm2' },
    ];
    persistProfiles(ps, 'p2');

    saveAPIConfig({ apiKey: 'k2-new', apiUrl: 'https://x/y', model: 'm2-new' });

    const cfg = loadAPIConfig();
    expect(cfg).toEqual({ apiKey: 'k2-new', apiUrl: 'https://x/y', model: 'm2-new' });
    // p1 不受影响
    const { profiles } = loadApiProfiles();
    expect(profiles.find((p) => p.id === 'p1')?.apiKey).toBe('k1');
  });

  it('clearAPIConfig 清空活跃提供商凭据但保留该提供商与其名称', () => {
    const ps: ApiProfile[] = [
      { id: 'p1', name: '主号', apiKey: 'k1', apiUrl: 'https://x/y', model: 'm1', modelList: ['a'] },
    ];
    persistProfiles(ps, 'p1');

    clearAPIConfig();

    const { profiles } = loadApiProfiles();
    expect(profiles).toHaveLength(1);
    expect(profiles[0].name).toBe('主号');
    expect(profiles[0].apiKey).toBe('');
    expect(profiles[0].apiUrl).toBe(DEFAULT_API_URL);
    expect(profiles[0].model).toBe(DEFAULT_MODEL);
    expect(profiles[0].modelList).toEqual([]);
  });
});
