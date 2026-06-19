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
 * 预览区顶部常驻跳转条：
 * - 输入楼层号跳转 + 上/下一层
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

  // 滚动导致当前楼层变化时，同步输入框（用户正在输入时不抢）
  const [editing, setEditing] = useState(false);
  useEffect(() => {
    if (!editing) setFloorInput(String(currentFloor));
  }, [currentFloor, editing]);

  const isCurrentFavorited = !!currentMessageId && favorites.some(f => f.messageId === currentMessageId);

  const commitJump = () => {
    const n = parseInt(floorInput, 10);
    if (!Number.isNaN(n)) {
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
      <div className="flex items-center gap-2 rounded-lg border border-border bg-card/60 px-3 py-2 text-sm">
        {/* 上/下一层 */}
        <div className="flex items-center gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onPrev} disabled={currentFloor <= 1}>
                <ChevronUp className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>上一层</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onNext} disabled={currentFloor >= floorCount}>
                <ChevronDown className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>下一层</TooltipContent>
          </Tooltip>
        </div>

        {/* 楼层号输入跳转 */}
        <div className="flex items-center gap-1 text-muted-foreground">
          <span>#</span>
          <Input
            value={floorInput}
            onChange={(e) => { setEditing(true); setFloorInput(e.target.value.replace(/[^0-9]/g, '')); }}
            onFocus={() => setEditing(true)}
            onBlur={commitJump}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.currentTarget.blur(); } }}
            className="h-7 w-14 text-center px-1"
            inputMode="numeric"
            aria-label="跳转到楼层"
          />
          <span className="whitespace-nowrap">/ {floorCount}</span>
        </div>

        {/* 收藏当前顶部楼层 */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              disabled={!currentMessageId}
              onClick={() => currentMessageId && onToggleFavorite(currentMessageId)}
            >
              <Star className={`h-4 w-4 ${isCurrentFavorited ? 'fill-primary text-primary' : ''}`} />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{isCurrentFavorited ? '取消收藏当前楼层' : '收藏当前楼层'}</TooltipContent>
        </Tooltip>

        <div className="flex-1" />

        {/* 收藏列表 */}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="sm" className="h-7 gap-1.5">
              <Bookmark className="h-4 w-4" />
              <span>收藏 {favorites.length > 0 ? `(${favorites.length})` : ''}</span>
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-72 p-0">
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
