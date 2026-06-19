import { forwardRef, useMemo, useState, useEffect } from 'react';
import { User, Bot, Bookmark, BookmarkPlus } from 'lucide-react';
import type { ChatSession, ThemeStyle, RegexRule, ChapterMarker } from '@/types/chat';
import { applyRegexRules, parseRegex } from '@/lib/regex-processor';
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
  fontFamily?: string;
  /** 正在预览的规则：命中的内容会在正文中用红色删除线高亮标出（所见即所得） */
  previewRule?: RegexRule | null;
}

/**
 * 把一段文本按某条规则的匹配位置切分渲染：命中部分用红色删除线、替换内容用绿色标出。
 * 用于主界面原地预览正则效果，替代侧边栏的小框对比。
 */
function renderPreviewHighlight(content: string, rule: RegexRule): React.ReactNode {
  const regex = parseRegex(rule.findRegex);
  if (!regex) return content;
  const g = regex.flags.includes('g') ? regex : new RegExp(regex.source, regex.flags + 'g');
  g.lastIndex = 0;
  const nodes: React.ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  let key = 0;
  let count = 0;
  while ((m = g.exec(content)) !== null && count < 2000) {
    count++;
    if (m.index > last) nodes.push(content.slice(last, m.index));
    const matched = m[0];
    if (matched.length === 0) { g.lastIndex++; continue; }
    nodes.push(
      <span key={`d${key}`} className="bg-red-100 dark:bg-red-950/40 text-red-600 dark:text-red-400 line-through rounded-sm px-0.5">
        {matched}
      </span>
    );
    if (rule.replaceString) {
      nodes.push(
        <span key={`r${key}`} className="bg-green-100 dark:bg-green-950/40 text-green-700 dark:text-green-400 rounded-sm px-0.5">
          {rule.replaceString}
        </span>
      );
    }
    last = m.index + matched.length;
    key++;
  }
  if (last < content.length) nodes.push(content.slice(last));
  return nodes.length > 0 ? nodes : content;
}

/**
 * 把一条消息按换行拆成多个段落，每段独立成 <p>，这样起点式首行缩进能作用在「每一段」上，
 * 而不是只缩进整条消息的第一行（text-indent 只对块的首行生效，多段消息会出现缩进忽有忽无）。
 */
function renderParagraphs(content: string): React.ReactNode {
  const paras = content.split(/\n+/).map(s => s.trim()).filter(Boolean);
  if (paras.length === 0) return null;
  return paras.map((p, i) => (
    <p key={i} className="reading-paragraph">{p}</p>
  ));
}

export const ChatPreview = forwardRef<HTMLDivElement, ChatPreviewProps>(
  ({ session, theme, showTimestamp, showAvatar, fontSize, regexRules, markers = [], onMessageClick, editMode = false, fontFamily, previewRule = null }, ref) => {
    const markerMap = useMemo(() => {
      const map = new Map<string, ChapterMarker>();
      markers.forEach(m => map.set(m.messageId, m));
      return map;
    }, [markers]);
    // 防抖正则规则：编辑规则时频繁触发会导致大文本(数十万字)全量重算卡顿，
    // 延迟 300ms 再应用，输入过程中不阻塞 UI。
    const [debouncedRules, setDebouncedRules] = useState(regexRules);
    useEffect(() => {
      const t = setTimeout(() => setDebouncedRules(regexRules), 300);
      return () => clearTimeout(t);
    }, [regexRules]);
    // 预处理消息，应用正则规则
    const processedMessages = useMemo(() => {
      // 预览某规则时，把该规则从应用列表中排除，这样它本该删除的内容仍保留在正文里，
      // 再由 renderPreviewHighlight 用红色删除线标出——所见即所得。
      const activeRules = previewRule
        ? debouncedRules.filter(r => r.id !== previewRule.id)
        : debouncedRules;
      return session.messages.map(msg => {
        const isUser = msg.role === 'user';
        // 去除首尾空白：正则删除开头/结尾的标签块后常残留换行，
        // 否则 text-indent 会缩进到这条残留空行上，导致正文看起来没缩进、缩进忽有忽无。
        const processedContent = applyRegexRules(msg.content, activeRules, isUser).trim();
        return { ...msg, content: processedContent };
      }).filter(msg => msg.content); // 过滤掉空消息
    }, [session.messages, debouncedRules, previewRule]);
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
            message: 'mb-5',
            userBubble: '',
            charBubble: '',
            content: 'reading-flow',
            name: 'font-display text-primary/70 text-sm mb-1',
            separator: 'hidden',
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
            message: 'mb-5',
            userBubble: '',
            charBubble: '',
            content: 'reading-flow',
            name: 'font-display text-base text-primary/70 mb-1',
            separator: 'hidden',
          };
      }
    };

    const classes = getThemeClasses();

    return (
      <div
        ref={ref}
        className={`min-h-[400px] ${classes.container}`}
        style={{ fontSize: `${fontSize}px`, fontFamily: fontFamily || undefined }}
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

                  <div
                    className={`${classes.message} ${isUser ? classes.userBubble : classes.charBubble} animate-fade-in group relative ${
                      editMode ? 'cursor-pointer hover:bg-primary/5 rounded-lg transition-colors' : ''
                    }`}
                    onClick={() => editMode && onMessageClick?.(message.id, index)}
                    data-tour-message={index}
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
                        <div className={classes.name}>
                          {message.name || (isUser ? session.user.name : session.character.name)}
                        </div>
                        <div className={`inline-block ${classes.content} ${
                          isUser ? 'bubble-user' : 'bubble-char'
                        } whitespace-pre-wrap`}>
                          {previewRule ? renderPreviewHighlight(message.content, previewRule) : message.content}
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
                      {/* 阅读流主题(elegant/novel)下，同一说话人连续发言时省略重复名字，
                          让正文更连贯，贴近小说阅读体验；minimal 仍每条都标名 */}
                      {(theme === 'minimal' || isNewSpeaker) && (
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
                        {previewRule
                          ? renderPreviewHighlight(message.content, previewRule)
                          : (theme === 'elegant' || theme === 'novel')
                            ? renderParagraphs(message.content)
                            : message.content}
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
