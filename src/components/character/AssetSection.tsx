/**
 * 角色卡主页 · 关联资产 tab（阶段5 引用制；10.3c 宽抽屉预览 + 引用条目 + 导入/读取内置入口）。
 * 列表：三类资产（世界书/预设/正则，引用制）+ 引用摘录（quotes，角色档案自有数据）；
 * 点条目开右侧宽抽屉逐条预览，明确点「在编辑器中打开」才进工具区（带角色上下文 → 写时复制）。
 */
import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Globe, SlidersHorizontal, Regex as RegexIcon, Quote as QuoteIcon,
  Plus, X, Wrench, PackageOpen, Upload,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle,
} from '@/components/ui/sheet';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import type {
  ArchiveCharacter,
  AssetKind,
  AssetRef,
  DerivedAssetMeta,
  QuoteAsset,
  STAssetRelation,
} from '@/types/archive';
import type { WorldBookEntry } from '@/types/worldbook';
import { getAllWorldBooks } from '@/lib/worldbook-db';
import { getAllPresets } from '@/lib/preset-db';
import { getAllRegexCollections } from '@/lib/regex-db';
import { addAssetRef, removeAssetRef } from '@/lib/asset-cow';
import { formatListTime, formatFullTime } from '@/lib/time-display';
import { buildQuotePreview } from '@/lib/asset-preview';

/** 抽屉里的一条预览（世界书条目/提示词块/正则规则/引用段落） */
interface AssetEntry {
  title?: string;
  /** 触发词/正则等（mono 小字） */
  keys?: string;
  body?: string;
}

/** 列表统一视图：三类资产 + 引用摘录 */
interface AssetView {
  kind: AssetKind | 'quote';
  id: string;
  title: string;
  updatedAt: number;
  derived?: DerivedAssetMeta;
  entries: AssetEntry[];
  count: number;
  relations?: STAssetRelation[];
}

const PREVIEW_LIMIT = 8;

const RELATION_LABELS: Record<STAssetRelation, string> = {
  embedded: '卡内嵌',
  primary: '主绑定',
  extra: '额外链接',
  chat: '对话级',
};

const KIND_META: Record<AssetView['kind'], { label: string; icon: typeof Globe; toolPath: string; unit: string }> = {
  worldbook: { label: '世界书', icon: Globe, toolPath: '/worldbook', unit: '条目' },
  preset: { label: '预设', icon: SlidersHorizontal, toolPath: '/preset', unit: '提示词块' },
  regex: { label: '正则', icon: RegexIcon, toolPath: '/regex', unit: '规则' },
  quote: { label: '引用', icon: QuoteIcon, toolPath: '', unit: '段' },
};

interface AssetSectionProps {
  character: ArchiveCharacter;
  /** 引用增删后回写角色档案 */
  onAssetsChange: (assets: AssetRef[]) => Promise<void>;
  /** 引用摘录变更回写 */
  onQuotesChange: (quotes: QuoteAsset[]) => Promise<void>;
  /** 重扫卡内嵌世界书/正则入库挂关联（与操作抽屉同一动作） */
  onReadEmbedded: () => Promise<void>;
  /** 打开统一导入弹窗（预选世界书类） */
  onOpenImport: () => void;
}

