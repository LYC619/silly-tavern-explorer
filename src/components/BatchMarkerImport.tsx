import { useState, useEffect } from 'react';
import { FileUp, Plus, Trash2, Check, Target } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import type { ChapterMarker } from '@/types/chat';

interface ParsedChapter {
  volume?: string;
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
    
    const saveSummaryAsChapter = () => {
      if (currentVolume && summaryLines.length > 0) {
        parsed.push({
          volume: currentVolume,
          title: '本卷概要',
          summary: summaryLines.join('\n').trim(),
        });
        summaryLines = [];
      }
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
        parsed.push({
          volume: currentVolume,
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
        title: ch.title,
        volume: ch.volume,
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
    <aside className="w-80 flex-shrink-0 border border-border rounded-lg bg-card flex flex-col h-[calc(100vh-380px)]">
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
            <Label className="mb-1">粘贴AI生成的章节总结</Label>
            <p className="text-xs text-muted-foreground mb-2">
              支持【存档节点】格式
            </p>
            <Textarea
              value={rawText}
              onChange={(e) => setRawText(e.target.value)}
              placeholder={`### 存档节点：第一卷 - 初遇\n\n#### 【本卷概要】\n\n描述本卷的主要剧情...\n\n#### 【关键事件索引】\n\n- **初次相遇**: 描述...`}
              className="flex-1 min-h-[200px] font-mono text-xs resize-none"
            />
          </div>
          <Button onClick={parseText} disabled={!rawText.trim()} className="mt-4 w-full">
            解析内容
          </Button>
        </div>
      ) : (
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="p-3 border-b border-border bg-muted/30">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm">
                解析到 <span className="font-semibold">{chapters.length}</span> 个章节
              </span>
              <Button variant="ghost" size="sm" className="h-7" onClick={addChapter}>
                <Plus className="w-3 h-3 mr-1" />
                添加
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              点击章节后，再点击左侧文档选择楼层
            </p>
          </div>
          
          <ScrollArea className="flex-1">
            <div className="p-2 space-y-2">
              {chapters.map((chapter, index) => (
                <div 
                  key={index} 
                  className={cn(
                    "p-2 border rounded-lg cursor-pointer transition-colors",
                    activeChapterIndex === index 
                      ? "border-primary bg-primary/5 ring-1 ring-primary" 
                      : "border-border hover:border-muted-foreground/50"
                  )}
                  onClick={() => onSetActiveChapter(activeChapterIndex === index ? null : index)}
                >
                  <div className="flex items-start gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <div 
                          className={cn(
                            "w-12 h-6 rounded text-xs flex items-center justify-center font-mono",
                            chapter.floorNumber 
                              ? "bg-primary/20 text-primary" 
                              : "bg-muted text-muted-foreground"
                          )}
                          onClick={(e) => e.stopPropagation()}
                        >
                          {chapter.floorNumber ? `#${chapter.floorNumber}` : (
                            activeChapterIndex === index ? (
                              <Target className="w-3 h-3 animate-pulse" />
                            ) : '?'
                          )}
                        </div>
                        {chapter.volume && (
                          <span className="text-xs text-muted-foreground truncate">
                            {chapter.volume}
                          </span>
                        )}
                      </div>
                      <p className="text-sm font-medium truncate">{chapter.title}</p>
                      {chapter.summary && (
                        <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">
                          {chapter.summary}
                        </p>
                      )}
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 text-destructive shrink-0"
                      onClick={(e) => { e.stopPropagation(); removeChapter(index); }}
                    >
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>

          <div className="p-3 border-t border-border space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">
                已填写 {validCount}/{chapters.length}
              </span>
              <Button variant="ghost" size="sm" className="h-7" onClick={() => setStep('input')}>
                返回修改
              </Button>
            </div>
            <Button onClick={handleImport} disabled={validCount === 0} className="w-full">
              <Check className="w-4 h-4 mr-2" />
              确认导入 ({validCount})
            </Button>
          </div>
        </div>
      )}
    </aside>
  );
}
