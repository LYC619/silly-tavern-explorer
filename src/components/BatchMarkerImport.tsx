import { useState } from 'react';
import { FileUp, Plus, Trash2, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
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
}

export function BatchMarkerImport({ totalMessages, onImport }: BatchMarkerImportProps) {
  const [open, setOpen] = useState(false);
  const [rawText, setRawText] = useState('');
  const [chapters, setChapters] = useState<ParsedChapter[]>([]);
  const [step, setStep] = useState<'input' | 'edit'>('input');

  const parseText = () => {
    const lines = rawText.split('\n');
    const parsed: ParsedChapter[] = [];
    
    let currentVolume = '';
    let currentTitle = '';
    let currentSummary: string[] = [];
    
    const saveCurrentChapter = () => {
      if (currentTitle) {
        parsed.push({
          volume: currentVolume || undefined,
          title: currentTitle,
          summary: currentSummary.join('\n').trim() || undefined,
        });
        currentTitle = '';
        currentSummary = [];
      }
    };
    
    for (const line of lines) {
      const trimmed = line.trim();
      
      // 检测卷名 (### 开头)
      if (trimmed.startsWith('### ') && !trimmed.startsWith('#### ')) {
        saveCurrentChapter();
        currentVolume = trimmed.replace(/^###\s*/, '').replace(/存档节点[：:]\s*/, '');
      }
      // 检测章节名 (#### 开头)
      else if (trimmed.startsWith('#### ')) {
        saveCurrentChapter();
        currentTitle = trimmed.replace(/^####\s*/, '').replace(/【|】/g, '');
      }
      // 检测概要内容
      else if (trimmed && currentTitle) {
        // 跳过一些格式标记
        if (trimmed === '---' || trimmed === '***') continue;
        currentSummary.push(trimmed);
      }
    }
    
    saveCurrentChapter();
    
    if (parsed.length === 0) {
      // 如果解析失败，尝试简单分段
      const sections = rawText.split(/\n{2,}/);
      for (const section of sections) {
        if (section.trim()) {
          parsed.push({
            title: section.trim().slice(0, 50) + (section.length > 50 ? '...' : ''),
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
        updated[index] = { ...updated[index], [field]: parseInt(value as string) || undefined };
      } else {
        updated[index] = { ...updated[index], [field]: value };
      }
      return updated;
    });
  };

  const removeChapter = (index: number) => {
    setChapters(prev => prev.filter((_, i) => i !== index));
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
    setOpen(false);
    resetState();
  };

  const resetState = () => {
    setRawText('');
    setChapters([]);
    setStep('input');
  };

  const validCount = chapters.filter(
    ch => ch.floorNumber && ch.floorNumber > 0 && ch.floorNumber <= totalMessages
  ).length;

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) resetState(); }}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <FileUp className="w-4 h-4 mr-2" />
          批量导入
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[85vh]">
        <DialogHeader>
          <DialogTitle>批量导入章节标记</DialogTitle>
        </DialogHeader>

        {step === 'input' ? (
          <div className="space-y-4">
            <div>
              <Label>粘贴AI生成的章节总结</Label>
              <p className="text-xs text-muted-foreground mb-2">
                支持 Markdown 格式：### 卷名、#### 章节名
              </p>
              <Textarea
                value={rawText}
                onChange={(e) => setRawText(e.target.value)}
                placeholder={`### 第一卷 - 初遇\n\n#### 【本卷概要】\n\n描述本卷的主要剧情...\n\n#### 【关键事件索引】\n\n- 事件1: 描述...\n- 事件2: 描述...`}
                className="min-h-[300px] font-mono text-sm"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setOpen(false)}>
                取消
              </Button>
              <Button onClick={parseText} disabled={!rawText.trim()}>
                解析内容
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                解析到 {chapters.length} 个章节，请填写对应楼层数 (1-{totalMessages})
              </p>
              <Button variant="ghost" size="sm" onClick={addChapter}>
                <Plus className="w-4 h-4 mr-1" />
                添加
              </Button>
            </div>
            
            <ScrollArea className="h-[400px] pr-4">
              <div className="space-y-4">
                {chapters.map((chapter, index) => (
                  <div key={index} className="p-3 border rounded-lg space-y-2 bg-muted/30">
                    <div className="flex items-start gap-2">
                      <div className="flex-1 space-y-2">
                        <div className="flex gap-2">
                          <div className="w-20">
                            <Label className="text-xs">楼层</Label>
                            <Input
                              type="number"
                              min={1}
                              max={totalMessages}
                              value={chapter.floorNumber || ''}
                              onChange={(e) => updateChapter(index, 'floorNumber', e.target.value)}
                              placeholder="楼层"
                              className="h-8"
                            />
                          </div>
                          <div className="flex-1">
                            <Label className="text-xs">卷名</Label>
                            <Input
                              value={chapter.volume || ''}
                              onChange={(e) => updateChapter(index, 'volume', e.target.value)}
                              placeholder="可选"
                              className="h-8"
                            />
                          </div>
                        </div>
                        <div>
                          <Label className="text-xs">章节名</Label>
                          <Input
                            value={chapter.title}
                            onChange={(e) => updateChapter(index, 'title', e.target.value)}
                            className="h-8"
                          />
                        </div>
                        {chapter.summary && (
                          <p className="text-xs text-muted-foreground line-clamp-2">
                            {chapter.summary}
                          </p>
                        )}
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive"
                        onClick={() => removeChapter(index)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>

            <div className="flex justify-between items-center">
              <Button variant="ghost" onClick={() => setStep('input')}>
                返回修改
              </Button>
              <div className="flex gap-2 items-center">
                <span className="text-sm text-muted-foreground">
                  {validCount} 个有效标记
                </span>
                <Button onClick={handleImport} disabled={validCount === 0}>
                  <Check className="w-4 h-4 mr-2" />
                  确认导入
                </Button>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
