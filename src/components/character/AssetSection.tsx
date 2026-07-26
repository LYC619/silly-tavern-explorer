/**
 * 角色卡主页 · 关联资产区（2.0 阶段5，定稿第四/七章）。
 * 紧凑列表：资产名 / 类型 / 共享·派生状态 / 最近修改时间；
 * 点击进只读概览，明确点「处理」才进工具区（带角色上下文 → 保存时写时复制）；
 * 「添加引用」从资产库挑选，只记引用不复制内容。
 */
import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Globe, SlidersHorizontal, Regex as RegexIcon, Plus, X, Wrench, Package } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import type { ArchiveCharacter, AssetKind, AssetRef, DerivedAssetMeta } from '@/types/archive';
import type { WorldBookEntry } from '@/types/worldbook';
import { getAllWorldBooks } from '@/lib/worldbook-db';
import { getAllPresets } from '@/lib/preset-db';
import { getAllRegexCollections } from '@/lib/regex-db';
import { addAssetRef, removeAssetRef } from '@/lib/asset-cow';

/** 三类资产在本区需要的统一视图 */
interface AssetView {
  kind: AssetKind;
  id: string;
  title: string;
  updatedAt: number;
  derived?: DerivedAssetMeta;
  /** 概览用的摘要行（条目名/块名/规则名，最多几条） */
  outline: string[];
  count: number;
}

const KIND_META: Record<AssetKind, { label: string; icon: typeof Globe; toolPath: string; unit: string }> = {
  worldbook: { label: '世界书', icon: Globe, toolPath: '/worldbook', unit: '条目' },
  preset: { label: '预设', icon: SlidersHorizontal, toolPath: '/preset', unit: '提示词块' },
  regex: { label: '正则', icon: RegexIcon, toolPath: '/regex', unit: '规则' },
};

interface AssetSectionProps {
  character: ArchiveCharacter;
  /** 引用增删后回写角色档案 */
  onAssetsChange: (assets: AssetRef[]) => void;
}

