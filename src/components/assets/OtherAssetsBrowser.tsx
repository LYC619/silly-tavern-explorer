import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  AlertTriangle,
  Archive,
  ArrowLeft,
  ChevronRight,
  Code2,
  File,
  FileJson,
  FileText,
  Folder,
  Image as ImageIcon,
  LayoutGrid,
  Loader2,
  MessageSquareReply,
  Palette,
  ShieldCheck,
  UserRound,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { getActiveVault } from '@/lib/vault/active';
import type { VaultFs } from '@/lib/vault/fs';
import {
  OTHER_ASSET_CATEGORIES,
  formatArchiveBytes,
  imageMimeType,
  listArchiveDirectory,
  loadExtensions,
  loadOtherAssetOverview,
  loadPersonas,
  loadQuickReplySets,
  type ArchiveFileItem,
  type ArchivedExtension,
  type ArchivedPersona,
  type OtherAssetCategoryId,
  type OtherAssetCategorySummary,
  type QuickReplySet,
} from '@/lib/vault/other-assets';
import { OtherAssetPreview } from './OtherAssetPreview';

type BrowserSection = 'overview' | OtherAssetCategoryId;

const SECTION_ICONS: Record<BrowserSection, typeof Archive> = {
  overview: LayoutGrid,
  extensions: Code2,
  'quick-replies': MessageSquareReply,
  personas: UserRound,
  backgrounds: ImageIcon,
  appearance: Palette,
  'user-media': Archive,
};

function isBrowserSection(value: string | null): value is BrowserSection {
  return value === 'overview' || OTHER_ASSET_CATEGORIES.some((category) => category.id === value);
}

function LoadState({ label = '正在读取归档…' }: { label?: string }) {
  return (
    <div className="flex h-full min-h-56 items-center justify-center gap-2 text-sm text-[color:var(--text-muted)]">
      <Loader2 className="h-4 w-4 animate-spin" />{label}
    </div>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <div role="alert" className="mx-auto mt-16 flex max-w-lg items-start gap-3 rounded-xl border border-[color:var(--border-subtle)] bg-[var(--status-danger-bg)] p-4 text-sm text-[color:var(--status-danger)]">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
      <div><p className="font-medium">归档读取失败</p><p className="mt-1 opacity-90">{message}</p></div>
    </div>
  );
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-full min-h-56 flex-col items-center justify-center gap-3 text-center text-[color:var(--text-muted)]">
      <Archive className="h-10 w-10 opacity-40" />
      <p className="max-w-md text-sm leading-relaxed">{children}</p>
    </div>
  );
}

