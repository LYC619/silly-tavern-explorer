import { useState, useEffect, useRef } from 'react';
import { FileUp, Plus, Trash2, Check, Target, GripVertical } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import type { ChapterMarker } from '@/types/chat';

interface ParsedChapter {
  volume?: string;
  chapterNumber?: string; // 章节编号，如 "第一章"、"摘要"
  title: string;
  summary?: string;
  floorNumber?: number;
}

interface BatchMarkerImportProps {
  totalMessages: number;
  onImport: (markers: ChapterMarker[]) => void;
  isOpen: boolean;
  onClose: () => void;
  selectedFloor: number | null;
  activeChapterIndex: number | null;
  onSetActiveChapter: (index: number | null) => void;
}

export function BatchMarkerImport({ 
  totalMessages, 
  onImport, 
  isOpen, 
  onClose,
  selectedFloor,
  activeChapterIndex,
  onSetActiveChapter,
}: BatchMarkerImportProps) {
  const [rawText, setRawText] = useState('');
  const [chapters, setChapters] = useState<ParsedChapter[]>([]);
  const [step, setStep] = useState<'input' | 'edit'>('input');
  const [sidebarWidth, setSidebarWidth] = useState(480);
  const isResizing = useRef(false);
  const sidebarRef = useRef<HTMLDivElement>(null);

  // 拖拽调整宽度
  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    isResizing.current = true;
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (!isResizing.current) return;
    const newWidth = window.innerWidth - e.clientX - 32; // 32px for padding
    setSidebarWidth(Math.max(360, Math.min(800, newWidth)));
  };

  const handleMouseUp = () => {
    isResizing.current = false;
    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseup', handleMouseUp);
  };

  // 监听 selectedFloor 变化
  useEffect(() => {
    if (selectedFloor !== null && activeChapterIndex !== null && step === 'edit') {
      setChapters(prev => {
        const updated = [...prev];
        if (activeChapterIndex < updated.length) {
          updated[activeChapterIndex] = { ...updated[activeChapterIndex], floorNumber: selectedFloor };
        }
        return updated;
      });
      // 自动跳到下一个未填写的章节
      const nextEmpty = chapters.findIndex((ch, i) => i > activeChapterIndex && !ch.floorNumber);
      onSetActiveChapter(nextEmpty >= 0 ? nextEmpty : null);
    }
  }, [selectedFloor]);

  const parseText = () => {
    const lines = rawText.split('\n');
    const parsed: ParsedChapter[] = [];
    
    let currentVolume = '';
    let summaryLines: string[] = [];
    let inSummarySection = false;
    let inEventsSection = false;
    let skipUntilNextVolume = false;
    let eventCountInVolume = 0; // 用于生成章节编号
    
    const saveSummaryAsChapter = () => {
      if (currentVolume && summaryLines.length > 0) {
        parsed.push({
          volume: currentVolume,
          chapterNumber: '摘要',
          title: '本卷概要',
          summary: summaryLines.join('\n').trim(),
        });
        summaryLines = [];
      }
    };
    
    // 数字转中文
    const toChineseNumber = (num: number): string => {
      const chineseNumbers = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];
      if (num <= 10) return chineseNumbers[num];
      if (num < 20) return '十' + (num === 10 ? '' : chineseNumbers[num - 10]);
      if (num < 100) {
        const tens = Math.floor(num / 10);
        const ones = num % 10;
        return chineseNumbers[tens] + '十' + (ones === 0 ? '' : chineseNumbers[ones]);
      }
      return num.toString();
    };
    
    for (const line of lines) {
      const trimmed = line.trim();
      
      // 跳过角色图鉴部分
      if (trimmed.match(/^###\s*【角色图鉴/)) {
        saveSummaryAsChapter();
        skipUntilNextVolume = true;
        inSummarySection = false;
        inEventsSection = false;
        continue;
      }
      
      // 检测卷名: ### 存档节点：第X卷 - {卷名}
      const volumeMatch = trimmed.match(/^###\s*存档节点[：:]\s*(.+)$/);
      if (volumeMatch) {
        saveSummaryAsChapter();
        currentVolume = volumeMatch[1];
        skipUntilNextVolume = false;
        inSummarySection = false;
        inEventsSection = false;
        eventCountInVolume = 0; // 重置章节计数
        continue;
      }
      
      // 检测普通卷名: ### 第X卷 - {卷名}
      const simpleVolumeMatch = trimmed.match(/^###\s*(第.+卷.*)$/);
      if (simpleVolumeMatch && !trimmed.includes('角色图鉴')) {
        saveSummaryAsChapter();
        currentVolume = simpleVolumeMatch[1];
        skipUntilNextVolume = false;
        inSummarySection = false;
        inEventsSection = false;
        eventCountInVolume = 0; // 重置章节计数
        continue;
      }
      
      if (skipUntilNextVolume) continue;
      
      // 检测【本卷概要】
      if (trimmed.match(/^####\s*【本卷概要】/)) {
        inSummarySection = true;
        inEventsSection = false;
        continue;
      }
      
      // 检测【关键事件索引】
      if (trimmed.match(/^####\s*【关键事件索引】/)) {
        // 保存之前的概要作为一个章节项
        saveSummaryAsChapter();
        inEventsSection = true;
        inSummarySection = false;
        continue;
      }
      
      // 检测事件项: - **{事件标题}**: {描述}
      const eventMatch = trimmed.match(/^-\s*\*\*(.+?)\*\*[：:]\s*(.+)$/);
      if (eventMatch && inEventsSection && currentVolume) {
        eventCountInVolume++;
        parsed.push({
          volume: currentVolume,
          chapterNumber: `第${toChineseNumber(eventCountInVolume)}章`,
          title: eventMatch[1],
          summary: eventMatch[2],
        });
        continue;
      }
      
      // 收集概要内容
      if (inSummarySection && trimmed && !trimmed.startsWith('#') && !trimmed.startsWith('---') && !trimmed.startsWith('***')) {
        summaryLines.push(trimmed);
      }
    }
    
    // 保存最后一个概要
    saveSummaryAsChapter();
    
    // 如果解析失败，尝试简单分段
    if (parsed.length === 0) {
      const sections = rawText.split(/\n{2,}/);
      for (const section of sections) {
        if (section.trim()) {
          const firstLine = section.trim().split('\n')[0];
          parsed.push({
            title: firstLine.slice(0, 50) + (firstLine.length > 50 ? '...' : ''),
            summary: section.trim(),
          });
        }
      }
    }
    
    setChapters(parsed);
    setStep('edit');
  };

  const updateChapter = (index: number, field: keyof ParsedChapter, value: string | number) => {
    setChapters(prev => {
      const updated = [...prev];
      if (field === 'floorNumber') {
        updated[index] = { ...updated[index], [field]: typeof value === 'number' ? value : (parseInt(value as string) || undefined) };
      } else {
        updated[index] = { ...updated[index], [field]: value };
      }
      return updated;
    });
  };

  const removeChapter = (index: number) => {
    setChapters(prev => prev.filter((_, i) => i !== index));
    if (activeChapterIndex === index) {
      onSetActiveChapter(null);
    }
  };

  const addChapter = () => {
    setChapters(prev => [...prev, { title: '新章节' }]);
  };

  const handleImport = () => {
    const markers: ChapterMarker[] = chapters
      .filter(ch => ch.floorNumber && ch.floorNumber > 0 && ch.floorNumber <= totalMessages)
      .map(ch => ({
        messageId: `msg-${ch.floorNumber! - 1}`,
        messageIndex: ch.floorNumber! - 1,
        // ChapterMarker 没有 chapterNumber 字段，因此把“第一章”并入 title
        title: ch.chapterNumber ? `${ch.chapterNumber} ${ch.title}` : ch.title,
        // 有章节编号时不带卷名，避免目录重复显示"第一卷"
        volume: ch.chapterNumber ? undefined : (ch.volume?.trim() || undefined),
        summary: ch.summary,
        createdAt: Date.now(),
      }));

    onImport(markers);
    resetState();
    onClose();
  };

  const resetState = () => {
    setRawText('');
    setChapters([]);
    setStep('input');
    onSetActiveChapter(null);
  };

  const validCount = chapters.filter(
    ch => ch.floorNumber && ch.floorNumber > 0 && ch.floorNumber <= totalMessages
  ).length;

  if (!isOpen) return null;

  return (
    <aside 
      ref={sidebarRef}
      style={{ width: sidebarWidth }}
      className="flex-shrink-0 border border-border rounded-lg bg-card flex flex-col max-h-[calc(100vh-120px)] sticky top-24 relative overflow-hidden"
    >
      {/* 拖拽手柄 */}
      <div 
        className="absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-primary/20 flex items-center justify-center group"
        onMouseDown={handleMouseDown}
      >
        <GripVertical className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
      </div>

      <div className="p-4 border-b border-border flex items-center justify-between">
        <h3 className="font-semibold flex items-center gap-2">
          <FileUp className="w-4 h-4" />
          批量导入章节
        </h3>
        <Button variant="ghost" size="sm" onClick={() => { resetState(); onClose(); }}>
          关闭
        </Button>
      </div>

      {step === 'input' ? (
        <div className="flex-1 p-4 flex flex-col overflow-hidden">
          <div className="flex-1 flex flex-col min-h-0">
            <Label className="mb-2 text-base">粘贴AI生成的章节总结</Label>
            <p className="text-sm text-muted-foreground mb-3">
              支持【存档节点】格式，自动解析卷名、概要和事件
            </p>
            <Textarea
              value={rawText}
              onChange={(e) => setRawText(e.target.value)}
              placeholder={`### 存档节点：第一卷 - 初遇\n\n#### 【本卷概要】\n\n描述本卷的主要剧情...\n\n#### 【关键事件索引】\n\n- **初次相遇**: 描述事件的起因、经过和结果...`}
              className="flex-1 min-h-0 font-mono text-sm resize-none"
            />
          </div>
          <Button onClick={parseText} disabled={!rawText.trim()} className="mt-4 w-full">
            解析内容
          </Button>
        </div>
      ) : (
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
          <div className="p-4 border-b border-border bg-muted/30 flex-shrink-0">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium">
                解析到 <span className="text-primary font-semibold">{chapters.length}</span> 个章节
              </span>
              <Button variant="outline" size="sm" onClick={addChapter}>
                <Plus className="w-3 h-3 mr-1" />
                添加
              </Button>
            </div>
            <p className="text-sm text-muted-foreground">
              点击章节卡片激活，然后点击左侧文档中的消息来选择楼层
            </p>
          </div>
          
          <div className="flex-1 min-h-0 overflow-y-auto">
            <div className="p-3 space-y-2">
              {chapters.map((chapter, index) => (
                <div 
                  key={index} 
                  className={cn(
                    "p-3 border rounded-lg cursor-pointer transition-all",
                    activeChapterIndex === index 
                      ? "border-primary bg-primary/5 ring-2 ring-primary/30 shadow-sm" 
                      : "border-border hover:border-muted-foreground/50 hover:bg-muted/30"
                  )}
                  onClick={() => onSetActiveChapter(activeChapterIndex === index ? null : index)}
                >
                  <div className="flex items-start gap-3">
                    <div 
                      className={cn(
                        "w-14 h-8 rounded flex items-center justify-center font-mono text-sm font-medium shrink-0",
                        chapter.floorNumber 
                          ? "bg-primary/20 text-primary" 
                          : "bg-muted text-muted-foreground"
                      )}
                    >
                      {chapter.floorNumber ? `#${chapter.floorNumber}` : (
                        activeChapterIndex === index ? (
                          <Target className="w-4 h-4 animate-pulse" />
                        ) : '?'
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      {chapter.volume && (
                        <span className="text-xs text-primary/70 font-medium block mb-0.5">
                          {chapter.volume}
                        </span>
                      )}
                      <p className="text-sm font-medium leading-tight">
                        {chapter.chapterNumber ? `${chapter.chapterNumber} ${chapter.title}` : chapter.title}
                      </p>
                      {chapter.summary && (
                        <p className="text-xs text-muted-foreground line-clamp-2 mt-1 leading-relaxed">
                          {chapter.summary}
                        </p>
                      )}
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-destructive/70 hover:text-destructive shrink-0"
                      onClick={(e) => { e.stopPropagation(); removeChapter(index); }}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="p-4 border-t border-border space-y-3 bg-card flex-shrink-0">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">
                已填写楼层: <span className="font-medium text-foreground">{validCount}/{chapters.length}</span>
              </span>
              <Button variant="ghost" size="sm" onClick={() => setStep('input')}>
                返回修改
              </Button>
            </div>
            <Button onClick={handleImport} disabled={validCount === 0} className="w-full">
              <Check className="w-4 h-4 mr-2" />
              确认导入 ({validCount} 个章节)
            </Button>
          </div>
        </div>
      )}
    </aside>
  );
}
