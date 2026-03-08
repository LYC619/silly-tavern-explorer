import { useState, useMemo } from 'react';
import { CheckSquare, Square, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import type { ChatMessage } from '@/types/chat';

interface FloorSelectorProps {
  messages: ChatMessage[];
  characterName?: string;
  userName?: string;
  selectedIndices: Set<number>;
  onSelectionChange: (indices: Set<number>) => void;
}

type SelectMode = 'all' | 'recent' | 'custom';

export function FloorSelector({ messages, characterName, userName, selectedIndices, onSelectionChange }: FloorSelectorProps) {
  const [mode, setMode] = useState<SelectMode>('all');
  const [recentN, setRecentN] = useState(20);
  const [expanded, setExpanded] = useState(false);

  const handleModeChange = (newMode: SelectMode) => {
    setMode(newMode);
    if (newMode === 'all') {
      onSelectionChange(new Set(messages.map((_, i) => i)));
    } else if (newMode === 'recent') {
      const start = Math.max(0, messages.length - recentN);
      onSelectionChange(new Set(messages.map((_, i) => i).filter(i => i >= start)));
    }
    // custom: keep current selection
  };

  const handleRecentChange = (n: number) => {
    setRecentN(n);
    const start = Math.max(0, messages.length - n);
    onSelectionChange(new Set(messages.map((_, i) => i).filter(i => i >= start)));
  };

  const toggleIndex = (index: number) => {
    const next = new Set(selectedIndices);
    if (next.has(index)) next.delete(index);
    else next.add(index);
    onSelectionChange(next);
    setMode('custom');
  };

  const selectedCount = selectedIndices.size;

  const getName = (msg: ChatMessage) => {
    if (msg.role === 'user') return userName || msg.name || 'User';
    return characterName || msg.name || 'Character';
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">选择楼层范围</CardTitle>
          <span className="text-sm text-muted-foreground">
            已选 {selectedCount}/{messages.length} 条
          </span>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <RadioGroup value={mode} onValueChange={(v) => handleModeChange(v as SelectMode)} className="flex flex-wrap gap-4">
          <div className="flex items-center gap-2">
            <RadioGroupItem value="all" id="sel-all" />
            <Label htmlFor="sel-all" className="cursor-pointer">全选</Label>
          </div>
          <div className="flex items-center gap-2">
            <RadioGroupItem value="recent" id="sel-recent" />
            <Label htmlFor="sel-recent" className="cursor-pointer">最近</Label>
            {mode === 'recent' && (
              <Input
                type="number"
                min={1}
                max={messages.length}
                value={recentN}
                onChange={(e) => handleRecentChange(Math.max(1, parseInt(e.target.value) || 1))}
                className="w-20 h-8"
              />
            )}
            {mode === 'recent' && <span className="text-xs text-muted-foreground">条</span>}
          </div>
          <div className="flex items-center gap-2">
            <RadioGroupItem value="custom" id="sel-custom" />
            <Label htmlFor="sel-custom" className="cursor-pointer">自定义</Label>
          </div>
        </RadioGroup>

        {/* Expandable floor list for custom selection */}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setExpanded(!expanded)}
          className="w-full text-muted-foreground"
        >
          {expanded ? <ChevronUp className="w-4 h-4 mr-1" /> : <ChevronDown className="w-4 h-4 mr-1" />}
          {expanded ? '收起楼层列表' : '展开楼层列表'}
        </Button>

        {expanded && (
          <div className="space-y-2">
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => { onSelectionChange(new Set(messages.map((_, i) => i))); setMode('custom'); }}>
                <CheckSquare className="w-3 h-3 mr-1" />全选
              </Button>
              <Button variant="outline" size="sm" onClick={() => { onSelectionChange(new Set()); setMode('custom'); }}>
                <Square className="w-3 h-3 mr-1" />清空
              </Button>
            </div>
            <ScrollArea className="h-48 border rounded-md p-2">
              <div className="space-y-1">
                {messages.map((msg, i) => (
                  <label key={i} className="flex items-center gap-2 py-1 px-2 rounded hover:bg-accent cursor-pointer text-sm">
                    <Checkbox
                      checked={selectedIndices.has(i)}
                      onCheckedChange={() => toggleIndex(i)}
                    />
                    <span className="text-muted-foreground w-8 text-right shrink-0">#{i + 1}</span>
                    <span className={`shrink-0 text-xs px-1.5 py-0.5 rounded ${msg.role === 'user' ? 'bg-primary/10 text-primary' : 'bg-secondary text-secondary-foreground'}`}>
                      {getName(msg)}
                    </span>
                    <span className="truncate text-muted-foreground">{msg.content.slice(0, 40)}</span>
                  </label>
                ))}
              </div>
            </ScrollArea>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
