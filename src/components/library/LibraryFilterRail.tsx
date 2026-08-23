import { useEffect, useRef, useState } from 'react';
import {
  BookOpenText,
  ChevronDown,
  ChevronRight,
  Dices,
  GripVertical,
  HelpCircle,
  LayoutGrid,
  Sparkles,
  UserRound,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { CATEGORY_HELP, type BuiltinTagCategory, type TagCategory } from '@/lib/tag-taxonomy';
import type { LibraryFilterSections } from '@/lib/library-tag-preferences';

export interface LibraryTypeOption {
  value: string;
  label: string;
  count: number;
}

interface LibraryFilterRailProps {
  typeOptions: LibraryTypeOption[];
  unclassifiedCount: number;
  activeType: string;
  sections: LibraryFilterSections;
  activeTags: Partial<Record<TagCategory, string[]>>;
  uncategorizedExpanded: boolean;
  onTypeChange: (value: string) => void;
  onTagToggle: (category: TagCategory, raw: string) => void;
  onUncategorizedExpandedChange: (expanded: boolean) => void;
}

const CATEGORY_DOT: Record<Exclude<BuiltinTagCategory, '未分类'>, string> = {
  人物: 'var(--tag-people)',
  剧情: 'var(--tag-review)',
  玩法: 'var(--tag-play)',
  世界观: 'var(--tag-scene)',
  卡面: 'var(--tag-nsfw)',
  评价: 'var(--tag-review)',
};

const TYPE_ICONS: Record<string, LucideIcon> = {
  人物: UserRound,
  剧情: BookOpenText,
  玩法: Dices,
  综合: LayoutGrid,
  同人: Sparkles,
};

function FilterItem({
  label,
  count,
  active,
  onClick,
  uncategorized = false,
  pill = false,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
  uncategorized?: boolean;
  pill?: boolean;
}) {
  return (
    <button
      type="button"
      title={label}
      onClick={onClick}
      data-library-uncategorized-item={uncategorized || undefined}
      className={cn(
        pill
          ? 'inline-flex max-w-full items-center gap-1 rounded-full border border-[color:var(--hairline-inner)] px-2.5 py-1 text-left text-xs transition-colors'
          : 'flex min-w-0 items-center justify-between gap-1 rounded-md px-2 py-1.5 text-left text-xs font-medium transition-colors',
        active
          ? 'bg-[var(--brand-active-bg)] text-brand'
          : 'text-[color:var(--sidebar-text)] hover:bg-[var(--hover-overlay)] hover:text-[color:var(--text-primary)]',
      )}
    >
      <span className="truncate" title={label}>{label}</span>
      <span className={cn('shrink-0 text-[11px]', active ? 'opacity-90' : 'opacity-75')}>{count}</span>
    </button>
  );
}

export function LibraryFilterRail({
  typeOptions,
  unclassifiedCount,
  activeType,
  sections,
  activeTags,
  uncategorizedExpanded,
  onTypeChange,
  onTagToggle,
  onUncategorizedExpandedChange,
}: LibraryFilterRailProps) {
  const railRef = useRef<HTMLElement>(null);
  const draggingRef = useRef(false);
  const scrollEndRef = useRef<number | undefined>(undefined);
  const [scrolling, setScrolling] = useState(false);
  const [railWidth, setRailWidth] = useState(() => {
    try {
      const saved = Number(localStorage.getItem('ste-library-filter-width'));
      if (saved === 224) return 336;
      return saved >= 200 && saved <= 420 ? saved : 336;
    } catch {
      return 336;
    }
  });
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set());

  useEffect(() => {
    const move = (event: MouseEvent) => {
      if (!draggingRef.current || !railRef.current) return;
      const left = railRef.current.getBoundingClientRect().left;
      const next = Math.max(200, Math.min(420, event.clientX - left));
      setRailWidth(next);
    };
    const stop = () => { draggingRef.current = false; };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', stop);
    return () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', stop);
    };
  }, []);

  useEffect(() => () => {
    if (scrollEndRef.current !== undefined) window.clearTimeout(scrollEndRef.current);
  }, []);

  useEffect(() => {
    try { localStorage.setItem('ste-library-filter-width', String(railWidth)); } catch { /* ignore */ }
  }, [railWidth]);

  const wide = railWidth >= 240;
  const showUncategorized = unclassifiedCount > 0 || sections.uncategorized.total > 0;

  const handleScroll = () => {
    setScrolling(true);
    if (scrollEndRef.current !== undefined) window.clearTimeout(scrollEndRef.current);
    scrollEndRef.current = window.setTimeout(() => setScrolling(false), 650);
  };

  return (
    <aside
      ref={railRef}
      data-library-filter-rail
      className="relative flex shrink-0 flex-col overflow-hidden border-r border-[color:var(--hairline-inner)] py-3 pl-4 pr-3"
      style={{ width: railWidth }}
    >
      <section
        data-library-type-panel
        className="mb-2.5 shrink-0 rounded-lg border border-[color:var(--hairline-inner)] bg-[var(--bg-elevated)] px-2 pb-2 pt-2"
      >
        <div className="mb-1.5 flex items-center gap-1.5 text-[color:var(--sidebar-text)]">
          <span className="h-px flex-1 bg-[var(--hairline-inner)]" />
          <div className="flex items-center gap-1.5 text-xs font-semibold tracking-wide">
            <Sparkles className="h-3.5 w-3.5 text-[color:var(--brand-hi)]" />
            <span>类型</span>
          </div>
          <span
            title="每张卡只归一类；不选任何类型时显示全部角色"
            className="cursor-help text-[color:var(--sidebar-text-muted)]"
          >
            <HelpCircle className="h-3.5 w-3.5" />
          </span>
          <span className="h-px flex-1 bg-[var(--hairline-inner)]" />
        </div>
        <div data-library-type-grid className="grid grid-cols-2 gap-1">
          {typeOptions.map((option) => {
            const Icon = TYPE_ICONS[option.value] ?? Sparkles;
            const active = activeType === option.value;
            return (
              <button
                type="button"
                key={option.value}
                title={option.label}
                onClick={() => onTypeChange(active ? 'all' : option.value)}
                className={cn(
                  'flex h-8 min-w-0 items-center gap-1.5 rounded-md border px-2 text-left text-xs font-medium transition-colors',
                  active
                    ? 'border-[color:var(--brand)] bg-[var(--brand-active-bg)] text-brand'
                    : 'border-[color:var(--hairline-inner)] bg-[var(--bg-canvas)] text-[color:var(--sidebar-text)] hover:bg-[var(--hover-overlay)] hover:text-[color:var(--text-primary)]',
                )}
              >
                <Icon className="h-3.5 w-3.5 shrink-0 opacity-80" />
                <span className="min-w-0 flex-1 truncate" title={option.label}>{option.label}</span>
                <span className="shrink-0 text-[11px] opacity-70">{option.count}</span>
              </button>
            );
          })}
        </div>
      </section>

      <div
        data-library-filter-scroll
        data-scrolling={scrolling}
        onScroll={handleScroll}
        className="library-scrollbar-auto-hide min-h-0 flex-1 overflow-y-auto pr-1 scrollbar-thin"
      >
        {sections.categories.map((section, index) => {
          const collapsed = collapsedCategories.has(section.category);
          const help = CATEGORY_HELP[section.category as BuiltinTagCategory]
            ?? '自定义标签组，可在标签管理中调整顺序与显隐。';
          return (
            <section
              key={section.category}
              className={cn(index > 0 && 'mt-4 border-t border-[color:var(--hairline-inner)] pt-3.5')}
            >
              <button
                type="button"
                className="mb-2 flex w-full items-center gap-1 pl-1 text-left text-xs font-semibold tracking-wide text-[color:var(--sidebar-text)] hover:text-[color:var(--text-primary)]"
                onClick={() => setCollapsedCategories((current) => {
                  const next = new Set(current);
                  if (next.has(section.category)) next.delete(section.category);
                  else next.add(section.category);
                  return next;
                })}
                aria-label={`${collapsed ? '展开' : '折叠'}标签组 ${section.category}`}
              >
                {collapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                <span
                  className="h-1.5 w-1.5 shrink-0 rounded-full"
                  style={{
                    background: CATEGORY_DOT[section.category as Exclude<BuiltinTagCategory, '未分类'>]
                      ?? 'var(--sidebar-text-muted)',
                  }}
                />
                {section.category}
                <span title={help} className="cursor-help">
                  <HelpCircle className="h-3 w-3" />
                </span>
              </button>
              {!collapsed && (
                section.options.length > 0 ? (
                  <div data-library-tag-grid className={cn('grid gap-1', wide ? 'grid-cols-2' : 'grid-cols-1')}>
                    {section.options.map((option) => (
                      <FilterItem
                        key={option.raw}
                        label={option.label}
                        count={option.count}
                        active={activeTags[section.category]?.includes(option.raw) ?? false}
                        onClick={() => onTagToggle(section.category, option.raw)}
                      />
                    ))}
                  </div>
                ) : (
                  <p className="pl-6 text-xs text-[color:var(--sidebar-text-muted)]">暂无子标签</p>
                )
              )}
            </section>
          );
        })}
      </div>

      {showUncategorized && (
        <div
          data-library-uncategorized-footer
          data-scrolling={scrolling}
          onScroll={handleScroll}
          className={cn(
            'mt-3 shrink-0 border-t border-[color:var(--hairline-inner)] pt-3',
            uncategorizedExpanded && 'library-scrollbar-auto-hide max-h-52 overflow-y-auto pr-1 scrollbar-thin',
          )}
        >
          <button
            type="button"
            className={cn(
              'mb-2 flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-xs font-semibold transition-colors',
              activeType === 'none'
                ? 'bg-[var(--brand-active-bg)] text-brand'
                : 'text-[color:var(--sidebar-text)] hover:bg-[var(--hover-overlay)] hover:text-[color:var(--text-primary)]',
            )}
            onClick={() => onTypeChange(activeType === 'none' ? 'all' : 'none')}
            title="筛选没有设置类型的角色卡"
          >
            <span>未分类</span>
            <span className="text-[11px] opacity-75">{unclassifiedCount}</span>
          </button>
          <div className="flex flex-wrap gap-1.5">
            {sections.uncategorized.options.map((option) => (
              <FilterItem
                key={option.raw}
                label={option.label}
                count={option.count}
                active={activeTags['未分类']?.includes(option.raw) ?? false}
                uncategorized
                pill
                onClick={() => onTagToggle('未分类', option.raw)}
              />
            ))}
          </div>
          {(sections.uncategorized.hasMore || uncategorizedExpanded) && (
            <button
              type="button"
              className="mt-1.5 w-full rounded-md py-1 text-center text-xs text-[color:var(--sidebar-text-faint)] hover:bg-[var(--hover-overlay)] hover:text-[color:var(--sidebar-text)]"
              onClick={() => onUncategorizedExpandedChange(!uncategorizedExpanded)}
            >
              {uncategorizedExpanded ? '收起' : '展开其余…'}
            </button>
          )}
        </div>
      )}

      <div
        role="separator"
        aria-label="调整标签栏宽度"
        aria-orientation="vertical"
        aria-valuemin={200}
        aria-valuemax={420}
        aria-valuenow={railWidth}
        title="拖动调整标签栏宽度；窄栏为单列，常规宽度为双列"
        className="absolute inset-y-0 right-0 z-10 flex w-1 cursor-col-resize items-center justify-center hover:bg-[var(--brand)]/30"
        onMouseDown={(event) => {
          event.preventDefault();
          draggingRef.current = true;
        }}
      >
        <GripVertical className="pointer-events-none h-4 w-4 text-[color:var(--sidebar-text-faint)] opacity-0 transition-opacity hover:opacity-100" />
      </div>
    </aside>
  );
}
