/**
 * 「ST 配置」对话框在没接入 ST 目录时的出口（阶段 B3）。
 *
 * 旧断言是 grep 这个文件里有没有 navigate('/settings') 和一段文案；
 * 现在渲染真组件，点按钮，断言真的落到设置页且定位到目录分区。
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const getAppConfig = vi.hoisted(() => vi.fn().mockResolvedValue(null));

vi.mock('@/lib/vault/tauri-fs', () => ({
  getAppConfig,
  createTauriFs: vi.fn(() => ({})),
}));

import { STAIConfigDialog } from '@/components/tools/STAIConfigDialog';
import { loadSettingsSection } from '@/lib/settings-navigation';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

class ResizeObserverStub { observe() {} unobserve() {} disconnect() {} }
vi.stubGlobal('ResizeObserver', ResizeObserverStub);
Element.prototype.hasPointerCapture = () => false;
Element.prototype.setPointerCapture = () => {};
Element.prototype.releasePointerCapture = () => {};
Element.prototype.scrollIntoView = () => {};

let container: HTMLDivElement;
let root: Root;

function LocationProbe() {
  const location = useLocation();
  return <span data-testid="loc">{location.pathname}</span>;
}

const locationText = () => container.querySelector('[data-testid="loc"]')?.textContent ?? '';

beforeEach(() => {
  localStorage.clear();
  getAppConfig.mockClear().mockResolvedValue(null);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('ST 配置对话框的目录接入出口', () => {
  it('没接入 ST 目录时给出去设置的入口，点了落到设置页的目录分区', async () => {
    const onOpenChange = vi.fn();
    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={['/']}>
          <LocationProbe />
          <Routes>
            <Route path="/" element={<STAIConfigDialog open onOpenChange={onOpenChange} />} />
            <Route path="/settings" element={<div data-testid="settings-page">设置</div>} />
          </Routes>
        </MemoryRouter>,
      );
    });
    await act(async () => { await Promise.resolve(); });

    const button = Array.from(document.querySelectorAll('button'))
      .find((b) => b.textContent?.includes('去设置接入 ST'));
    if (!button) throw new Error('没接入 ST 时应该给出「去设置接入 ST」的出口');

    await act(async () => { button.click(); });

    expect(locationText()).toBe('/settings');
    expect(loadSettingsSection()).toBe('directories');
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
