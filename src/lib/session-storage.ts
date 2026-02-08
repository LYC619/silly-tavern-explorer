import type { ChatSession, ExportSettings, ChapterMarker, RegexRule } from '@/types/chat';
import { DEFAULT_REGEX_RULES } from '@/types/chat';

const SESSION_KEY = 'st-beautifier-session';
const SETTINGS_KEY = 'st-beautifier-settings';
const MARKERS_KEY = 'st-beautifier-markers';
const CUSTOM_REGEX_KEY = 'st-beautifier-custom-regex';
const BUILTIN_STATES_KEY = 'st-beautifier-builtin-states';

export interface StoredState {
  session: ChatSession | null;
  markers: ChapterMarker[];
  currentBookId: string | null;
  settings?: ExportSettings;
}

// Session storage (临时，页面间导航)
export function saveSessionState(state: StoredState): void {
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(state));
  } catch (e) {
    console.error('Failed to save session state:', e);
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
