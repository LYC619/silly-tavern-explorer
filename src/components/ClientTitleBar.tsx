import { useCallback, useEffect, useState } from 'react';
import { Copy, Minus, Square, X } from 'lucide-react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { GlobalSearch } from '@/components/GlobalSearch';
import appIconUrl from '../../src-tauri/icons/32x32.png';

export function ClientTitleBar() {
  const [maximized, setMaximized] = useState(false);

  const syncMaximized = useCallback(async () => {
    try {
      setMaximized(await getCurrentWindow().isMaximized());
    } catch {
      setMaximized(false);
    }
  }, []);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    void syncMaximized();
    void getCurrentWindow().onResized(() => {
      void syncMaximized();
    }).then((stop) => {
      unlisten = stop;
    });
    return () => unlisten?.();
  }, [syncMaximized]);

  const minimize = () => {
    void getCurrentWindow().minimize();
  };

  const toggleMaximize = async () => {
    await getCurrentWindow().toggleMaximize();
    await syncMaximized();
  };

  const close = () => {
    void getCurrentWindow().close();
  };

  return (
    <header
      className="relative h-11 shrink-0 select-none border-b border-[color:var(--border-subtle)] bg-chrome"
      data-tauri-drag-region
    >
      <div
        className="absolute inset-y-0 left-0 flex items-center gap-2 px-3.5"
        data-tauri-drag-region
      >
        <img src={appIconUrl} alt="" className="h-5 w-5" draggable={false} data-tauri-drag-region />
        <span className="text-sm font-medium text-[color:var(--text-body)]" data-tauri-drag-region>
          ST Explorer
        </span>
      </div>

      <div className="absolute left-[56%] top-1/2 flex -translate-x-1/2 -translate-y-1/2 justify-center">
        <GlobalSearch />
      </div>

      <div className="absolute inset-y-0 right-0 flex" aria-label="窗口控制">
        <button
          type="button"
          onClick={minimize}
          aria-label="最小化窗口"
          title="最小化"
          className="flex h-full w-11 items-center justify-center text-[color:var(--text-muted)] transition-colors hover:bg-[var(--hover-overlay-strong)] hover:text-[color:var(--text-body)]"
        >
          <Minus className="h-4 w-4" strokeWidth={1.75} />
        </button>
        <button
          type="button"
          onClick={() => void toggleMaximize()}
          aria-label={maximized ? '还原窗口' : '最大化窗口'}
          title={maximized ? '还原' : '最大化'}
          className="flex h-full w-11 items-center justify-center text-[color:var(--text-muted)] transition-colors hover:bg-[var(--hover-overlay-strong)] hover:text-[color:var(--text-body)]"
        >
          {maximized
            ? <Copy className="h-3.5 w-3.5" strokeWidth={1.5} />
            : <Square className="h-3.5 w-3.5" strokeWidth={1.5} />}
        </button>
        <button
          type="button"
          onClick={close}
          aria-label="关闭窗口"
          title="关闭"
          className="flex h-full w-11 items-center justify-center text-[color:var(--text-muted)] transition-colors hover:bg-red-600 hover:text-white"
        >
          <X className="h-[18px] w-[18px]" strokeWidth={1.6} />
        </button>
      </div>
    </header>
  );
}
