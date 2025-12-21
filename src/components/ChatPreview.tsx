import { forwardRef, useMemo } from 'react';
import { User, Bot, Bookmark, BookmarkPlus } from 'lucide-react';
import type { ChatSession, ThemeStyle, RegexRule, ChapterMarker } from '@/types/chat';
import { applyRegexRules } from '@/lib/regex-processor';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface ChatPreviewProps {
  session: ChatSession;
  theme: ThemeStyle;
  showTimestamp: boolean;
  showAvatar: boolean;
  fontSize: number;
  regexRules: RegexRule[];
  markers?: ChapterMarker[];
  onMessageClick?: (messageId: string, messageIndex: number) => void;
  editMode?: boolean;
}

export const ChatPreview = forwardRef<HTMLDivElement, ChatPreviewProps>(
  ({ session, theme, showTimestamp, showAvatar, fontSize, regexRules, markers = [], onMessageClick, editMode = false }, ref) => {
    const markerMap = useMemo(() => {
      const map = new Map<string, ChapterMarker>();
      markers.forEach(m => map.set(m.messageId, m));
      return map;
    }, [markers]);
    // 预处理消息，应用正则规则
    const processedMessages = useMemo(() => {
      return session.messages.map(msg => {
        const isUser = msg.role === 'user';
        const processedContent = applyRegexRules(msg.content, regexRules, isUser);
        return { ...msg, content: processedContent };
      }).filter(msg => msg.content.trim()); // 过滤掉空消息
    }, [session.messages, regexRules]);
    const formatTime = (timestamp?: number) => {
      if (!timestamp) return '';
      return new Date(timestamp).toLocaleString('zh-CN', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    };

    const getThemeClasses = () => {
      switch (theme) {
        case 'novel':
          return {
            container: 'paper-bg p-8 font-serif',
            title: 'text-center mb-8 pb-4 border-b-2 border-primary/30',
            message: 'mb-6',
            userBubble: 'text-right',
            charBubble: 'text-left',
            content: 'leading-relaxed',
            name: 'font-display text-primary mb-1',
            separator: 'my-8 flex items-center justify-center gap-4 text-muted-foreground',
          };
        case 'social':
          return {
            container: 'bg-background p-6',
            title: 'text-left mb-6 pb-3 border-b border-border',
            message: 'mb-4 flex gap-3',
            userBubble: 'flex-row-reverse',
            charBubble: 'flex-row',
            content: 'rounded-2xl px-4 py-2.5 max-w-[80%]',
            name: 'text-xs text-muted-foreground mb-1',
            separator: 'hidden',
          };
        case 'minimal':
          return {
            container: 'bg-background p-8',
            title: 'mb-8 pb-2 border-b border-border',
            message: 'mb-4 py-2',
            userBubble: 'border-l-2 border-primary pl-4',
            charBubble: 'border-l-2 border-muted-foreground/30 pl-4',
            content: '',
            name: 'font-medium text-sm mb-1',
            separator: 'hidden',
          };
        case 'elegant':
        default:
          return {
            container: 'paper-bg p-10 decorative-border',
            title: 'text-center mb-10 space-y-2',
            message: 'mb-8',
            userBubble: 'text-right',
            charBubble: 'text-left',
            content: 'leading-loose tracking-wide',
            name: 'font-display text-lg text-primary/80 mb-2',
            separator: 'my-10 flex items-center justify-center',
          };
      }
    };

    const classes = getThemeClasses();

    return (
      <div
        ref={ref}
        className={`min-h-[400px] ${classes.container}`}
        style={{ fontSize: `${fontSize}px` }}
      >
        {/* Title */}
        <div className={classes.title}>
          {theme === 'elegant' ? (
            <>
              <div className="text-xs text-muted-foreground tracking-widest uppercase">
                对话记录
              </div>
              <h2 className="font-display text-2xl text-gradient">{session.title}</h2>
              <div className="text-sm text-muted-foreground">
                {session.character.name} & {session.user.name}
              </div>
            </>
          ) : (
            <h2 className="font-display text-xl">{session.title}</h2>
          )}
        </div>

        {/* Messages */}
        <TooltipProvider>
          <div className="space-y-1">
            {processedMessages.map((message, index) => {
              const isUser = message.role === 'user';
              const isNewSpeaker = index === 0 || 
                processedMessages[index - 1].role !== message.role;
              const marker = markerMap.get(message.id);
              const hasMarker = !!marker;

              return (
                <div key={message.id}>
                  {/* Chapter marker display */}
                  {hasMarker && (
                    <div className="my-6 py-4 border-y border-primary/30 bg-primary/5 text-center">
                      {marker.volume && (
                        <div className="text-xs text-muted-foreground tracking-widest uppercase mb-1">
                          {marker.volume}
                        </div>
                      )}
                      <div className="font-display text-lg text-primary">
                        {marker.title}
                      </div>
                      {marker.summary && (
                        <div className="text-sm text-muted-foreground mt-2 max-w-md mx-auto">
                          {marker.summary}
                        </div>
                      )}
                    </div>
                  )}

                  {theme === 'novel' && isNewSpeaker && index > 0 && !hasMarker && (
                    <div className={classes.separator}>
                      <span className="text-2xl">❧</span>
                    </div>
                  )}
                  
                  {theme === 'elegant' && isNewSpeaker && index > 0 && !hasMarker && (
                    <div className={classes.separator}>
                      <div className="w-16 h-px bg-border" />
                      <span className="text-muted-foreground">✦</span>
                      <div className="w-16 h-px bg-border" />
                    </div>
                  )}

                  <div 
                    className={`${classes.message} ${isUser ? classes.userBubble : classes.charBubble} animate-fade-in group relative ${
                      editMode ? 'cursor-pointer hover:bg-primary/5 rounded-lg transition-colors' : ''
                    }`}
                    onClick={() => editMode && onMessageClick?.(message.id, index)}
                  >
                    {/* Floor number & edit mode indicator */}
                    {editMode && (
                      <div className="absolute -left-12 top-1/2 -translate-y-1/2 flex items-center gap-1">
                        <span className="text-xs text-muted-foreground font-mono opacity-50 group-hover:opacity-100">
                          #{index + 1}
                        </span>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div className={`opacity-0 group-hover:opacity-100 transition-opacity ${
                              hasMarker ? 'text-primary' : 'text-muted-foreground'
                            }`}>
                              {hasMarker ? (
                                <Bookmark className="w-4 h-4 fill-primary" />
                              ) : (
                                <BookmarkPlus className="w-4 h-4" />
                              )}
                            </div>
                          </TooltipTrigger>
                          <TooltipContent side="left">
                            {hasMarker ? '编辑章节标记' : '添加章节标记'}
                          </TooltipContent>
                        </Tooltip>
                      </div>
                    )}
                    {theme === 'social' ? (
                    <>
                      {showAvatar && (
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
                          isUser ? 'bubble-user' : 'bubble-char'
                        }`}>
                          {isUser ? <User className="w-5 h-5" /> : <Bot className="w-5 h-5" />}
                        </div>
                      )}
                      <div className={isUser ? 'text-right' : 'text-left'}>
                        {isNewSpeaker && (
                          <div className={classes.name}>
                            {message.name || (isUser ? session.user.name : session.character.name)}
                          </div>
                        )}
                        <div className={`inline-block ${classes.content} ${
                          isUser ? 'bubble-user' : 'bubble-char'
                        } whitespace-pre-wrap`}>
                          {message.content}
                        </div>
                        {showTimestamp && (
                          <div className="text-xs text-muted-foreground mt-1">
                            {formatTime(message.timestamp)}
                          </div>
                        )}
                      </div>
                    </>
                  ) : (
                    <div>
                      {isNewSpeaker && (
                        <div className={classes.name}>
                          {message.name || (isUser ? session.user.name : session.character.name)}
                          {showTimestamp && theme === 'minimal' && (
                            <span className="text-muted-foreground font-normal ml-2">
                              {formatTime(message.timestamp)}
                            </span>
                          )}
                        </div>
                      )}
                      <div className={`${classes.content} whitespace-pre-wrap`}>
                        {theme === 'novel' || theme === 'elegant' ? (
                          <span className="text-muted-foreground mr-2">"</span>
                        ) : null}
                        {message.content}
                        {theme === 'novel' || theme === 'elegant' ? (
                          <span className="text-muted-foreground ml-1">"</span>
                        ) : null}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
          </div>
        </TooltipProvider>

        {/* Footer for elegant theme */}
        {theme === 'elegant' && (
          <div className="mt-12 pt-6 border-t border-border text-center text-sm text-muted-foreground">
            <div className="mb-2">— 完 —</div>
            <div className="text-xs">
              共 {processedMessages.length} 条消息
            </div>
          </div>
        )}
      </div>
    );
  }
);

ChatPreview.displayName = 'ChatPreview';
