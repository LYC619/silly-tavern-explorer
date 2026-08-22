/**
 * 标题栏全局搜索（10.1-A2 最小可用）：角色名/故事名/资产标题子串匹配 → 下拉分组结果跳转。
 * - Ctrl+F 覆盖 WebView2 页内查找并聚焦；↑↓ 选择、Enter 跳转、Esc 关闭
 * - 首次聚焦才拉数据（角色/故事走 archive-index 轻量列表，不读卡面与正文；焦点期内不重复拉）
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search } from 'lucide-react';
import {
  buildSearchEntries, searchEntries, groupByKind,
  flattenSearchGroups, SEARCH_KIND_LABEL, type SearchEntry,
} from '@/lib/global-search';
import { listCharacterIndex, listStoryIndex } from '@/lib/archive-index';
import { getAllWorldBooks } from '@/lib/worldbook-db';
import { getAllPresets } from '@/lib/preset-db';
import { getAllRegexCollections } from '@/lib/regex-db';
import { cn } from '@/lib/utils';

export function GlobalSearch() {
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [entries, setEntries] = useState<SearchEntry[] | null>(null);
  const loadingRef = useRef(false);

  const loadEntries = useCallback(async () => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    try {
      const [characters, stories, worldbooks, presets, regexes] = await Promise.all([
        listCharacterIndex().catch(() => []),
        listStoryIndex().catch(() => []),
        getAllWorldBooks().catch(() => []),
        getAllPresets().catch(() => []),
        getAllRegexCollections().catch(() => []),
      ]);
      setEntries(buildSearchEntries({
        characters: characters.map((c) => ({
          id: c.id,
          name: c.name,
          displayName: c.displayMeta?.name,
        })),
        stories: stories.map((s) => ({ id: s.id, title: s.title, characterId: s.characterId })),
        worldbooks, presets, regexes,
      }));
    } finally {
      loadingRef.current = false;
    }
  }, []);

  // 覆盖 WebView2 自带的 Ctrl+F 页内查找，统一进入应用全局搜索。
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const results = useMemo(
    () => (entries ? searchEntries(entries, query) : []),
    [entries, query],
  );
  const groups = useMemo(() => groupByKind(results), [results]);
  const visualResults = useMemo(() => flattenSearchGroups(groups), [groups]);

  const go = useCallback((entry: SearchEntry) => {
    setOpen(false);
    setQuery('');
    inputRef.current?.blur();
    navigate(entry.path);
  }, [navigate]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setOpen(false);
      inputRef.current?.blur();
      return;
    }
    if (!visualResults.length) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => (a + 1) % visualResults.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => (a - 1 + visualResults.length) % visualResults.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      go(visualResults[Math.min(active, visualResults.length - 1)]);
    }
  };

  const showDrop = open && query.trim().length > 0;

  return (
    <div className="relative hidden md:block w-72 lg:w-96" data-tour="global-search">
      <div className="flex items-center gap-2 px-3.5 py-[5px] rounded-md text-xs bg-[var(--input-bg)] focus-within:ring-1 focus-within:ring-[color:var(--brand-hairline)]">
        <Search className="w-3.5 h-3.5 shrink-0 text-[color:var(--text-faint)]" />
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => { setQuery(e.target.value); setActive(0); setOpen(true); }}
          onFocus={() => { setOpen(true); void loadEntries(); }}
          onBlur={() => setOpen(false)}
          onKeyDown={onKeyDown}
          placeholder="搜索角色、故事、世界书、预设、正则…"
          className="flex-1 min-w-0 bg-transparent outline-none text-[color:var(--text-body)] placeholder:text-[color:var(--text-faint)]"
          aria-label="全局搜索"
        />
        <span className="text-[10px] px-1.5 py-px rounded bg-[var(--hover-overlay-strong)] text-[color:var(--text-faint)] shrink-0">Ctrl+F</span>
      </div>

      {showDrop && (
        <div className="absolute left-0 right-0 top-full mt-1.5 z-50 rounded-lg border border-[color:var(--border-normal)] bg-elevated shadow-[var(--shadow-popover)] py-1.5 max-h-[60vh] overflow-y-auto">
          {entries === null ? (
            <p className="px-3.5 py-2 text-xs text-[color:var(--text-faint)]">加载中…</p>
          ) : results.length === 0 ? (
            <p className="px-3.5 py-2 text-xs text-[color:var(--text-faint)]">没有匹配「{query.trim()}」的内容</p>
          ) : (
            groups.map((g) => (
              <div key={g.kind}>
                <p className="px-3.5 pt-1.5 pb-1 text-[10px] tracking-widest text-[color:var(--text-faint)]">
                  {SEARCH_KIND_LABEL[g.kind]}
                </p>
                {g.items.map((item) => {
                  const idx = visualResults.findIndex((entry) => entry.kind === item.kind && entry.id === item.id);
                  return (
                    <button
                      key={`${item.kind}-${item.id}`}
                      // mousedown 早于 input blur，保证点击可达
                      onMouseDown={(e) => { e.preventDefault(); go(item); }}
                      onMouseEnter={() => setActive(idx)}
                      className={cn(
                        'w-full flex items-center gap-2 px-3.5 py-1.5 text-left text-xs',
                        idx === active
                          ? 'bg-[var(--brand-active-bg)] text-brand'
                          : 'text-[color:var(--text-body)]',
                      )}
                    >
                      <span className="truncate">{item.title}</span>
                      {item.sub && (
                        <span className="text-[10px] text-[color:var(--text-faint)] truncate shrink-0">{item.sub}</span>
                      )}
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
