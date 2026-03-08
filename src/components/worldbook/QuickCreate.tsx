import { useState, useMemo } from 'react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronDown, X, Wand2, Plus, Download, ArrowLeft } from 'lucide-react';
import type { WorldBookEntry, WorldBook } from '@/types/worldbook';
import { DEFAULT_ENTRY, POSITION_LABELS, exportWorldBook } from '@/types/worldbook';

interface Props {
  existingWorldbook: WorldBook | null;
  onAddToWorldbook: (entries: WorldBookEntry[]) => void;
}

interface QuickEntry {
  title: string;
  content: string;
  keywords: string[];
  position: number;
  order: number;
  depth: number;
}

/** Simple heuristic keyword extraction */
function extractKeywords(title: string, content: string): string[] {
  const keywords: string[] = [];
  
  // Title words (non-trivial)
  const stopWords = new Set(['的', '了', '在', '是', '和', '与', '或', '也', '都', '有', '这', '那', 'the', 'a', 'an', 'is', 'are', 'was', 'were', 'in', 'on', 'at', 'to', 'for', 'of', 'and', 'or']);
  const titleWords = title.split(/[\s,，、]+/).filter(w => w.length > 1 && !stopWords.has(w.toLowerCase()));
  if (titleWords.length > 0) keywords.push(titleWords[0]);

  // Quoted text: 「」 "" '' ** 
  const patterns = [
    /「([^」]+)」/g,
    /「([^」]+)」/g,
    /"([^"]+)"/g,
    /「([^」]+)」/g,
    /\*\*([^*]+)\*\*/g,
    /"([^"]+)"/g,
  ];
  
  for (const pat of patterns) {
    let m;
    while ((m = pat.exec(content)) !== null) {
      const word = m[1].trim();
      if (word.length > 0 && word.length < 30 && !keywords.includes(word)) {
        keywords.push(word);
      }
    }
  }

  // Capitalized proper nouns (for English text)
  const properNouns = content.match(/\b[A-Z][a-z]{2,}(?:\s[A-Z][a-z]{2,})*/g);
  if (properNouns) {
    for (const noun of properNouns) {
      if (!keywords.includes(noun) && keywords.length < 8) {
        keywords.push(noun);
      }
    }
  }

  return keywords.slice(0, 8);
}

function QuickEntryCard({ entry, index, onChange, onRemove }: {
  entry: QuickEntry;
  index: number;
  onChange: (updated: QuickEntry) => void;
  onRemove: () => void;
}) {
  const [keyInput, setKeyInput] = useState('');
  const [expanded, setExpanded] = useState(false);

  const addKeywords = (raw: string) => {
    const newKeys = raw.split(',').map(k => k.trim()).filter(k => k && !entry.keywords.includes(k));
    if (newKeys.length) onChange({ ...entry, keywords: [...entry.keywords, ...newKeys] });
  };

  return (
    <div className="border rounded-lg bg-card p-3 space-y-2">
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground shrink-0">#{index + 1}</span>
        <Input
          value={entry.title}
          onChange={(e) => onChange({ ...entry, title: e.target.value })}
          className="h-7 text-sm font-medium"
          placeholder="标题"
        />
        <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={onRemove}>
          <X className="w-3.5 h-3.5" />
        </Button>
      </div>

      {/* Keywords */}
      <div className="flex flex-wrap gap-1">
        {entry.keywords.map((k, i) => (
          <Badge key={i} variant="secondary" className="text-xs cursor-pointer"
            onClick={() => onChange({ ...entry, keywords: entry.keywords.filter((_, idx) => idx !== i) })}>
            {k} <X className="w-3 h-3 ml-0.5" />
          </Badge>
        ))}
        <Input
          value={keyInput}
          onChange={(e) => setKeyInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addKeywords(keyInput); setKeyInput(''); } }}
          onBlur={() => { if (keyInput.trim()) { addKeywords(keyInput); setKeyInput(''); } }}
          placeholder="添加关键词"
          className="h-6 text-xs w-24 inline-flex"
        />
      </div>

      {/* Content */}
      {expanded ? (
        <Textarea
          value={entry.content}
          onChange={(e) => onChange({ ...entry, content: e.target.value })}
          rows={6}
          className="text-xs"
        />
      ) : (
        <p className="text-xs text-muted-foreground line-clamp-2 whitespace-pre-wrap cursor-pointer"
          onClick={() => setExpanded(true)}>
          {entry.content || '(无内容)'}
        </p>
      )}
      {expanded && (
        <Button variant="ghost" size="sm" className="text-xs h-6" onClick={() => setExpanded(false)}>收起</Button>
      )}

      {/* Position & Order */}
      <div className="flex gap-2 items-center text-xs">
        <Select value={String(entry.position)} onValueChange={(v) => onChange({ ...entry, position: Number(v) })}>
          <SelectTrigger className="h-6 text-xs w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(POSITION_LABELS).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-muted-foreground">Order:</span>
        <Input
          type="number"
          value={entry.order}
          onChange={(e) => onChange({ ...entry, order: Number(e.target.value) })}
          className="h-6 w-16 text-xs"
        />
      </div>
    </div>
  );
}