function Overview({ items, onOpen }: { items: OtherAssetCategorySummary[]; onOpen: (id: OtherAssetCategoryId) => void }) {
  const total = items.reduce((sum, item) => sum + item.count, 0);
  if (total === 0) {
    return <EmptyState>还没有导入其他资产。请在设置页重新扫描 SillyTavern，并在导入窗口中勾选“其他资产”。</EmptyState>;
  }
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3" data-other-assets-overview>
      {items.map((item) => {
        const Icon = SECTION_ICONS[item.id];
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onOpen(item.id)}
            className="group flex min-h-32 items-start gap-4 rounded-xl border border-[color:var(--border-subtle)] bg-[var(--bg-elevated)] p-4 text-left transition-colors hover:bg-[var(--bg-elevated-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[var(--brand-active-bg)] text-brand"><Icon className="h-5 w-5" /></span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center justify-between gap-3">
                <span className="font-serif text-base font-semibold text-[color:var(--text-primary)]">{item.label}</span>
                <span className="font-serif text-lg font-semibold text-brand">{item.count}</span>
              </span>
              <span className="mt-2 block text-xs leading-relaxed text-[color:var(--text-muted)]">{item.description}</span>
              <span className="mt-3 flex items-center gap-1 text-[11px] text-brand opacity-80 group-hover:opacity-100">查看内容 <ChevronRight className="h-3 w-3" /></span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

function ExtensionList({ fs }: { fs: VaultFs }) {
  const [items, setItems] = useState<ArchivedExtension[] | null>(null);
  const [browse, setBrowse] = useState<ArchivedExtension | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setItems(null);
    setError(null);
    void loadExtensions(fs).then((next) => { if (!cancelled) setItems(next); })
      .catch((reason) => { if (!cancelled) setError(String(reason)); });
    return () => { cancelled = true; };
  }, [fs]);

  if (error) return <ErrorState message={error} />;
  if (!items) return <LoadState label="正在读取扩展清单…" />;
  if (browse) {
    return (
      <div className="flex h-full min-h-0 flex-col gap-3">
        <Button type="button" variant="ghost" size="sm" className="h-8 w-fit" onClick={() => setBrowse(null)}><ArrowLeft className="mr-1.5 h-4 w-4" />返回扩展列表</Button>
        <ArchiveDirectoryView fs={fs} root={`extensions/${browse.directory}`} title={browse.name} />
      </div>
    );
  }
  if (items.length === 0) return <EmptyState>没有发现已归档扩展。重新导入时请确认“其他资产 → 扩展”已被选中。</EmptyState>;

  return (
    <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
      {items.map((item) => (
        <article key={item.directory} className="flex min-h-40 flex-col rounded-xl border border-[color:var(--border-subtle)] bg-[var(--bg-elevated)] p-4">
          <div className="flex items-start gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--brand-active-bg)] text-brand"><Code2 className="h-4 w-4" /></span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                <h3 className="font-serif text-base font-semibold text-[color:var(--text-primary)]">{item.name}</h3>
                {item.version && <span className="text-[11px] text-[color:var(--text-muted)]">v{item.version}</span>}
              </div>
              <p className="mt-1 text-xs text-[color:var(--text-muted)]">{item.author ? `作者：${item.author}` : '未提供作者信息'}</p>
            </div>
          </div>
          <p className="mt-3 flex-1 text-xs leading-relaxed text-[color:var(--text-body)]">{item.description ?? '这个扩展的清单没有提供简介。'}</p>
          {item.manifestError && <p className="mt-2 text-[11px] text-[color:var(--status-warning)]">{item.manifestError}</p>}
          <div className="mt-3 flex items-center justify-between gap-3 border-t border-[color:var(--hairline-inner)] pt-3">
            <span className="min-w-0 truncate text-[10px] text-[color:var(--text-muted)]" title={item.directory}>{item.directory}</span>
            <Button type="button" variant="outline" size="sm" className="h-7 shrink-0 text-xs" onClick={() => setBrowse(item)}>查看归档文件</Button>
          </div>
        </article>
      ))}
    </div>
  );
}

function QuickReplyList({ fs }: { fs: VaultFs }) {
  const [sets, setSets] = useState<QuickReplySet[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    void loadQuickReplySets(fs).then((next) => { if (!cancelled) setSets(next); })
      .catch((reason) => { if (!cancelled) setError(String(reason)); });
    return () => { cancelled = true; };
  }, [fs]);
  if (error) return <ErrorState message={error} />;
  if (!sets) return <LoadState label="正在解析快速回复…" />;
  if (sets.length === 0) return <EmptyState>没有发现已归档的快速回复集合。</EmptyState>;
  return (
    <div className="space-y-4">
      {sets.map((set) => (
        <section key={set.path} className="overflow-hidden rounded-xl border border-[color:var(--border-subtle)] bg-[var(--bg-elevated)]">
          <header className="flex flex-wrap items-center gap-2 border-b border-[color:var(--hairline-inner)] px-4 py-3">
            <MessageSquareReply className="h-4 w-4 text-brand" />
            <h3 className="font-serif text-base font-semibold text-[color:var(--text-primary)]">{set.name}</h3>
            <span className="rounded-full bg-[var(--hover-overlay)] px-2 py-0.5 text-[10px] text-[color:var(--text-muted)]">{set.items.length} 项</span>
            {set.injectInput && <span className="rounded-full bg-[var(--brand-active-bg)] px-2 py-0.5 text-[10px] text-brand">注入输入框</span>}
            {set.placeBeforeInput && <span className="rounded-full bg-[var(--hover-overlay)] px-2 py-0.5 text-[10px] text-[color:var(--text-body)]">放在输入框前</span>}
            {set.disableSend && <span className="rounded-full bg-[var(--status-warning-bg)] px-2 py-0.5 text-[10px] text-[color:var(--status-warning)]">禁用发送</span>}
            {set.parseError && <span className="ml-auto text-[11px] text-[color:var(--status-warning)]">{set.parseError}</span>}
          </header>
          <div className="grid grid-cols-1 gap-2 p-3 xl:grid-cols-2">
            {set.items.length === 0 ? (
              <p className="px-2 py-4 text-center text-xs text-[color:var(--text-muted)]">这个集合没有回复项。</p>
            ) : set.items.map((item) => (
              <article key={`${set.path}:${item.id}`} className="rounded-lg border border-[color:var(--hairline-inner)] bg-[var(--bg-canvas)] p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <h4 className="font-medium text-[color:var(--text-primary)]">{item.label}</h4>
                  {item.title && item.title !== item.label && <span className="text-[10px] text-[color:var(--text-muted)]">{item.title}</span>}
                  {item.hidden && <span className="text-[10px] text-[color:var(--status-warning)]">已隐藏</span>}
                  {item.preventAutoExecute && <span className="ml-auto text-[10px] text-[color:var(--text-muted)]">手动执行</span>}
                </div>
                <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-md bg-[var(--hover-overlay)] p-2 font-mono text-[11px] leading-relaxed text-[color:var(--text-body)] scrollbar-thin" data-quick-reply-message>{item.message || '（空回复）'}</pre>
                {item.triggers.length > 0 && <p className="mt-2 text-[10px] text-[color:var(--text-muted)]">触发：{item.triggers.join('、')}</p>}
              </article>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function VaultImage({ fs, path, name, className }: { fs: VaultFs; path: string; name: string; className?: string }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    void fs.readBinary(path).then((base64) => {
      if (!cancelled) setSrc(`data:${imageMimeType(name)};base64,${base64}`);
    }).catch(() => { if (!cancelled) setSrc(null); });
    return () => { cancelled = true; };
  }, [fs, name, path]);
  return src
    ? <img src={src} alt={name} className={className} loading="lazy" />
    : <span className={cn('flex items-center justify-center bg-[var(--hover-overlay)] text-[color:var(--text-muted)]', className)}><UserRound className="h-6 w-6" /></span>;
}

function PersonaList({ fs }: { fs: VaultFs }) {
  const [items, setItems] = useState<ArchivedPersona[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    void loadPersonas(fs).then((next) => { if (!cancelled) setItems(next); })
      .catch((reason) => { if (!cancelled) setError(String(reason)); });
    return () => { cancelled = true; };
  }, [fs]);
  if (error) return <ErrorState message={error} />;
  if (!items) return <LoadState label="正在读取用户人设…" />;
  if (items.length === 0) return <EmptyState>没有发现已归档的用户人设清单。</EmptyState>;
  return (
    <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
      {items.map((item) => (
        <article key={item.fileName} className="flex gap-4 rounded-xl border border-[color:var(--border-subtle)] bg-[var(--bg-elevated)] p-4">
          {item.avatarPath
            ? <VaultImage fs={fs} path={item.avatarPath} name={item.name} className="h-20 w-20 shrink-0 rounded-xl object-cover" />
            : <span className="flex h-20 w-20 shrink-0 items-center justify-center rounded-xl bg-[var(--hover-overlay)] text-[color:var(--text-muted)]"><UserRound className="h-8 w-8" /></span>}
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-baseline gap-2">
              <h3 className="font-serif text-base font-semibold text-[color:var(--text-primary)]">{item.name}</h3>
              {item.title && <span className="text-[11px] text-[color:var(--text-muted)]">{item.title}</span>}
            </div>
            <p className="mt-2 whitespace-pre-wrap text-xs leading-relaxed text-[color:var(--text-body)]">{item.description || '这个人设没有填写描述。'}</p>
            <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-[color:var(--text-muted)]">
              {item.lorebook && <span>关联世界书：{item.lorebook}</span>}
              {item.position !== undefined && <span>插入位置：{item.position}</span>}
              {item.depth !== undefined && <span>深度：{item.depth}</span>}
            </div>
            <p className="mt-2 truncate text-[10px] text-[color:var(--text-muted)]" title={item.fileName}>{item.fileName}</p>
          </div>
        </article>
      ))}
    </div>
  );
}

function FileGlyph({ file }: { file: ArchiveFileItem }) {
  if (file.isDir) return <Folder className="h-5 w-5" />;
  if (file.preview === 'image') return <ImageIcon className="h-5 w-5" />;
  if (file.preview === 'json') return <FileJson className="h-5 w-5" />;
  if (file.preview === 'text') return <FileText className="h-5 w-5" />;
  return <File className="h-5 w-5" />;
}

function ArchiveImageThumbnail({ fs, file }: { fs: VaultFs; file: ArchiveFileItem }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    void fs.readBinary(file.path).then((base64) => {
      if (!cancelled) setSrc(`data:${imageMimeType(file.name)};base64,${base64}`);
    }).catch(() => { if (!cancelled) setSrc(null); });
    return () => { cancelled = true; };
  }, [file, fs]);
  return src
    ? <img src={src} alt="" className="h-20 w-full rounded-md object-cover" loading="lazy" />
    : <span className="flex h-20 w-full items-center justify-center rounded-md bg-[var(--hover-overlay)]"><ImageIcon className="h-6 w-6 opacity-50" /></span>;
}

function ArchiveDirectoryView({ fs, root, title }: { fs: VaultFs; root: string; title: string }) {
  const [currentPath, setCurrentPath] = useState(root);
  const [files, setFiles] = useState<ArchiveFileItem[] | null>(null);
  const [preview, setPreview] = useState<ArchiveFileItem | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setFiles(null);
    setError(null);
    setPreview(null);
    void listArchiveDirectory(fs, currentPath).then((next) => { if (!cancelled) setFiles(next); })
      .catch((reason) => { if (!cancelled) setError(String(reason)); });
    return () => { cancelled = true; };
  }, [currentPath, fs]);

  const canGoUp = currentPath !== root;
  const goUp = () => {
    if (!canGoUp) return;
    setCurrentPath(currentPath.slice(0, currentPath.lastIndexOf('/')) || root);
  };

  if (error) return <ErrorState message={error} />;
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex shrink-0 items-center gap-2 rounded-lg border border-[color:var(--hairline-inner)] bg-[var(--bg-elevated)] px-3 py-2">
        <Button type="button" variant="ghost" size="sm" className="h-7 px-2" onClick={goUp} disabled={!canGoUp} aria-label="返回上一级"><ArrowLeft className="h-4 w-4" /></Button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-medium text-[color:var(--text-primary)]">{title}</p>
          <p className="truncate text-[10px] text-[color:var(--text-muted)]" title={currentPath}>{currentPath}</p>
        </div>
        <span className="text-[10px] text-[color:var(--text-muted)]">{files?.length ?? 0} 项</span>
      </div>
      {files === null ? <LoadState label="正在读取目录…" /> : files.length === 0 ? <EmptyState>这个归档目录是空的。</EmptyState> : (
        <div className={cn('grid min-h-0 flex-1 gap-3', preview ? 'grid-cols-[minmax(0,3fr)_minmax(280px,2fr)]' : 'grid-cols-1')}>
          <div className="min-h-0 overflow-auto pr-1 scrollbar-thin">
            <div className="grid grid-cols-2 gap-2 xl:grid-cols-3">
              {files.map((file) => (
                <button
                  key={file.path}
                  type="button"
                  onClick={() => file.isDir ? setCurrentPath(file.relativePath) : setPreview(file)}
                  className={cn(
                    'min-w-0 rounded-lg border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand',
                    preview?.path === file.path
                      ? 'border-brand bg-[var(--brand-active-bg)]'
                      : 'border-[color:var(--border-subtle)] bg-[var(--bg-elevated)] hover:bg-[var(--bg-elevated-strong)]',
                  )}
                >
                  {file.preview === 'image' && !file.isDir
                    ? <ArchiveImageThumbnail fs={fs} file={file} />
                    : <span className="flex h-20 items-center justify-center rounded-md bg-[var(--hover-overlay)] text-brand"><FileGlyph file={file} /></span>}
                  <span className="mt-2 flex min-w-0 items-center gap-2">
                    <span className="min-w-0 flex-1 truncate text-xs font-medium text-[color:var(--text-primary)]" title={file.name}>{file.name}</span>
                    {file.isDir && <ChevronRight className="h-3.5 w-3.5 shrink-0 text-[color:var(--text-muted)]" />}
                  </span>
                  {!file.isDir && <span className="mt-1 block text-[10px] text-[color:var(--text-muted)]">{formatArchiveBytes(file.size)}</span>}
                </button>
              ))}
            </div>
          </div>
          {preview && <OtherAssetPreview fs={fs} file={preview} onClose={() => setPreview(null)} />}
        </div>
      )}
    </div>
  );
}

