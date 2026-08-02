/**
 * 角色页故事列表（10.3b，对照 character-detail.html）：
 * 每行 = 名称·N楼·相对时间 / ☆评分（行内 popover 0.5 步进）+ 字数 / 状态 chip（四档可改）
 * / 三按钮 阅读·处理·导出；分支从父故事行下用连线分出，点分支直接就地阅读该分支。
 * 当前就地阅读中的故事左侧高亮条。
 */
import { useState } from 'react';
import { BookOpen, Download, GitBranch, Settings2, Star, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Slider } from '@/components/ui/slider';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import type { ArchiveStory, StoryStatus } from '@/types/archive';
import { STORY_STATUSES } from '@/lib/archive-db';
import { formatWordCount } from '@/lib/story-meta';
import { formatListTime, formatFullTime } from '@/lib/time-display';

interface StoryListSectionProps {
  stories: ArchiveStory[];
  /** 正在就地阅读的故事（高亮条） */
  activeStoryId?: string | null;
  onRead: (id: string, branchId?: string) => void;
  /** 处理：进故事工作区（编辑器） */
  onProcess: (id: string) => void;
  /** 导出：进工作区「导入与导出」界面 */
  onExport: (id: string) => void;
  onDelete: (story: ArchiveStory) => void;
  onPatchStory: (id: string, patch: Partial<ArchiveStory>) => void;
}

/** 行内评分 popover：0-10 分、0.5 步进；可清除 */
function RatingPopover({ story, onPatch }: { story: ArchiveStory; onPatch: (patch: Partial<ArchiveStory>) => void }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(story.rating ?? 7);
  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (o) setDraft(story.rating ?? 7); }}>
      <PopoverTrigger asChild>
        <button
          className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground transition-colors shrink-0"
          onClick={(e) => e.stopPropagation()}
          title="故事评分（0.5 步进）"
        >
          <Star className={cn('w-3.5 h-3.5', story.rating !== undefined && 'fill-amber-400 text-amber-400')} />
          {story.rating !== undefined ? story.rating : '未评分'}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-56" onClick={(e) => e.stopPropagation()}>
        <div className="space-y-3">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium">故事评分</span>
            <span className="text-primary font-semibold">{draft}</span>
          </div>
          <Slider value={[draft]} onValueChange={([v]) => setDraft(v)} min={0} max={10} step={0.5} />
          <div className="flex justify-end gap-2">
            {story.rating !== undefined && (
              <Button variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground" onClick={() => { onPatch({ rating: undefined }); setOpen(false); }}>
                清除
              </Button>
            )}
            <Button size="sm" className="h-7 text-xs" onClick={() => { onPatch({ rating: draft }); setOpen(false); }}>
              确定
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

/** 状态 chip：点击换四档 */
function StatusChip({ story, onPatch }: { story: ArchiveStory; onPatch: (patch: Partial<ArchiveStory>) => void }) {
  const status = story.status ?? '未开始';
  const tone: Record<StoryStatus, string> = {
    未开始: 'text-muted-foreground',
    进行中: 'text-sky-600 dark:text-sky-400 border-sky-500/40',
    已完结: 'text-emerald-600 dark:text-emerald-400 border-emerald-500/40',
    已搁置: 'text-amber-600 dark:text-amber-400 border-amber-500/40',
  };
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button onClick={(e) => e.stopPropagation()} title="点击修改故事状态" className="shrink-0">
          <Badge variant="outline" className={cn('h-5 px-1.5 text-[10px] font-normal cursor-pointer hover:bg-accent', tone[status])}>
            {status}
          </Badge>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" onClick={(e) => e.stopPropagation()}>
        {STORY_STATUSES.map((s) => (
          <DropdownMenuItem key={s} className={s === status ? 'bg-primary/10 text-primary' : ''} onClick={() => onPatch({ status: s })}>
            {s}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function StoryListSection({
  stories, activeStoryId, onRead, onProcess, onExport, onDelete, onPatchStory,
}: StoryListSectionProps) {
  return (
    <div className="space-y-2">
      {stories.map((story) => {
        const msgCount = story.session.messages.length;
        const active = story.id === activeStoryId;
        return (
          <div key={story.id}>
            <div
              className={cn(
                'group relative rounded-lg border border-border bg-card hover:shadow-warm transition-all cursor-pointer',
                active && 'border-primary/50',
              )}
              onClick={() => onRead(story.id)}
            >
              {/* 当前故事高亮条 */}
              {active && <div className="absolute left-0 top-2 bottom-2 w-0.5 rounded-full bg-primary" />}
              <div className="py-3 px-4 flex items-center gap-3 flex-wrap">
                <div className="flex-1 min-w-48">
                  <p className="font-medium text-sm flex items-center gap-2 min-w-0">
                    <span className="truncate" title={story.title}>{story.title}</span>
                    <StatusChip story={story} onPatch={(p) => onPatchStory(story.id, p)} />
                  </p>
                  <p className="text-xs text-muted-foreground flex items-center gap-3 flex-wrap mt-0.5">
                    <span>{msgCount} 段聊天</span>
                    {story.wordCount !== undefined && <span>{formatWordCount(story.wordCount)}</span>}
                    <RatingPopover story={story} onPatch={(p) => onPatchStory(story.id, p)} />
                    <span title={story.lastViewedAt ? formatFullTime(story.lastViewedAt) : undefined}>
                      {story.lastViewedAt ? `${formatListTime(story.lastViewedAt)}看过` : '未读'}
                    </span>
                  </p>
                </div>
                {/* 三按钮：阅读 · 处理 · 导出（+hover 删除） */}
                <div className="flex items-center gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                  <Button variant="outline" size="sm" className="h-7 px-2.5 text-xs" onClick={() => onRead(story.id)}>
                    <BookOpen className="w-3.5 h-3.5 mr-1" />
                    阅读
                  </Button>
                  <Button variant="outline" size="sm" className="h-7 px-2.5 text-xs" onClick={() => onProcess(story.id)} title="进入故事工作区（编辑器）">
                    <Settings2 className="w-3.5 h-3.5 mr-1" />
                    处理
                  </Button>
                  <Button variant="outline" size="sm" className="h-7 px-2.5 text-xs" onClick={() => onExport(story.id)} title="进入工作区「导入与导出」">
                    <Download className="w-3.5 h-3.5 mr-1" />
                    导出
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 opacity-0 group-hover:opacity-100 text-destructive"
                    onClick={() => onDelete(story)}
                    aria-label="删除故事"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            </div>

            {/* 分支：从父故事行下用线分出（左缩进+连线），点击就地阅读该分支 */}
            {(story.branches ?? []).length > 0 && (
              <div className="ml-6 border-l border-border/70">
                {story.branches!.map((b) => (
                  <button
                    key={b.id}
                    className="w-full flex items-center gap-2 text-left pl-0 pr-2 py-1 group/branch"
                    onClick={() => onRead(story.id, b.id)}
                    title={`阅读分支「${b.name}」`}
                  >
                    <span className="w-4 border-t border-border/70 shrink-0" />
                    <GitBranch className="w-3 h-3 shrink-0 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground group-hover/branch:text-foreground transition-colors truncate">
                      {b.name}
                    </span>
                    <span className="text-[10px] text-muted-foreground/60 shrink-0">{b.session.messages.length} 段</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
