import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { STImportSummary, STScanResult } from '@/lib/vault/st-import';

const mocks = vi.hoisted(() => ({
  createTauriFs: vi.fn(),
  importSelected: vi.fn(),
  pickDirectory: vi.fn(),
  scanSTUserDir: vi.fn(),
  setAppConfig: vi.fn(),
  toast: vi.fn(),
}));

vi.mock('@/lib/vault/tauri-fs', () => ({
  createTauriFs: mocks.createTauriFs,
  isTauri: () => true,
  pickDirectory: mocks.pickDirectory,
  setAppConfig: mocks.setAppConfig,
}));

vi.mock('@/lib/vault/st-import', () => ({
  importSelected: mocks.importSelected,
  scanSTUserDir: mocks.scanSTUserDir,
}));

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: mocks.toast }),
}));

vi.mock('@/components/tools/st-import/STImportSelectionDialog', () => ({
  STImportSelectionDialog: ({ onImport }: { onImport: () => void }) => (
    <div data-testid="st-import-selection">
      <button type="button" onClick={onImport}>确认导入</button>
    </div>
  ),
}));

vi.mock('@/components/tools/st-import/STImportResultDialog', () => ({
  STImportResultDialog: ({ result, onClose }: { result: STImportSummary | null; onClose: () => void }) => result
    ? (
      <div data-testid="st-import-result">
        <span>{result.characters} 个角色已处理</span>
        <button type="button" onClick={onClose}>关闭结果</button>
      </div>
    )
    : null,
}));

import { STImportCard } from '@/components/tools/STImportCard';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const scan: STScanResult = {
  userDir: '',
  characters: [{
    name: '演示角色',
    pngPath: 'characters/demo.png',
    pngSize: 1,
    chats: [],
    chatBytes: 0,
  }],
  strayChats: [],
  worldbooks: [],
  presets: [],
  regex: null,
  archives: [],
  relationships: { status: 'missing', globalWorldbooks: [], characterWorldbooks: [] },
  warnings: [],
};

const summary: STImportSummary = {
  characters: 1,
  stories: 0,
  worldbooks: 0,
  presets: 0,
  regexes: 0,
  skipped: 0,
  failed: 0,
  relationships: 0,
  unresolvedRelationships: [],
  archivedFiles: 0,
  archiveBytes: 0,
  details: [],
  scanWarnings: [],
};

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.clearAllMocks();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  mocks.pickDirectory.mockResolvedValue('D:/SillyTavern');
  mocks.createTauriFs.mockReturnValue({});
  mocks.scanSTUserDir.mockResolvedValue(scan);
  mocks.setAppConfig.mockResolvedValue(undefined);
  mocks.importSelected.mockResolvedValue(summary);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('STImportCard lifecycle', () => {
  it('keeps the selection dialog mounted until the user finishes importing', async () => {
    const onChanged = vi.fn();
    await act(async () => {
      root.render(<STImportCard onChanged={onChanged} />);
    });

    const scanButton = container.querySelector<HTMLButtonElement>('button');
    expect(scanButton).not.toBeNull();
    await act(async () => {
      scanButton?.click();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mocks.setAppConfig).toHaveBeenCalledWith('stRoot', 'D:/SillyTavern');
    expect(document.querySelector('[data-testid="st-import-selection"]')).not.toBeNull();
    expect(onChanged).not.toHaveBeenCalled();

    const importButton = document.querySelector<HTMLButtonElement>('[data-testid="st-import-selection"] button');
    await act(async () => {
      importButton?.click();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mocks.importSelected).toHaveBeenCalledTimes(1);
    expect(onChanged).not.toHaveBeenCalled();
    expect(document.querySelector('[data-testid="st-import-result"]')?.textContent)
      .toContain('1 个角色已处理');

    const closeResultButton = document.querySelector<HTMLButtonElement>('[data-testid="st-import-result"] button');
    await act(async () => {
      closeResultButton?.click();
      await Promise.resolve();
    });
    expect(onChanged).toHaveBeenCalledTimes(1);
  });
});