export function AssetSection({ character, onAssetsChange, onQuotesChange, onReadEmbedded, onOpenImport }: AssetSectionProps) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [library, setLibrary] = useState<AssetView[]>([]);
  const [addOpen, setAddOpen] = useState(false);
  const [preview, setPreview] = useState<AssetView | null>(null);
  const [quoteToDelete, setQuoteToDelete] = useState<QuoteAsset | null>(null);

  const loadLibrary = useCallback(async () => {
    const [wbs, presets, regexes] = await Promise.all([
      getAllWorldBooks().catch(() => []),
      getAllPresets().catch(() => []),
      getAllRegexCollections().catch(() => []),
    ]);
    const views: AssetView[] = [
      ...wbs.map((w): AssetView => {
        const entries = Object.values<WorldBookEntry>(w.worldbook?.entries ?? {});
        return {
          kind: 'worldbook', id: w.id, title: w.title, updatedAt: w.updatedAt, derived: w.derived,
          entries: entries.slice(0, PREVIEW_LIMIT).map((e) => ({
            title: e.comment || `条目 ${e.uid}`,
            keys: e.key.join(', ') || undefined,
            body: e.content,
          })),
          count: entries.length,
        };
      }),
      ...presets.map((p): AssetView => ({
        kind: 'preset', id: p.id, title: p.title, updatedAt: p.updatedAt, derived: p.derived,
        entries: p.preset.prompts.slice(0, PREVIEW_LIMIT).map((b) => ({
          title: b.name || b.identifier,
          body: b.marker ? '（系统插槽，运行时动态填充）' : b.content,
        })),
        count: p.preset.prompts.length,
      })),
      ...regexes.map((r): AssetView => ({
        kind: 'regex', id: r.id, title: r.title, updatedAt: r.updatedAt, derived: r.derived,
        entries: r.rules.slice(0, PREVIEW_LIMIT).map((x) => ({
          title: x.name,
          keys: x.findRegex,
          body: x.replaceString ? `→ ${x.replaceString}` : '→（删除匹配内容）',
        })),
        count: r.rules.length,
      })),
    ];
    setLibrary(views);
  }, []);

  useEffect(() => {
    void loadLibrary();
  }, [loadLibrary, character.assets]);

  const refs = character.assets ?? [];
  const quotes = character.quotes ?? [];
  const linked: AssetView[] = refs.flatMap((ref): AssetView[] => {
    const asset = library.find((a) => a.kind === ref.kind && a.id === ref.assetId);
    return asset ? [{ ...asset, relations: ref.relations }] : [];
  });
  const quoteViews = quotes.map((q): AssetView => {
    const quotePreview = buildQuotePreview(q.body);
    return {
      kind: 'quote', id: q.id, title: q.title, updatedAt: q.addedAt,
      entries: quotePreview.entries,
      count: quotePreview.count,
    };
  });
  const items = [...linked, ...quoteViews];
  // 引用里有、库里已删的（提示失效引用可移除）
  const broken = refs.filter((ref) => !library.some((a) => a.kind === ref.kind && a.id === ref.assetId));
  const unresolved = character.unresolvedAssets ?? [];
  const linkable = library.filter((a) => !refs.some((r) => r.kind === a.kind && r.assetId === a.id));

  const handleAdd = async (a: AssetView) => {
    try {
      await onAssetsChange(addAssetRef(refs, a.kind as AssetKind, a.id));
      setAddOpen(false);
      toast({ title: `已关联${KIND_META[a.kind].label}「${a.title}」`, description: '只记引用，不复制内容' });
    } catch {
      // 父层已提示失败；保留选择面板。
    }
  };

  const handleRemove = async (kind: AssetKind, assetId: string, title?: string) => {
    try {
      await onAssetsChange(removeAssetRef(refs, kind, assetId));
      toast({ title: `已移除引用${title ? `「${title}」` : ''}`, description: '资产本体仍在资产库中' });
    } catch {
      // 父层已提示失败。
    }
  };

  const handleReadEmbedded = async () => {
    try {
      await onReadEmbedded();
      await loadLibrary();
    } catch {
      // 父层已提示失败。
    }
  };

  const openEditor = (a: AssetView) => {
    navigate(`${KIND_META[a.kind].toolPath}?assetId=${encodeURIComponent(a.id)}&characterId=${encodeURIComponent(character.id)}`);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="text-xs text-muted-foreground mr-auto">世界书 / 预设 / 正则（引用制）+ 引用摘录</span>
        <Button variant="outline" size="sm" className="h-7" title="重新扫描卡内嵌的世界书/正则并入库挂关联" onClick={() => void handleReadEmbedded()}>
          <PackageOpen className="w-3.5 h-3.5 mr-1" />
          读取内置资源
        </Button>
        <Button variant="outline" size="sm" className="h-7" onClick={onOpenImport}>
          <Upload className="w-3.5 h-3.5 mr-1" />
          导入资产
        </Button>
        <Popover open={addOpen} onOpenChange={setAddOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="h-7">
              <Plus className="w-3.5 h-3.5 mr-1" />
              添加引用
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-80" align="end">
            <p className="text-sm font-medium mb-2">从资产库选择</p>
            {linkable.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                资产库里没有可关联的条目。先在处理区的世界书/预设/正则工具里保存资产。
              </p>
            ) : (
              <ScrollArea className="max-h-64">
                <div className="space-y-1">
                  {linkable.map((a) => {
                    const Icon = KIND_META[a.kind].icon;
                    return (
                      <button
                        key={`${a.kind}-${a.id}`}
                        className="w-full flex items-center gap-2 p-2 rounded-md hover:bg-accent/40 text-sm text-left"
                        onClick={() => void handleAdd(a)}
                      >
                        <Icon className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                        <span className="flex-1 min-w-0 truncate">{a.title}</span>
                        {a.derived && <Badge variant="outline" className="h-4 px-1 text-[10px] shrink-0">派生</Badge>}
                        <span className="text-[10px] text-muted-foreground shrink-0">{KIND_META[a.kind].label}</span>
                      </button>
                    );
                  })}
                </div>
              </ScrollArea>
            )}
          </PopoverContent>
        </Popover>
      </div>

      {items.length === 0 && broken.length === 0 && unresolved.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          还没有关联资产。角色用到的世界书/预设/正则可以在这里挂引用；在角色上下文里修改共享资产时，
          会自动生成「资产名_{character.name}」的派生副本，不影响其他角色。摘录、语料片段可从「导入资产」进来。
        </p>
      ) : (
        <div className="space-y-1.5">
          {items.map((a) => {
            const meta = KIND_META[a.kind];
            const Icon = meta.icon;
            const isOwnDerived = a.derived?.characterId === character.id;
            return (
              <div
                key={`${a.kind}-${a.id}`}
                className="flex items-center gap-2.5 rounded-lg border border-border bg-card px-3 py-2 text-sm hover:border-primary/40 transition-colors cursor-pointer"
                onClick={() => setPreview(a)}
                title="点击查看条目预览"
              >
                <Icon className="w-4 h-4 text-muted-foreground shrink-0" />
                <span className="min-w-0 truncate font-medium">{a.title}</span>
                <Badge variant="outline" className="h-4 px-1 text-[10px] text-muted-foreground shrink-0">{meta.label}</Badge>
                {a.kind !== 'quote' && (
                  a.derived ? (
                    <Badge variant="secondary" className="h-4 px-1 text-[10px] shrink-0" title={isOwnDerived ? '本角色的派生副本' : '其他角色的派生副本'}>
                      派生{isOwnDerived ? '' : '(他人)'}
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="h-4 px-1 text-[10px] text-muted-foreground shrink-0">共享</Badge>
                  )
                )}
                {a.relations?.map((relation) => (
                  <Badge key={relation} variant="outline" className="h-4 px-1 text-[10px] text-primary shrink-0">
                    {RELATION_LABELS[relation]}
                  </Badge>
                ))}
                <span className="text-xs text-muted-foreground shrink-0 hidden sm:inline">{a.count} {meta.unit}</span>
                <span className="ml-auto text-xs text-muted-foreground shrink-0 hidden sm:inline" title={formatFullTime(a.updatedAt)}>
                  {formatListTime(a.updatedAt)}
                </span>
                {a.kind !== 'quote' && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 shrink-0"
                    onClick={(e) => { e.stopPropagation(); openEditor(a); }}
                  >
                    <Wrench className="w-3.5 h-3.5 mr-1" />
                    处理
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (a.kind === 'quote') setQuoteToDelete(quotes.find((q) => q.id === a.id) ?? null);
                    else void handleRemove(a.kind as AssetKind, a.id, a.title);
                  }}
                  aria-label={a.kind === 'quote' ? '删除引用' : '移除引用'}
                >
                  <X className="w-3.5 h-3.5" />
                </Button>
              </div>
            );
          })}
          {broken.map((ref) => (
            <div key={`${ref.kind}-${ref.assetId}`} className="flex items-center gap-2.5 rounded-lg border border-dashed border-border px-3 py-2 text-sm text-muted-foreground">
              <span className="min-w-0 truncate">引用的{KIND_META[ref.kind].label}已被删除</span>
              <Button
                variant="ghost"
                size="sm"
                className="ml-auto h-7"
                onClick={() => void handleRemove(ref.kind, ref.assetId)}
              >
                移除失效引用
              </Button>
            </div>
          ))}
          {unresolved.map((ref) => (
            <div key={`${ref.kind}-${ref.relation}-${ref.name}`} className="flex items-center gap-2.5 rounded-lg border border-dashed border-amber-500/50 px-3 py-2 text-sm">
              <Globe className="w-4 h-4 text-amber-600 shrink-0" />
              <span className="min-w-0 truncate">未找到世界书「{ref.name}」</span>
              <Badge variant="outline" className="ml-auto h-4 px-1 text-[10px] text-amber-700 shrink-0">
                {RELATION_LABELS[ref.relation]}
              </Badge>
            </div>
          ))}
        </div>
      )}

      {/* 宽抽屉：条目预览（设计稿 side wide）；明确点「在编辑器中打开」才进工具区 */}
      <Sheet open={!!preview} onOpenChange={(v) => { if (!v) setPreview(null); }}>
        <SheetContent side="right" className="w-full sm:max-w-xl flex flex-col">
          {preview && (
            <>
              <SheetHeader>
                <SheetDescription>
                  {KIND_META[preview.kind].label}
                  {preview.derived && ' · 派生副本'}
                  {' · '}
                  {formatFullTime(preview.updatedAt)}
                </SheetDescription>
                <SheetTitle>{preview.title}</SheetTitle>
                <SheetDescription>共 {preview.count} 个{KIND_META[preview.kind].unit}</SheetDescription>
              </SheetHeader>
              <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin space-y-2.5 mt-2">
                {preview.entries.map((e, i) => (
                  <div key={i} className="rounded-lg border border-border bg-card px-3 py-2.5">
                    {e.title && <p className="text-sm font-medium mb-1">{e.title}</p>}
                    {e.keys && <p className="text-xs text-muted-foreground font-mono mb-1.5 break-all">{e.keys}</p>}
                    {e.body && <p className="text-[13px] leading-relaxed whitespace-pre-wrap text-muted-foreground">{e.body}</p>}
                  </div>
                ))}
                {preview.count > preview.entries.length && (
                  <p className="text-xs text-muted-foreground/70 text-center pb-2">
                    …还有 {preview.count - preview.entries.length} 个{KIND_META[preview.kind].unit}，在编辑器中查看全部
                  </p>
                )}
              </div>
              <div className="flex justify-end gap-2 pt-3 border-t border-border">
                <Button variant="outline" onClick={() => setPreview(null)}>关闭</Button>
                {preview.kind !== 'quote' && (
                  <Button onClick={() => openEditor(preview)}>
                    <Wrench className="w-4 h-4 mr-1.5" />
                    在编辑器中打开
                  </Button>
                )}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* 引用删除确认（真删数据，与移除资产引用不同） */}
      <AlertDialog open={!!quoteToDelete} onOpenChange={(v) => !v && setQuoteToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除引用「{quoteToDelete?.title}」？</AlertDialogTitle>
            <AlertDialogDescription>引用是这张卡自己的摘录数据，删除后无法恢复。</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (quoteToDelete) {
                  const target = quoteToDelete;
                  void onQuotesChange(quotes.filter((q) => q.id !== target.id))
                    .then(() => {
                      setQuoteToDelete(null);
                      toast({ title: `已删除引用「${target.title}」` });
                    })
                    .catch(() => {});
                }
              }}
            >
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
