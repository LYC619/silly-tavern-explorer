import { libraryListColumns } from './library-list-columns';

export function LibraryListHeader({ batchMode }: { batchMode: boolean }) {
  return (
    <div
      role="row"
      data-library-list-header
      className="sticky top-0 z-20 grid items-center gap-3.5 rounded-t-xl border-b border-[color:var(--hairline-inner)] bg-[var(--bg-elevated)] px-3.5 py-2 text-[11px] font-semibold tracking-wide text-[color:var(--text-muted)] shadow-sm"
      style={{ gridTemplateColumns: libraryListColumns(batchMode) }}
    >
      {batchMode && (
        <span role="columnheader" aria-label="选择" className="text-center">
          <span className="sr-only">选择</span>
          ✓
        </span>
      )}
      <span role="columnheader" className="col-span-2">角色卡</span>
      <span role="columnheader" className="text-right">评分</span>
      <span role="columnheader" className="text-right">故事数</span>
      <span role="columnheader" className="text-right">最近活动</span>
      <span role="columnheader" className="text-right">操作</span>
    </div>
  );
}
