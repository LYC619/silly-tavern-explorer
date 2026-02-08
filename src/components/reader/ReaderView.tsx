import { useState, useEffect, useCallback, useRef } from 'react';
import { ChevronLeft, ChevronRight, X, Settings, BookOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import type { ChatMessage, ChapterMarker, RegexRule } from '@/types/chat';
import { applyRegexRules } from '@/lib/regex-processor';

interface ReaderViewProps {
  messages: ChatMessage[];
  markers: ChapterMarker[];
  regexRules: RegexRule[];
  characterName: string;
  userName: string;
  onClose: () => void;
}

interface PageContent {
  messageIndex: number;
  content: string;
  speaker: string;
  isUser: boolean;
  chapterTitle?: string;
}

const ReaderView = ({
  messages,
  markers,
  regexRules,
  characterName,
  userName,
  onClose,
}: ReaderViewProps) => {
  const [currentPage, setCurrentPage] = useState(0);
  const [pages, setPages] = useState<PageContent[]>([]);
  const [fontSize, setFontSize] = useState(18);
  const [showControls, setShowControls] = useState(true);
  const [isAnimating, setIsAnimating] = useState(false);
  const [slideDirection, setSlideDirection] = useState<'left' | 'right' | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const touchStartX = useRef(0);
  const touchEndX = useRef(0);

  // Build pages from messages
  useEffect(() => {
    const processedPages: PageContent[] = [];
    
    messages.forEach((msg, idx) => {
      if (msg.role === 'system') return;
      
      const cleanContent = applyRegexRules(msg.content, regexRules, msg.role === 'user');
      if (!cleanContent.trim()) return;

      // Check if this message has a chapter marker
      const marker = markers.find(m => m.messageIndex === idx);
      
      processedPages.push({
        messageIndex: idx,
        content: cleanContent,
        speaker: msg.role === 'user' ? userName : characterName,
        isUser: msg.role === 'user',
        chapterTitle: marker ? `${marker.volume ? marker.volume + ' · ' : ''}${marker.title}` : undefined,
      });
    });

    setPages(processedPages);
  }, [messages, markers, regexRules, characterName, userName]);

  // Navigation
  const goToPage = useCallback((page: number, direction: 'left' | 'right') => {
    if (page < 0 || page >= pages.length || isAnimating) return;
    
    setIsAnimating(true);
    setSlideDirection(direction);
    
    setTimeout(() => {
      setCurrentPage(page);
      setSlideDirection(null);
      setIsAnimating(false);
    }, 200);
  }, [pages.length, isAnimating]);

  const nextPage = useCallback(() => {
    if (currentPage < pages.length - 1) {
      goToPage(currentPage + 1, 'left');
    }
  }, [currentPage, pages.length, goToPage]);

  const prevPage = useCallback(() => {
    if (currentPage > 0) {
      goToPage(currentPage - 1, 'right');
    }
  }, [currentPage, goToPage]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === ' ') {
        e.preventDefault();
        nextPage();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        prevPage();
      } else if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [nextPage, prevPage, onClose]);

  // Touch navigation for mobile
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    touchEndX.current = e.touches[0].clientX;
  };

  const handleTouchEnd = () => {
    const diff = touchStartX.current - touchEndX.current;
    const threshold = 50;

    if (Math.abs(diff) > threshold) {
      if (diff > 0) {
        nextPage();
      } else {
        prevPage();
      }
    }
  };

  // Click to toggle controls / navigate
  const handleClick = (e: React.MouseEvent) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;

    const x = e.clientX - rect.left;
    const width = rect.width;

    // Left 1/3: prev, Right 1/3: next, Center: toggle controls
    if (x < width / 3) {
      prevPage();
    } else if (x > (width * 2) / 3) {
      nextPage();
    } else {
      setShowControls(!showControls);
    }
  };

  const currentContent = pages[currentPage];
  const progress = pages.length > 0 ? ((currentPage + 1) / pages.length) * 100 : 0;

  if (pages.length === 0) {
    return (
      <div className="fixed inset-0 z-50 bg-background flex items-center justify-center">
        <div className="text-center">
          <BookOpen className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
          <p className="text-muted-foreground">没有可阅读的内容</p>
          <Button onClick={onClose} className="mt-4">返回</Button>
        </div>
      </div>
    );
  }

  return (
    <div 
      ref={containerRef}
      className="fixed inset-0 z-50 bg-[#f8f5ec] dark:bg-[#1a1a1a] select-none overflow-hidden"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onClick={handleClick}
    >
      {/* Top controls */}
      <div 
        className={cn(
          "absolute top-0 left-0 right-0 z-10 bg-gradient-to-b from-black/30 to-transparent transition-opacity duration-300",
          showControls ? "opacity-100" : "opacity-0 pointer-events-none"
        )}
      >
        <div className="flex items-center justify-between p-4">
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={(e) => { e.stopPropagation(); onClose(); }}
            className="text-white hover:bg-white/20"
          >
            <X className="w-5 h-5" />
          </Button>

          <div className="text-white text-sm font-medium">
            {currentPage + 1} / {pages.length}
          </div>

          <Popover>
            <PopoverTrigger asChild>
              <Button 
                variant="ghost" 
                size="icon"
                onClick={(e) => e.stopPropagation()}
                className="text-white hover:bg-white/20"
              >
                <Settings className="w-5 h-5" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-64" onClick={(e) => e.stopPropagation()}>
              <div className="space-y-4">
                <div>
                  <div className="text-sm font-medium mb-2">字体大小</div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-muted-foreground">小</span>
                    <Slider
                      value={[fontSize]}
                      onValueChange={([v]) => setFontSize(v)}
                      min={14}
                      max={28}
                      step={2}
                      className="flex-1"
                    />
                    <span className="text-xs text-muted-foreground">大</span>
                  </div>
                </div>
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {/* Main content */}
      <div className="absolute inset-0 flex items-center justify-center overflow-hidden safe-area-inset">
        <div 
          className={cn(
            "w-full h-full max-w-3xl px-4 sm:px-6 md:px-12 py-16 sm:py-20 overflow-y-auto transition-transform duration-200 ease-out",
            slideDirection === 'left' && "translate-x-[-100%]",
            slideDirection === 'right' && "translate-x-[100%]"
          )}
        >
          {/* Chapter title */}
          {currentContent?.chapterTitle && (
            <div className="text-center mb-6 sm:mb-8">
              <h2 className="font-display text-lg sm:text-xl md:text-2xl text-primary/80 dark:text-primary-foreground/80 font-semibold">
                {currentContent.chapterTitle}
              </h2>
              <div className="w-16 sm:w-20 h-0.5 bg-primary/30 mx-auto mt-2 sm:mt-3" />
            </div>
          )}

          {/* Speaker */}
          <div className="mb-3 sm:mb-4">
            <span 
              className={cn(
                "inline-block px-2 sm:px-3 py-0.5 sm:py-1 rounded-full text-xs sm:text-sm font-medium",
                currentContent?.isUser 
                  ? "bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-200"
                  : "bg-rose-100 text-rose-800 dark:bg-rose-900/50 dark:text-rose-200"
              )}
            >
              {currentContent?.speaker}
            </span>
          </div>

          {/* Message content */}
          <div 
            className="text-foreground/90 leading-relaxed whitespace-pre-wrap pb-8"
            style={{ fontSize: `${fontSize}px`, lineHeight: 1.8 }}
          >
            {currentContent?.content}
          </div>
        </div>
      </div>

      {/* Navigation hints - hidden on mobile for cleaner look */}
      <div 
        className={cn(
          "absolute left-2 sm:left-4 top-1/2 -translate-y-1/2 transition-opacity duration-300 hidden sm:block",
          showControls ? "opacity-50" : "opacity-0"
        )}
      >
        <ChevronLeft className="w-6 sm:w-8 h-6 sm:h-8 text-muted-foreground" />
      </div>
      <div 
        className={cn(
          "absolute right-2 sm:right-4 top-1/2 -translate-y-1/2 transition-opacity duration-300 hidden sm:block",
          showControls ? "opacity-50" : "opacity-0"
        )}
      >
        <ChevronRight className="w-6 sm:w-8 h-6 sm:h-8 text-muted-foreground" />
      </div>

      {/* Bottom progress */}
      <div 
        className={cn(
          "absolute bottom-0 left-0 right-0 z-10 bg-gradient-to-t from-black/30 to-transparent transition-opacity duration-300 pb-safe",
          showControls ? "opacity-100" : "opacity-0 pointer-events-none"
        )}
      >
        <div className="p-3 sm:p-4 pt-6 sm:pt-8">
          {/* Progress bar */}
          <div className="h-1 bg-white/20 rounded-full overflow-hidden mb-2">
            <div 
              className="h-full bg-white/80 transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="text-center text-white/60 text-[10px] sm:text-xs">
            <span className="hidden sm:inline">点击屏幕左右两侧翻页，中间区域显示/隐藏控制栏</span>
            <span className="sm:hidden">左右滑动或点击翻页</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ReaderView;
