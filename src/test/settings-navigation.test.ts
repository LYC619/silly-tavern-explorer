import { describe, expect, it } from 'vitest';
import { loadSettingsSection, saveSettingsSection } from '@/lib/settings-navigation';

describe('settings navigation', () => {
  it('defaults invalid values to display and restores a saved section', () => {
    localStorage.clear();
    expect(loadSettingsSection()).toBe('display');

    localStorage.setItem('ste-settings-section', 'invalid');
    expect(loadSettingsSection()).toBe('display');

    saveSettingsSection('data');
    expect(loadSettingsSection()).toBe('data');
  });
});
