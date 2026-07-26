/**
 * 资产库（2.0 阶段9.8）：世界书 / 预设 / 正则 的收藏列表页，类似角色卡库。
 * 首页「其他资产」点进来先看到库（不再直接进处理界面）；点条目 → 对应工具页
 * `?assetId=` 深链打开编辑。删除有确认（被角色引用的删除后在角色页显示「引用已失效」可移除）。
 * 远期：条目在不同世界书之间复制/转移（task_plan 9.8 余项）。
 */
import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Globe, SlidersHorizontal, Regex as RegexIcon, MoreVertical, Trash2, PenSquare, Boxes, Plus } from 'lucide-react';
import { AppLayout } from '@/components/AppLayout';
import { HelpCard } from '@/components/HelpCard';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import type { WorldBookItem } from '@/types/worldbook';
import type { PresetItem } from '@/types/preset';
import type { RegexCollectionItem } from '@/lib/regex-db';
import { getAllWorldBooks, deleteWorldBook } from '@/lib/worldbook-db';
import { getAllPresets, deletePreset } from '@/lib/preset-db';
import { getAllRegexCollections, deleteRegexCollection } from '@/lib/regex-db';
import { getAllCharacters } from '@/lib/archive-db';

type AssetTab = 'worldbook' | 'preset' | 'regex';

const TAB_META: Record<AssetTab, { label: string; icon: typeof Globe; toolPath: string; toolLabel: string }> = {
  worldbook: { label: '世界书', icon: Globe, toolPath: '/worldbook', toolLabel: '世界书工具' },
  preset: { label: '预设', icon: SlidersHorizontal, toolPath: '/preset', toolLabel: '预设工具' },
  regex: { label: '正则', icon: RegexIcon, toolPath: '/regex', toolLabel: '正则工具' },
};

/** 三类资产统一到一行列表项 */
interface AssetRow {
  id: string;
  title: string;
  metaLine: string;
  derived?: boolean;
  autoSaved?: boolean;
  fromST?: boolean;
  updatedAt: number;
}

