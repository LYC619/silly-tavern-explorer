/**
 * 角色页左信息栏（10.3a，对照 character-detail.html：272px 固定不滚动）。
 * 立绘 3:4（点击 lightbox 放大）→ 信息行（名称/类型下拉/评分/最后游玩/字数/游玩时长 tooltip）
 * → 「操作」入口 → 右侧抽屉（编辑角色卡/读取内置资源/导出角色卡/删除角色卡）。
 */
import { useMemo, useState } from 'react';
import { BookOpen, Wrench, PenLine, PackageOpen, Download, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import {
  Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger,
} from '@/components/ui/sheet';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import type { ArchiveCharacter, ArchiveStory, CharacterType } from '@/types/archive';
import type { NormalizedCharacterCard } from '@/lib/png-parser';
import { CHARACTER_TYPES } from '@/lib/archive-db';
import { formatPlayTime, formatWordCount } from '@/lib/story-meta';
import { formatListTime, formatFullTime } from '@/lib/time-display';
import { RatingPanel } from '@/components/character/RatingPanel';

interface CharacterInfoRailProps {
  character: ArchiveCharacter;
  norm: NormalizedCharacterCard;
  stories: ArchiveStory[];
  onPatch: (patch: Partial<ArchiveCharacter>) => void;
  onEditCard: () => void;
  onReadEmbedded: () => void;
  onExport: () => void;
  onDelete: () => void;
}

function InfoRow({ label, value, title }: { label: string; value: React.ReactNode; title?: string }) {
  return (
    <div className="flex items-center justify-between gap-2 py-1.5 border-b border-[color:var(--hairline-inner)] last:border-0">
      <span className="text-xs text-[color:var(--text-faint)] shrink-0">{label}</span>
      <span className="text-xs text-[color:var(--text-body)] text-right min-w-0 truncate" title={title}>
        {value}
      </span>
    </div>
  );
}

export function CharacterInfoRail({
  character, norm, stories, onPatch, onEditCard, onReadEmbedded, onExport, onDelete,
}: CharacterInfoRailProps) {
  const [lightbox, setLightbox] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  /** 聚合（10.0 物化字段）：字数=Σ故事、最后游玩=max、时长=Σ playTimeMs */
  const agg = useMemo(() => {
    let words = 0;
    let lastPlayed: number | undefined;
    let playMs = 0;
    let hasPlay = false;
    for (const s of stories) {
      words += s.wordCount ?? 0;
      if (s.lastMessageAt !== undefined && (lastPlayed === undefined || s.lastMessageAt > lastPlayed)) {
        lastPlayed = s.lastMessageAt;
      }
      if (s.meta.playTimeMs !== null) {
        playMs += s.meta.playTimeMs;
        hasPlay = true;
      }
    }
    return { words, lastPlayed, playMs, hasPlay };
  }, [stories]);

  return (
    <aside className="w-[272px] shrink-0 border-r border-[color:var(--hairline-inner)] px-5 py-5 overflow-y-auto scrollbar-thin">
      {/* 立绘 3:4（设计稿），点击放大 */}
      <button
        className="block w-full aspect-[3/4] rounded-xl overflow-hidden bg-elevated border border-[color:var(--border-subtle)]"
        onClick={() => character.pngBase64 && setLightbox(true)}
        aria-label="放大立绘"
      >
        {character.pngBase64 ? (
          <img
            src={`data:image/png;base64,${character.pngBase64}`}
            alt={character.name}
            className="w-full h-full object-cover object-top"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <BookOpen className="w-10 h-10 text-muted-foreground/50" />
          </div>
        )}
      </button>

      {/* 信息行 */}
      <div className="mt-4">
        <InfoRow label="名称" value={character.name} title={character.name} />
        <div className="flex items-center justify-between gap-2 py-1.5 border-b border-[color:var(--hairline-inner)]">
          <span className="text-xs text-[color:var(--text-faint)] shrink-0">类型</span>
          <Select
            value={character.type ?? 'none'}
            onValueChange={(v) => onPatch({ type: v === 'none' ? undefined : (v as CharacterType) })}
          >
            <SelectTrigger className="h-7 w-24 text-xs" title="类型：每张卡只归一类（替代旧版游玩状态）">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">未分类</SelectItem>
              {CHARACTER_TYPES.map((t) => (
                <SelectItem key={t} value={t}>{t}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center justify-between gap-2 py-1.5 border-b border-[color:var(--hairline-inner)]">
          <span className="text-xs text-[color:var(--text-faint)] shrink-0">评分</span>
          <RatingPanel character={character} norm={norm} stories={stories} onPatch={onPatch} />
        </div>
        <InfoRow
          label="最后游玩"
          value={agg.lastPlayed !== undefined ? formatListTime(agg.lastPlayed) : '—'}
          title={agg.lastPlayed !== undefined ? formatFullTime(agg.lastPlayed) : undefined}
        />
        <InfoRow label="字数" value={agg.words > 0 ? formatWordCount(agg.words) : '—'} title="各故事正文字数相加" />
        <InfoRow
          label="游玩时长"
          value={agg.hasPlay ? formatPlayTime({ totalMs: agg.playMs, sessionCount: 0, sampledMessages: 0 }) : '未统计'}
          title="按消息时间戳估算：间隔超过 15 分钟视为离开，不计入时长"
        />
      </div>

      {/* 操作抽屉 */}
      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetTrigger asChild>
          <Button variant="outline" size="sm" className="w-full mt-4 h-8">
            <Wrench className="w-3.5 h-3.5 mr-1.5" />
            操作
          </Button>
        </SheetTrigger>
        <SheetContent side="right" className="w-80">
          <SheetHeader>
            <SheetTitle>角色卡操作</SheetTitle>
            <SheetDescription>对这张卡的文件级操作；整理信息（类型/标签/评分）在页面上直接改。</SheetDescription>
          </SheetHeader>
          <div className="mt-5 flex flex-col gap-2">
            <Button variant="outline" className="justify-start" onClick={() => { setDrawerOpen(false); onEditCard(); }}>
              <PenLine className="w-4 h-4 mr-2" />
              编辑角色卡（进编辑区）
            </Button>
            <Button
              variant="outline"
              className="justify-start"
              title="重新扫描卡内嵌的世界书/正则并入库挂关联"
              onClick={() => { setDrawerOpen(false); onReadEmbedded(); }}
            >
              <PackageOpen className="w-4 h-4 mr-2" />
              读取内置资源
            </Button>
            <Button variant="outline" className="justify-start" onClick={onExport}>
              <Download className="w-4 h-4 mr-2" />
              导出角色卡
            </Button>
            <Button
              variant="outline"
              className="justify-start text-destructive hover:text-destructive"
              onClick={() => { setDrawerOpen(false); onDelete(); }}
            >
              <Trash2 className="w-4 h-4 mr-2" />
              删除角色卡
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      {/* lightbox */}
      <Dialog open={lightbox} onOpenChange={setLightbox}>
        <DialogContent className="max-w-3xl p-2 bg-transparent border-0 shadow-none">
          <DialogTitle className="sr-only">{character.name} 立绘</DialogTitle>
          {character.pngBase64 && (
            <img
              src={`data:image/png;base64,${character.pngBase64}`}
              alt={character.name}
              className="w-full max-h-[85vh] object-contain rounded-lg"
            />
          )}
        </DialogContent>
      </Dialog>
    </aside>
  );
}