export function QuickCreate({ existingWorldbook, onAddToWorldbook }: Props) {
  const [text, setText] = useState('');
  const [defaultPosition, setDefaultPosition] = useState(1);
  const [defaultOrder, setDefaultOrder] = useState(100);
  const [orderStep, setOrderStep] = useState(10);
  const [defaultStrategy, setDefaultStrategy] = useState<'keyword' | 'constant'>('keyword');
  const [defaultDepth, setDefaultDepth] = useState(4);
  const [autoExtract, setAutoExtract] = useState(true);
  const [previewEntries, setPreviewEntries] = useState<QuickEntry[] | null>(null);

  const handleSplit = () => {
    const paragraphs = text.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
    const entries: QuickEntry[] = paragraphs.map((para, i) => {
      const lines = para.split('\n');
      const title = lines[0].replace(/^#+\s*/, '').trim();
      const content = lines.slice(1).join('\n').trim() || para;
      const keywords = autoExtract ? extractKeywords(title, content) : [];
      return {
        title,
        content: lines.length > 1 ? content : para,
        keywords,
        position: defaultPosition,
        order: defaultOrder + i * orderStep,
        depth: defaultDepth,
      };
    });
    setPreviewEntries(entries);
  };

  const updatePreviewEntry = (index: number, updated: QuickEntry) => {
    setPreviewEntries(prev => prev ? prev.map((e, i) => i === index ? updated : e) : prev);
  };

  const removePreviewEntry = (index: number) => {
    setPreviewEntries(prev => prev ? prev.filter((_, i) => i !== index) : prev);
  };

  const buildEntries = (): WorldBookEntry[] => {
    if (!previewEntries) return [];
    const baseUid = Date.now();
    return previewEntries.map((pe, i): WorldBookEntry => ({
      ...DEFAULT_ENTRY,
      uid: baseUid + i,
      comment: pe.title,
      content: pe.content,
      key: pe.keywords,
      keysecondary: [],
      position: pe.position,
      order: pe.order,
      depth: pe.depth,
      constant: defaultStrategy === 'constant',
      enabled: true,
    } as WorldBookEntry));
  };

  const handleAddToWorldbook = () => {
    const entries = buildEntries();
    onAddToWorldbook(entries);
    setPreviewEntries(null);
    setText('');
  };

  const handleExportNew = () => {
    const entries = buildEntries();
    const wb: WorldBook = { entries: {} };
    entries.forEach((e, i) => { wb.entries[String(i)] = e; });
    const json = exportWorldBook(wb);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'quick-worldbook.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  if (previewEntries) {
    return (
      <div className="p-4 space-y-4">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => setPreviewEntries(null)}>
            <ArrowLeft className="w-4 h-4 mr-1" /> 返回编辑
          </Button>
          <span className="text-sm text-muted-foreground">预览 {previewEntries.length} 个条目</span>
          <div className="flex-1" />
          {existingWorldbook && (
            <Button variant="default" size="sm" onClick={handleAddToWorldbook}>
              <Plus className="w-4 h-4 mr-1" /> 添加到当前世界书
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={handleExportNew}>
            <Download className="w-4 h-4 mr-1" /> 导出为新世界书
          </Button>
        </div>
        <div className="grid gap-3 grid-cols-1 lg:grid-cols-2">
          {previewEntries.map((entry, i) => (
            <QuickEntryCard
              key={i}
              entry={entry}
              index={i}
              onChange={(updated) => updatePreviewEntry(i, updated)}
              onRemove={() => removePreviewEntry(i)}
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 flex flex-col md:flex-row gap-4 h-full">
      {/* Left: text input */}
      <div className="flex-1 flex flex-col gap-2">
        <Label className="text-sm font-medium">粘贴或输入世界观设定文本</Label>
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="粘贴或输入世界观设定文本，用空行分隔不同条目"
          className="flex-1 min-h-[50vh] md:min-h-0 text-sm"
        />
        <p className="text-xs text-muted-foreground">每段空行分隔的文本会被拆分为一个独立的世界书条目</p>
        <Button onClick={handleSplit} disabled={!text.trim()} className="w-full sm:w-auto">
          <Wand2 className="w-4 h-4 mr-1" /> 拆分预览
        </Button>
      </div>

      {/* Right: global defaults */}
      <Collapsible defaultOpen className="md:w-72 shrink-0">
        <CollapsibleTrigger className="flex items-center gap-1 text-sm font-medium text-foreground md:hidden mb-2">
          <ChevronDown className="w-4 h-4" /> 全局默认设置
        </CollapsibleTrigger>
        <CollapsibleContent className="space-y-3" forceMount>
          <h4 className="text-sm font-medium text-foreground hidden md:block">全局默认设置</h4>

          <div className="space-y-1">
            <Label className="text-xs">默认插入位置</Label>
            <Select value={String(defaultPosition)} onValueChange={(v) => setDefaultPosition(Number(v))}>
              <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(POSITION_LABELS).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {defaultPosition === 6 && (
            <div className="space-y-1">
              <Label className="text-xs">默认深度</Label>
              <Input type="number" value={defaultDepth} onChange={(e) => setDefaultDepth(Number(e.target.value))} className="h-8" />
            </div>
          )}

          <div className="space-y-1">
            <Label className="text-xs">起始 Order</Label>
            <Input type="number" value={defaultOrder} onChange={(e) => setDefaultOrder(Number(e.target.value))} className="h-8" />
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Order 递增步长</Label>
            <Input type="number" value={orderStep} onChange={(e) => setOrderStep(Number(e.target.value))} className="h-8" />
          </div>

          <div className="space-y-1">
            <Label className="text-xs">默认策略</Label>
            <Select value={defaultStrategy} onValueChange={(v) => setDefaultStrategy(v as 'keyword' | 'constant')}>
              <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="keyword">🟢 关键词触发</SelectItem>
                <SelectItem value="constant">🔵 常驻</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center justify-between">
            <Label className="text-xs">自动提取关键词</Label>
            <Switch checked={autoExtract} onCheckedChange={setAutoExtract} />
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
