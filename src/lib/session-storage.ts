import type { ChatSession, ExportSettings, ChapterMarker, RegexRule } from '@/types/chat';
import { DEFAULT_REGEX_RULES } from '@/types/chat';

const SESSION_KEY = 'st-beautifier-session';
const SETTINGS_KEY = 'st-beautifier-settings';
const MARKERS_KEY = 'st-beautifier-markers';
const CUSTOM_REGEX_KEY = 'st-beautifier-custom-regex';
const BUILTIN_STATES_KEY = 'st-beautifier-builtin-states';
const REGEX_PRESETS_KEY = 'st-beautifier-regex-presets';

export interface StoredState {
  session: ChatSession | null;
  markers: ChapterMarker[];
  currentBookId: string | null;
  settings?: ExportSettings;
}

// Session storage (临时，页面间导航)
// 返回是否保存成功：长记录(几十万字)可能超出 sessionStorage ~5MB 配额，
// 失败时返回 false 让调用方提示用户，而非静默丢失未保存编辑。
export function saveSessionState(state: StoredState): boolean {
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(state));
    return true;
  } catch (e) {
    console.error('Failed to save session state:', e);
    return false;
  }
}

export function loadSessionState(): StoredState | null {
  try {
    const data = sessionStorage.getItem(SESSION_KEY);
    if (data) {
      return JSON.parse(data);
    }
  } catch (e) {
    console.error('Failed to load session state:', e);
  }
  return null;
}

export function clearSessionState(): void {
  sessionStorage.removeItem(SESSION_KEY);
}

// Custom regex rules (持久化到 localStorage)
export function saveCustomRegexRules(rules: RegexRule[]): void {
  try {
    // 只保存非内置规则
    const customRules = rules.filter(r => !r.id.startsWith('builtin-'));
    localStorage.setItem(CUSTOM_REGEX_KEY, JSON.stringify(customRules));
  } catch (e) {
    console.error('Failed to save custom regex rules:', e);
  }
}

export function loadCustomRegexRules(): RegexRule[] {
  try {
    const data = localStorage.getItem(CUSTOM_REGEX_KEY);
    if (data) {
      return JSON.parse(data);
    }
  } catch (e) {
    console.error('Failed to load custom regex rules:', e);
  }
  return [];
}

// 合并内置规则和自定义规则
export function getMergedRegexRules(): RegexRule[] {
  const customRules = loadCustomRegexRules();
  return [...DEFAULT_REGEX_RULES, ...customRules];
}

export function saveBuiltinRuleStates(rules: RegexRule[]): void {
  try {
    const states: Record<string, boolean> = {};
    rules
      .filter(r => r.id.startsWith('builtin-'))
      .forEach(r => {
        states[r.id] = r.disabled;
      });
    localStorage.setItem(BUILTIN_STATES_KEY, JSON.stringify(states));
  } catch (e) {
    console.error('Failed to save builtin rule states:', e);
  }
}

export function loadBuiltinRuleStates(): Record<string, boolean> {
  try {
    const data = localStorage.getItem(BUILTIN_STATES_KEY);
    if (data) {
      return JSON.parse(data);
    }
  } catch (e) {
    console.error('Failed to load builtin rule states:', e);
  }
  return {};
}

// 获取完整的规则列表（包含保存的状态）
export function getInitialRegexRules(): RegexRule[] {
  const builtinStates = loadBuiltinRuleStates();
  const customRules = loadCustomRegexRules();
  
  const builtinRules = DEFAULT_REGEX_RULES.map(rule => ({
    ...rule,
    disabled: builtinStates[rule.id] ?? rule.disabled,
  }));
  
  return [...builtinRules, ...customRules];
}

// 正则预设（规则集快照，持久化到 localStorage）
export interface RegexPreset {
  id: string;
  name: string;
  rules: RegexRule[];
  createdAt: number;
}

export function loadRegexPresets(): RegexPreset[] {
  try {
    const data = localStorage.getItem(REGEX_PRESETS_KEY);
    if (data) {
      return JSON.parse(data);
    }
  } catch (e) {
    console.error('Failed to load regex presets:', e);
  }
  return [];
}

export function saveRegexPresets(presets: RegexPreset[]): void {
  try {
    localStorage.setItem(REGEX_PRESETS_KEY, JSON.stringify(presets));
  } catch (e) {
    console.error('Failed to save regex presets:', e);
  }
}

// 保存当前规则集为一个新预设，返回更新后的预设列表
export function addRegexPreset(name: string, rules: RegexRule[]): RegexPreset[] {
  const presets = loadRegexPresets();
  const preset: RegexPreset = {
    id: crypto.randomUUID(),
    name,
    rules: JSON.parse(JSON.stringify(rules)),
    createdAt: Date.now(),
  };
  const updated = [...presets, preset];
  saveRegexPresets(updated);
  return updated;
}

export function deleteRegexPreset(id: string): RegexPreset[] {
  const updated = loadRegexPresets().filter(p => p.id !== id);
  saveRegexPresets(updated);
  return updated;
}

// 保存设置到 localStorage
export function saveSettings(settings: ExportSettings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch (e) {
    console.error('Failed to save settings:', e);
  }
}

// 加载设置
export function loadSettings(): ExportSettings | null {
  try {
    const data = localStorage.getItem(SETTINGS_KEY);
    if (data) {
      return JSON.parse(data);
    }
  } catch (e) {
    console.error('Failed to load settings:', e);
  }
  return null;
}
