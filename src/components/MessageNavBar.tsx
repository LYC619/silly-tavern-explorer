import { useState, useEffect } from 'react';
import { ChevronUp, ChevronDown, Star, Bookmark } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

/** 收藏楼层在列表里展示用的信息（由父组件按 messageId 解析好传入） */
export interface FavoriteItem {
  messageId: string;
  /** 1-based 楼层号；解析不到时为 null */
  floor: number | null;
  /** 正文片段，帮用户辨认这条书签 */
  snippet: string;
}

interface MessageNavBarProps {
  /** 过滤空消息后的总楼层数 */
  floorCount: number;
  /** 当前顶部可见楼层（1-based） */
  currentFloor: number;
  /** 当前顶部楼层的 messageId，用于判断是否已收藏 */
  currentMessageId: string | null;
  favorites: FavoriteItem[];
  onJumpToFloor: (floor: number) => void;
  onPrev: () => void;
  onNext: () => void;
  onToggleFavorite: (messageId: string) => void;
  onJumpToMessageId: (messageId: string) => void;
}

/**
 * 左侧悬浮竖向跳转条（fixed，不随整页滚动消失、不压缩主阅读区）：
 * - 上/下一层
 * - 楼层号输入跳转 + 当前楼/总楼
 * - 收藏/取消当前顶部楼层（轻量书签，不进导出）
 * - 收藏列表 popover，点一条跳过去
 */
export function MessageNavBar({
  floorCount,
  currentFloor,
  currentMessageId,
  favorites,
  onJumpToFloor,
  onPrev,
  onNext,
  onToggleFavorite,
  onJumpToMessageId,
}: MessageNavBarProps) {
  const [floorInput, setFloorInput] = useState(String(currentFloor));
  const [editing, setEditing] = useState(false);

  // 滚动导致当前楼层变化时同步输入框（用户正在输入时不抢）
  useEffect(() => {
    if (!editing) setFloorInput(String(currentFloor));
  }, [currentFloor, editing]);

  const isCurrentFavorited = !!currentMessageId && favorites.some(f => f.messageId === currentMessageId);

  const commitJump = () => {
    const n = parseInt(floorInput, 10);
    if (!Number.isNaN(n) && floorCount > 0) {
      const clamped = Math.min(Math.max(n, 1), floorCount);
      onJumpToFloor(clamped);
      setFloorInput(String(clamped));
    } else {
      setFloorInput(String(currentFloor));
    }
    setEditing(false);
  };

  return (
    <TooltipProvider>
      <div className="fixed left-24 top-1/2 z-30 -translate-y-1/2 flex flex-col items-center gap-1.5 rounded-xl border border-border bg-card/90 px-1.5 py-2 shadow-md backdrop-blur-sm">
        {/* 上一层 */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onPrev} disabled={currentFloor <= 1}>
              <ChevronUp className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="right">上一层</TooltipContent>
        </Tooltip>

        {/* 楼层号输入 + 当前/总楼 */}
        <div className="flex flex-col items-center gap-0.5">
          <Input
            value={floorInput}
            onChange={(e) => { setEditing(true); setFloorInput(e.target.value.replace(/[^0-9]/g, '')); }}
            onFocus={() => setEditing(true)}
            onBlur={commitJump}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.currentTarget.blur(); } }}
            className="h-7 w-11 px-1 text-center text-xs"
            inputMode="numeric"
            aria-label="跳转到楼层"
          />
          <span className="text-[10px] leading-none text-muted-foreground">/ {floorCount}</span>
        </div>

        {/* 下一层 */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onNext} disabled={currentFloor >= floorCount}>
              <ChevronDown className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="right">下一层</TooltipContent>
        </Tooltip>

        <div className="my-0.5 h-px w-6 bg-border" />

        {/* 收藏当前顶部楼层 */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              disabled={!currentMessageId}
              onClick={() => currentMessageId && onToggleFavorite(currentMessageId)}
            >
              <Star className={`h-4 w-4 ${isCurrentFavorited ? 'fill-primary text-primary' : ''}`} />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="right">{isCurrentFavorited ? '取消收藏当前楼层' : '收藏当前楼层'}</TooltipContent>
        </Tooltip>

        {/* 收藏列表 */}
        <Popover>
          <Tooltip>
            <TooltipTrigger asChild>
              <PopoverTrigger asChild>
                <Button variant="ghost" size="icon" className="relative h-8 w-8">
                  <Bookmark className="h-4 w-4" />
                  {favorites.length > 0 && (
                    <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[9px] font-medium text-primary-foreground">
                      {favorites.length}
                    </span>
                  )}
                </Button>
              </PopoverTrigger>
            </TooltipTrigger>
            <TooltipContent side="right">收藏列表</TooltipContent>
          </Tooltip>
          <PopoverContent side="right" align="center" className="w-72 p-0">
            {favorites.length === 0 ? (
              <div className="px-4 py-6 text-center text-sm text-muted-foreground">
                还没有收藏的楼层<br />
                <span className="text-xs">用上方星标收藏当前楼层</span>
              </div>
            ) : (
              <ScrollArea className="max-h-72">
                <div className="py-1">
                  {favorites.map((f) => (
                    <button
                      key={f.messageId}
                      type="button"
                      onClick={() => onJumpToMessageId(f.messageId)}
                      className="flex w-full items-start gap-2 px-3 py-2 text-left hover:bg-accent transition-colors"
                    >
                      <span className="mt-0.5 shrink-0 font-mono text-xs text-primary">
                        {f.floor !== null ? `#${f.floor}` : '—'}
                      </span>
                      <span className="line-clamp-2 text-xs text-muted-foreground">{f.snippet}</span>
                    </button>
                  ))}
                </div>
              </ScrollArea>
            )}
          </PopoverContent>
        </Popover>
      </div>
    </TooltipProvider>
  );
}