function SectionContent({ fs, section }: { fs: VaultFs; section: BrowserSection }) {
  const [overview, setOverview] = useState<OtherAssetCategorySummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, setSearchParams] = useSearchParams();

  useEffect(() => {
    if (section !== 'overview') return;
    let cancelled = false;
    setOverview(null);
    setError(null);
    void loadOtherAssetOverview(fs).then((next) => { if (!cancelled) setOverview(next); })
      .catch((reason) => { if (!cancelled) setError(String(reason)); });
    return () => { cancelled = true; };
  }, [fs, section]);

  if (section === 'overview') {
    if (error) return <ErrorState message={error} />;
    if (!overview) return <LoadState />;
    return <Overview items={overview} onOpen={(id) => setSearchParams({ section: id })} />;
  }
  if (section === 'extensions') return <ExtensionList fs={fs} />;
  if (section === 'quick-replies') return <QuickReplyList fs={fs} />;
  if (section === 'personas') return <PersonaList fs={fs} />;
  const category = OTHER_ASSET_CATEGORIES.find((item) => item.id === section)!;
  return <ArchiveDirectoryView fs={fs} root={category.relativePath} title={category.label} />;
}

export function OtherAssetsBrowser() {
  const [searchParams, setSearchParams] = useSearchParams();
  const rawSection = searchParams.get('section');
  const section: BrowserSection = isBrowserSection(rawSection) ? rawSection : 'overview';
  const vault = getActiveVault();
  const navItems = useMemo(() => [
    { id: 'overview' as const, label: '概览', description: '查看全部归档分类' },
    ...OTHER_ASSET_CATEGORIES,
  ], []);

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <header className="shrink-0 border-b border-[color:var(--hairline-inner)] px-6 py-4">
        <div className="flex flex-wrap items-start gap-x-4 gap-y-2">
          <div className="min-w-0 flex-1">
            <h1 className="font-serif text-[22px] font-semibold tracking-wide text-[color:var(--text-primary)]">已归档的 SillyTavern 其他资产</h1>
            <p className="mt-1 text-xs leading-relaxed text-[color:var(--text-muted)]">查看扩展、快速回复、用户人设和媒体归档；所有内容只读，扩展代码不会执行。</p>
          </div>
          <span className="flex items-center gap-1.5 rounded-full bg-[var(--status-ok-bg)] px-3 py-1.5 text-[11px] text-[color:var(--status-ok)]"><ShieldCheck className="h-3.5 w-3.5" />安全只读</span>
        </div>
      </header>

      {!vault ? (
        <EmptyState>其他资产只在客户端文件库中显示。请先选择或创建一个 STE 文件库。</EmptyState>
      ) : (
        <div className="flex min-h-0 flex-1">
          <aside className="w-44 shrink-0 overflow-y-auto border-r border-[color:var(--hairline-inner)] px-3 py-4 scrollbar-thin" aria-label="其他资产分类">
            <nav className="space-y-1">
              {navItems.map((item) => {
                const Icon = SECTION_ICONS[item.id];
                const active = section === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setSearchParams(item.id === 'overview' ? {} : { section: item.id })}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand',
                      active
                        ? 'bg-[var(--brand-active-bg)] font-medium text-brand'
                        : 'text-[color:var(--sidebar-text-muted)] hover:bg-[var(--hover-overlay)] hover:text-[color:var(--sidebar-text)]',
                    )}
                    title={item.description}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    <span className="truncate">{item.label}</span>
                  </button>
                );
              })}
            </nav>
          </aside>
          <main className="min-w-0 flex-1 overflow-auto px-6 py-4 scrollbar-thin">
            <SectionContent fs={vault.fs} section={section} />
          </main>
        </div>
      )}
    </div>
  );
}

