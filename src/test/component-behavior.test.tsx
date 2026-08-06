import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NsfwImage } from '@/components/NsfwImage';

const migrationMock = vi.hoisted(() => ({
  runArchiveMigration: vi.fn(),
}));

vi.mock('@/lib/archive-migrate', () => migrationMock);

import { MigrationNotice } from '@/components/MigrationNotice';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  localStorage.clear();
  migrationMock.runArchiveMigration.mockReset();
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('component behavior', () => {
  it('keeps NSFW images blurred by default and clears the state when revealed', async () => {
    root = createRoot(container);

    await act(async () => {
      root.render(<NsfwImage src="portrait.png" nsfw alt="portrait" />);
    });
    expect(container.querySelector('img')?.dataset.nsfwBlurred).toBe('true');

    await act(async () => {
      root.render(<NsfwImage src="portrait.png" nsfw revealed alt="portrait" />);
    });
    expect(container.querySelector('img')?.dataset.nsfwBlurred).toBe('false');
  });

  it('blocks editor content until migration succeeds, then exposes retry recovery', async () => {
    const firstAttempt = deferred<unknown>();
    migrationMock.runArchiveMigration
      .mockReturnValueOnce(firstAttempt.promise)
      .mockResolvedValueOnce({
        characterCount: 1,
        charactersMigrated: 0,
        storiesBackfilled: 0,
        alreadyCurrent: false,
      });
    root = createRoot(container);

    await act(async () => {
      root.render(
        <MigrationNotice>
          <span data-testid="editor-content">editor content</span>
        </MigrationNotice>,
      );
      await Promise.resolve();
    });
    expect(container.querySelector('[data-testid="editor-content"]')).toBeNull();
    expect(document.body.textContent).toContain('正在升级档案库');
    const dialog = document.querySelector('[role="dialog"]');
    expect(dialog).not.toBeNull();
    await act(async () => {
      dialog?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    });
    expect(document.querySelector('[role="dialog"]')).not.toBeNull();

    await act(async () => {
      firstAttempt.reject(new Error('disk unavailable'));
      await Promise.resolve();
    });
    expect(container.querySelector('[data-testid="editor-content"]')).toBeNull();
    expect(document.body.textContent).toContain('disk unavailable');

    const retry = [...document.querySelectorAll('button')]
      .find((button) => button.textContent?.includes('重试'));
    expect(retry).toBeDefined();
    await act(async () => {
      retry?.click();
      await Promise.resolve();
    });

    expect(container.querySelector('[data-testid="editor-content"]')).not.toBeNull();
    expect(migrationMock.runArchiveMigration).toHaveBeenCalledTimes(2);
  });
});