const AssetLibrary = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = (['worldbook', 'preset', 'regex'].includes(searchParams.get('tab') ?? '')
    ? searchParams.get('tab')
    : 'worldbook') as AssetTab;

  const [worldbooks, setWorldbooks] = useState<WorldBookItem[]>([]);
  const [presets, setPresets] = useState<PresetItem[]>([]);
  const [regexes, setRegexes] = useState<RegexCollectionItem[]>([]);
  /** assetId → 引用它的角色数 */
  const [refCounts, setRefCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [toDelete, setToDelete] = useState<AssetRow | null>(null);

  const load = useCallback(async () => {
    try {
      const [wbs, ps, rs, chars] = await Promise.all([
        getAllWorldBooks().catch(() => [] as WorldBookItem[]),
        getAllPresets().catch(() => [] as PresetItem[]),
        getAllRegexCollections().catch(() => [] as RegexCollectionItem[]),
        getAllCharacters().catch(() => []),
      ]);
      setWorldbooks(wbs);
      setPresets(ps);
      setRegexes(rs);
      const counts: Record<string, number> = {};
      for (const c of chars) {
        for (const ref of c.assets ?? []) counts[ref.assetId] = (counts[ref.assetId] ?? 0) + 1;
      }
      setRefCounts(counts);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const rows: Record<AssetTab, AssetRow[]> = useMemo(() => ({
    worldbook: worldbooks.map((w) => ({
      id: w.id,
      title: w.title,
      metaLine: `${Object.keys(w.worldbook.entries).length} 个条目`,
      derived: !!w.derived,
      autoSaved: w.autoSaved,
      fromST: !!w.sourcePath,
      updatedAt: w.updatedAt,
    })),
    preset: presets.map((p) => ({
      id: p.id,
      title: p.title,
      metaLine: `${p.preset.prompts.length} 个提示词块`,
      derived: !!p.derived,
      autoSaved: p.autoSaved,
      fromST: !!p.sourcePath,
      updatedAt: p.updatedAt,
    })),
    regex: regexes.map((r) => ({
      id: r.id,
      title: r.title,
      metaLine: `${r.rules.length} 条规则`,
      derived: !!r.derived,
      fromST: !!r.sourcePath,
      updatedAt: r.updatedAt,
    })),
  }), [worldbooks, presets, regexes]);

  const handleDelete = async () => {
    if (!toDelete) return;
    try {
      if (tab === 'worldbook') await deleteWorldBook(toDelete.id);
      else if (tab === 'preset') await deletePreset(toDelete.id);
      else await deleteRegexCollection(toDelete.id);
      await load();
      toast({ title: `已删除「${toDelete.title}」` });
    } catch {
      toast({ title: '删除失败', variant: 'destructive' });
    } finally {
      setToDelete(null);
    }
  };

  const meta = TAB_META[tab];
  const openAsset = (id: string) => navigate(`${meta.toolPath}?assetId=${encodeURIComponent(id)}`);
  const list = rows[tab];
  const counts = { worldbook: worldbooks.length, preset: presets.length, regex: regexes.length };

  return (
    <AppLayout
      leftActions={
        <div className="flex items-center gap-2">
          <Boxes className="w-4 h-4 text-primary" />
          <span className="font-display font-semibold">资产库</span>
          <HelpCard>
            世界书、预设、正则规则集的收藏馆。这里入库的资产可以在角色页「关联资产」里被引用；对共享资产的修改会生成派生副本，不影响别的角色。点条目进入对应工具编辑。
          </HelpCard>
        </div>
      }
      actions={
        <Button onClick={() => navigate(meta.toolPath)}>
          <Plus className="w-4 h-4 mr-2" />
          打开{meta.toolLabel}
        </Button>
      }
    >
      <div className="container mx-auto px-4 py-5 max-w-4xl">
        <Tabs value={tab} onValueChange={(v) => setSearchParams({ tab: v }, { replace: true })} className="mb-4">
          <TabsList className="flex w-fit">
            {(Object.keys(TAB_META) as AssetTab[]).map((t) => (
              <TabsTrigger key={t} value={t} className="gap-1.5">
                {TAB_META[t].label}
                <span className="text-xs text-muted-foreground">{counts[t]}</span>
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        {loading ? (
          <p className="py-16 text-center text-sm text-muted-foreground">加载中…</p>
        ) : list.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center gap-3">
            <meta.icon className="w-12 h-12 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">还没有入库的{meta.label}</p>
            <p className="text-xs text-muted-foreground/70">
              在{meta.toolLabel}里导入并保存，或从处理区拖文件进来；客户端也可以「接入 SillyTavern」批量导入
            </p>
            <Button size="sm" onClick={() => navigate(meta.toolPath)}>
              打开{meta.toolLabel}
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            {list.map((a) => (
              <Card
                key={a.id}
                className="cursor-pointer hover:border-primary/40 transition-colors"
                onClick={() => openAsset(a.id)}
              >
                <CardContent className="py-3 px-4 flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-secondary flex items-center justify-center shrink-0">
                    <meta.icon className="w-5 h-5 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <p className="text-sm font-medium truncate">{a.title}</p>
                      {a.derived && <Badge variant="outline" className="h-4 px-1 text-[10px]">派生副本</Badge>}
                      {a.autoSaved && <Badge variant="outline" className="h-4 px-1 text-[10px] text-muted-foreground">自动保留</Badge>}
                      {a.fromST && <Badge variant="secondary" className="h-4 px-1 text-[10px]">来自 ST</Badge>}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {a.metaLine}
                      {(refCounts[a.id] ?? 0) > 0 && ` · ${refCounts[a.id]} 张角色卡引用`}
                      {' · 更新于 '}
                      {new Date(a.updatedAt).toLocaleDateString('zh-CN')}
                    </p>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0 shrink-0" aria-label="更多操作">
                        <MoreVertical className="w-4 h-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                      <DropdownMenuItem onClick={() => openAsset(a.id)}>
                        <PenSquare className="w-3.5 h-3.5 mr-2" />
                        打开编辑
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="text-destructive focus:text-destructive"
                        onClick={() => setToDelete(a)}
                      >
                        <Trash2 className="w-3.5 h-3.5 mr-2" />
                        删除
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      <AlertDialog open={!!toDelete} onOpenChange={(open) => !open && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除「{toDelete?.title}」？</AlertDialogTitle>
            <AlertDialogDescription>
              此操作不可恢复。
              {(toDelete && (refCounts[toDelete.id] ?? 0) > 0)
                ? `该资产被 ${refCounts[toDelete.id]} 张角色卡引用，删除后角色页会显示「引用已失效」并可一键移除。`
                : ''}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>删除</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
};

export default AssetLibrary;
