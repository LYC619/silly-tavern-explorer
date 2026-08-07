export const SETTINGS_SECTIONS = ['display', 'ai', 'directories', 'data', 'about'] as const;

export type SettingsSection = (typeof SETTINGS_SECTIONS)[number];

const STORAGE_KEY = 'ste-settings-section';

export function loadSettingsSection(): SettingsSection {
  const value = localStorage.getItem(STORAGE_KEY);
  return SETTINGS_SECTIONS.includes(value as SettingsSection)
    ? value as SettingsSection
    : 'display';
}

export function saveSettingsSection(section: SettingsSection): void {
  localStorage.setItem(STORAGE_KEY, section);
}
