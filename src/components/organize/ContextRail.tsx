/**
 * 整理与记录·右栏（2.0 阶段3，定稿 5.2）：来源与操作。
 * 显示：所属角色/故事/分支、来源楼层范围、生成所用模型/预设/世界书条目/模板、时间。
 * 操作：跳回聊天对应楼层（保留分支）、重新生成、复制为新记录、导出、删除。
 */
import { useEffect, useState } from 'react';
import { CornerUpLeft, RotateCcw, CopyPlus, Upload, Trash2, ImageDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { ArchiveStory } from '@/types/archive';
import type { SummaryItem } from '@/types/summary';
import type { StoryTree } from '@/types/story-tree';
import { SUMMARY_KIND_LABELS } from '@/types/summary';
import { resolveTemplateTitle } from '@/lib/organize-index';
import { getAllPresets } from '@/lib/preset-db';
import { getAllWorldBooks } from '@/lib/worldbook-db';

export type RailSelection =
  | { type: 'record'; item: SummaryItem }
  | { type: 'tree'; tree: StoryTree };

interface ContextRailProps {
  story: ArchiveStory;
  characterName?: string;
  selection: RailSelection;
  /** 跳回聊天对应楼层（branchId=null 主线；保留分支上下文） */
  onJumpToChat: (branchId: string | null, floor: number) => void;
  /** 记录：按 genParams 回填重新生成（故事树无此操作） */
  onRegenerate?: () => void;
  onCopy: () => void;
  onDelete: () => void;
  /** 导出：记录=.md；树=JSON/MD 二选（由父组件实现） */
  onExportMd: () => void;
  onExportJson?: () => void;
  /** 分享长图（阶段6，仅记录类；故事树暂无） */
  onShareImage?: () => void;
}

function fmtTime(ts: number): string {
  return new Date(ts).toLocaleString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  if (value == null || value === '') return null;
  return (
    <div className="text-xs">
      <span className="text-muted-foreground">{label}：</span>
      <span className="break-words">{value}</span>
    </div>
  );
}

export function ContextRail({
  story, characterName, selection, onJumpToChat, onRegenerate, onCopy, onDelete, onExportMd, onExportJson, onShareImage,
}: ContextRailProps) {
  // 预设/世界书 id → 名称（生成参数只存 id；名称查不到时回退 id 片段）
  const [presetNames, setPresetNames] = useState<Map<string, string>>(new Map());
  const [worldbookNames, setWorldbookNames] = useState<Map<string, string>>(new Map());
  useEffect(() => {
    getAllPresets().then((ps) => setPresetNames(new Map(ps.map((p) => [p.id, p.title])))).catch(() => {});
    getAllWorldBooks().then((ws) => setWorldbookNames(new Map(ws.map((w) => [w.id, w.title])))).catch(() => {});
  }, []);

  const isRecord = selection.type === 'record';
  const item = isRecord ? selection.item : null;
  const tree = !isRecord ? selection.tree : null;
  const gp = item?.genParams;

  const branchName = item?.branchId
    ? story.branches?.find((b) => b.id === item.branchId)?.name ?? '（分支已删除）'
    : '主线';
  const treeBranchName = tree?.branchId
    ? story.branches?.find((b) => b.id === tree.branchId)?.name ?? '（分支已删除）'
    : '主线';
  const branchExists = !item?.branchId || story.branches?.some((b) => b.id === item?.branchId);

  const worldbookDetail = gp?.worldbookId
    ? `${worldbookNames.get(gp.worldbookId) ?? gp.worldbookTitle ?? '世界书'}${
        gp.worldbookMode === 'manual'
          ? `（手选 ${gp.worldbookUids?.length ?? 0} 条）`
          : gp.worldbookMode === 'all' ? '（全部条目）' : '（仅常驻）'
      }`
    : undefined;

  return (
    <div className="space-y-3">
      <Card>
        <CardContent className="p-3 space-y-1.5">
          <p className="text-sm font-medium mb-1">来源</p>
          <InfoRow label="角色" value={characterName} />
          <InfoRow label="故事" value={story.title} />
          {isRecord && item && (
            <>
              <InfoRow label="分支" value={branchName} />
              <div className="text-xs">
                <span className="text-muted-foreground">楼层：</span>
                <span>#{item.floorStart}–{item.floorEnd}</span>
              </div>
              <div className="pt-1">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 gap-1 w-full"
                  disabled={!branchExists}
                  onClick={() => onJumpToChat(item.branchId ?? null, item.floorStart)}
                  title={branchExists ? '切到该分支并滚动到起始楼层' : '来源分支已删除，无法跳转'}
                >
                  <CornerUpLeft className="w-3.5 h-3.5" />跳回聊天对应楼层
                </Button>
              </div>
            </>
          )}
          {tree && (
            <>
              <InfoRow label="分支" value={treeBranchName} />
              <InfoRow label="节点" value={`${tree.nodes.length} 个（归档 ${tree.nodes.filter((n) => n.archived).length}）`} />
              <InfoRow label="创建" value={fmtTime(tree.createdAt)} />
              <InfoRow label="修改" value={fmtTime(tree.updatedAt)} />
            </>
          )}
        </CardContent>
      </Card>

      {isRecord && item && (
        <Card>
          <CardContent className="p-3 space-y-1.5">
            <div className="flex items-center gap-1.5 mb-1">
              <p className="text-sm font-medium">生成参数</p>
              {!item.content ? (
                <Badge variant="outline" className="h-4 px-1 text-[10px]">草稿</Badge>
              ) : item.autoSaved ? (
                <Badge variant="outline" className="h-4 px-1 text-[10px]">自动暂存</Badge>
              ) : (
                <Badge variant="secondary" className="h-4 px-1 text-[10px]">永久</Badge>
              )}
            </div>
            {gp ? (
              <>
                <InfoRow label="类型" value={SUMMARY_KIND_LABELS[item.kind]} />
                <InfoRow label="模板" value={resolveTemplateTitle(gp)} />
                <InfoRow label="模型" value={gp.model} />
                <InfoRow label="预设" value={gp.presetId ? presetNames.get(gp.presetId) ?? gp.presetTitle ?? '（已删除）' : undefined} />
                <InfoRow label="世界书" value={worldbookDetail} />
                {gp.diaryOwner && <InfoRow label="日记主角" value={gp.diaryOwner} />}
              </>
            ) : (
              <p className="text-xs text-muted-foreground">无生成参数（手动创建或旧数据）。</p>
            )}
            <InfoRow label="创建" value={fmtTime(item.createdAt)} />
            <InfoRow label="修改" value={fmtTime(item.updatedAt)} />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-3 space-y-1.5">
          <p className="text-sm font-medium mb-1">操作</p>
          {isRecord && onRegenerate && (
            <Button variant="outline" size="sm" className="h-7 gap-1 w-full" onClick={onRegenerate}>
              <RotateCcw className="w-3.5 h-3.5" />重新生成（回填设置）
            </Button>
          )}
          <Button variant="outline" size="sm" className="h-7 gap-1 w-full" onClick={onCopy}>
            <CopyPlus className="w-3.5 h-3.5" />复制为新{isRecord ? '记录' : '树'}
          </Button>
          {onExportJson ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-7 gap-1 w-full">
                  <Upload className="w-3.5 h-3.5" />导出
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={onExportJson}>JSON（可再导入 / 分享）</DropdownMenuItem>
                <DropdownMenuItem onSelect={onExportMd}>Markdown（Obsidian 友好）</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <Button variant="outline" size="sm" className="h-7 gap-1 w-full" onClick={onExportMd}>
              <Upload className="w-3.5 h-3.5" />导出 .md
            </Button>
          )}
          {isRecord && onShareImage && (
            <Button variant="outline" size="sm" className="h-7 gap-1 w-full" onClick={onShareImage} title="生成可直接分享的长图（故事名+封面+正文）">
              <ImageDown className="w-3.5 h-3.5" />生成分享长图
            </Button>
          )}
          <Separator className="my-1" />
          <Button variant="outline" size="sm" className="h-7 gap-1 w-full text-destructive" onClick={onDelete}>
            <Trash2 className="w-3.5 h-3.5" />删除
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
