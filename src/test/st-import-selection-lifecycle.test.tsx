import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createEmptyImportPicks,
  type STImportPicks,
} from '@/lib/vault/st-import-presentation';
import type { STScanResult } from '@/lib/vault/st-import';
import { STImportSelectionDialog } from '@/components/tools/st-import/STImportSelectionDialog';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const scanWith = (kind: 'characters' | 'worldbooks'): STScanResult => ({
  userDir: '',
  characters: kind === 'characters' ? [{
    name: '角色甲', pngPath: 'characters/a.png', pngSize: 1, chats: [], chatBytes: 0,
  }] : [],
  strayChats: [],
  worldbooks: kind === 'worldbooks' ? [{ name: '世界书甲', path: 'worlds/a.json', size: 1 }] : [],
  presets: [],
  regex: null,
  archives: [],
  relationships: { status: 'missing', globalWorldbooks: [], characterWorldbooks: [] },
  warnings: [],
});

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('ST import selection lifecycle', () => {
  it('moves the active tab to the first available category after a new scan', async () => {
    const picks: STImportPicks = createEmptyImportPicks();
    const props = {
      root: 'D:/ST',
      scan: scanWith('characters'),
      picks,
      importing: false,
      onPicksChange: () => {},
      onCancel: () => {},
      onImport: () => {},
    };

    await act(async () => { root.render(<STImportSelectionDialog {...props} />); });
    const initialActive = document.querySelector<HTMLButtonElement>('button[role="tab"][data-state="active"]');
    expect(initialActive).not.toBeNull();
    expect(initialActive?.textContent).toContain('角色');

    await act(async () => {
      root.render(<STImportSelectionDialog {...props} scan={scanWith('worldbooks')} />);
      await Promise.resolve();
    });

    const nextActive = document.querySelector<HTMLButtonElement>('button[role="tab"][data-state="active"]');
    expect(nextActive).not.toBeNull();
    expect(nextActive?.textContent).toContain('世界书');
  });
});