export function AssetSection({ character, onAssetsChange }: AssetSectionProps) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [library, setLibrary] = useState<AssetView[]>([]);
  const [addOpen, setAddOpen] = useState(false);
  const [preview, setPreview] = useState<AssetView | null>(null);

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
          outline: entries.slice(0, 6).map((e) => e.comment || `条目 ${e.uid}`),
          count: entries.length,
        };
      }),
      ...presets.map((p): AssetView => ({
        kind: 'preset', id: p.id, title: p.title, updatedAt: p.updatedAt, derived: p.derived,
        outline: p.preset.prompts.slice(0, 6).map((b) => b.name || b.identifier),
        count: p.preset.prompts.length,
      })),
      ...regexes.map((r): AssetView => ({
        kind: 'regex', id: r.id, title: r.title, updatedAt: r.updatedAt, derived: r.derived,
        outline: r.rules.slice(0, 6).map((x) => x.name),
        count: r.rules.length,
      })),
    ];
    setLibrary(views);
  }, []);

  useEffect(() => {
    loadLibrary();
  }, [loadLibrary]);

  const refs = character.assets ?? [];
  const linked = refs
    .map((ref) => library.find((a) => a.kind === ref.kind && a.id === ref.assetId))
    .filter((a): a is AssetView => !!a);
  // 引用里有、库里已删的（提示失效引用可移除）
  const broken = refs.filter((ref) => !library.some((a) => a.kind === ref.kind && a.id === ref.assetId));
  const linkable = library.filter((a) => !refs.some((r) => r.kind === a.kind && r.assetId === a.id));

  const handleAdd = (a: AssetView) => {
    onAssetsChange(addAssetRef(refs, a.kind, a.id));
    setAddOpen(false);
    toast({ title: `已关联${KIND_META[a.kind].label}「${a.title}」`, description: '只记引用，不复制内容' });
  };

  const handleRemove = (kind: AssetKind, assetId: string, title?: string) => {
    onAssetsChange(removeAssetRef(refs, kind, assetId));
    toast({ title: `已移除引用${title ? `「${title}」` : ''}`, description: '资产本体仍在资产库中' });
  };

  return (
    <div className="mt-6">
      <div className="flex items-center gap-2 mb-2">
        <Package className="w-4 h-4 text-primary" />
        <h2 className="font-display text-base font-semibold">关联资产</h2>
        <span className="text-xs text-muted-foreground">世界书 / 预设 / 正则 · 引用制</span>
        <Popover open={addOpen} onOpenChange={setAddOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="ml-auto h-7">
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
                        onClick={() => handleAdd(a)}
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

      {linked.length === 0 && broken.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          还没有关联资产。角色用到的世界书/预设/正则可以在这里挂引用；在角色上下文里修改共享资产时，
          会自动生成「资产名_{character.name}」的派生副本，不影响其他角色。
        </p>
      ) : (
        <div className="space-y-1.5">
          {linked.map((a) => {
            const meta = KIND_META[a.kind];
            const Icon = meta.icon;
            const isOwnDerived = a.derived?.characterId === character.id;
            return (
              <div
                key={`${a.kind}-${a.id}`}
                className="flex items-center gap-2.5 rounded-lg border border-border bg-card px-3 py-2 text-sm hover:border-primary/40 transition-colors cursor-pointer"
                onClick={() => setPreview(a)}
                title="点击查看只读概览"
              >
                <Icon className="w-4 h-4 text-muted-foreground shrink-0" />
                <span className="min-w-0 truncate font-medium">{a.title}</span>
                <Badge variant="outline" className="h-4 px-1 text-[10px] text-muted-foreground shrink-0">{meta.label}</Badge>
                {a.derived ? (
                  <Badge variant="secondary" className="h-4 px-1 text-[10px] shrink-0" title={isOwnDerived ? '本角色的派生副本' : '其他角色的派生副本'}>
                    派生{isOwnDerived ? '' : '(他人)'}
                  </Badge>
                ) : (
                  <Badge variant="outline" className="h-4 px-1 text-[10px] text-muted-foreground shrink-0">共享</Badge>
                )}
                <span className="ml-auto text-xs text-muted-foreground shrink-0 hidden sm:inline">
                  {new Date(a.updatedAt).toLocaleDateString()}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 shrink-0"
                  onClick={(e) => {
                    e.stopPropagation();
                    navigate(`${meta.toolPath}?assetId=${encodeURIComponent(a.id)}&characterId=${encodeURIComponent(character.id)}`);
                  }}
                >
                  <Wrench className="w-3.5 h-3.5 mr-1" />
                  处理
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
                  onClick={(e) => { e.stopPropagation(); handleRemove(a.kind, a.id, a.title); }}
                  aria-label="移除引用"
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
                onClick={() => handleRemove(ref.kind, ref.assetId)}
              >
                移除失效引用
              </Button>
            </div>
          ))}
        </div>
      )}

      {/* 只读概览：明确点「处理」才进工具区 */}
      <Dialog open={!!preview} onOpenChange={(v) => { if (!v) setPreview(null); }}>
        <DialogContent>
          {preview && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  {preview.title}
                  <Badge variant="outline" className="text-[10px]">{KIND_META[preview.kind].label}</Badge>
                  {preview.derived && <Badge variant="secondary" className="text-[10px]">派生副本</Badge>}
                </DialogTitle>
                <DialogDescription>
                  共 {preview.count} 个{KIND_META[preview.kind].unit} · 最近修改 {new Date(preview.updatedAt).toLocaleString()}
                </DialogDescription>
              </DialogHeader>
              {preview.outline.length > 0 && (
                <div className="text-sm space-y-1 max-h-56 overflow-auto">
                  {preview.outline.map((line, i) => (
                    <p key={i} className="truncate text-muted-foreground">· {line}</p>
                  ))}
                  {preview.count > preview.outline.length && (
                    <p className="text-xs text-muted-foreground/70">…还有 {preview.count - preview.outline.length} 个</p>
                  )}
                </div>
              )}
              <DialogFooter>
                <Button variant="outline" onClick={() => setPreview(null)}>关闭</Button>
                <Button
                  onClick={() => {
                    const meta = KIND_META[preview.kind];
                    navigate(`${meta.toolPath}?assetId=${encodeURIComponent(preview.id)}&characterId=${encodeURIComponent(character.id)}`);
                  }}
                >
                  <Wrench className="w-4 h-4 mr-1.5" />
                  处理此资产
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
