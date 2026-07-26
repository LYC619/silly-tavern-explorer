/**
 * 故事工作区左栏·章节目录 + 书签（当前脉络的，点击跳转到对应楼层）。
 */
import { useMemo } from 'react';
import { Bookmark, BookMarked } from 'lucide-react';
import type { ChatSession, ChapterMarker } from '@/types/chat';

interface OutlinePanelProps {
  session: ChatSession;
  markers: ChapterMarker[];
  favorites: string[];
  onJump: (messageId: string) => void;
}

export function OutlinePanel({ session, markers, favorites, onJump }: OutlinePanelProps) {
  const sortedMarkers = useMemo(
    () => [...markers].sort((a, b) => a.messageIndex - b.messageIndex),
    [markers],
  );

  const favoriteItems = useMemo(() => {
    const byId = new Map(session.messages.map((m, i) => [m.id, { msg: m, index: i }]));
    return favorites
      .map((id) => {
        const hit = byId.get(id);
        if (!hit) return null;
        const snippet = hit.msg.content.replace(/\s+/g, ' ').trim().slice(0, 24) || '（空消息）';
        return { messageId: id, index: hit.index, snippet };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null)
      .sort((a, b) => a.index - b.index);
  }, [favorites, session]);

  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs font-medium text-muted-foreground px-2 mb-1">章节目录</p>
        {sortedMarkers.length === 0 ? (
          <p className="px-2 text-xs text-muted-foreground/70">
            还没有章节。用工具条「章节标记」在楼层上落标。
          </p>
        ) : (
          <div className="space-y-0.5">
            {sortedMarkers.map((m) => (
              <button
                key={m.messageId}
                onClick={() => onJump(m.messageId)}
                className="w-full flex items-center gap-1.5 rounded-md px-2 py-1 text-left text-sm hover:bg-accent/60 transition-colors"
              >
                <BookMarked className="w-3.5 h-3.5 shrink-0 text-primary/60" />
                <span className="flex-1 min-w-0 truncate">
                  {m.volume ? `${m.volume} · ` : ''}{m.title}
                </span>
                <span className="text-xs text-muted-foreground shrink-0">#{m.messageIndex}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div>
        <p className="text-xs font-medium text-muted-foreground px-2 mb-1">书签</p>
        {favoriteItems.length === 0 ? (
          <p className="px-2 text-xs text-muted-foreground/70">
            还没有书签。悬停左侧跳转条上的楼层可收藏。
          </p>
        ) : (
          <div className="space-y-0.5">
            {favoriteItems.map((f) => (
              <button
                key={f.messageId}
                onClick={() => onJump(f.messageId)}
                className="w-full flex items-center gap-1.5 rounded-md px-2 py-1 text-left text-sm hover:bg-accent/60 transition-colors"
              >
                <Bookmark className="w-3.5 h-3.5 shrink-0 text-amber-500/70" />
                <span className="flex-1 min-w-0 truncate text-foreground/80">{f.snippet}</span>
                <span className="text-xs text-muted-foreground shrink-0">#{f.index}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
