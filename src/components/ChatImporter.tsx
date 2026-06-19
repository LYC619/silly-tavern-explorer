import { useState, useCallback, useEffect } from 'react';
import { Upload, FileText, AlertCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { ChatMessage, ChatSession, CharacterInfo, STMetadata, STRawMessage } from '@/types/chat';
import { extractCharacterFromPng, getCharacterName, getFirstMessage } from '@/lib/png-parser';

/**
 * 解析 SillyTavern 的 send_date 为时间戳（毫秒）。ST 有两种字符串格式 JS 原生 Date 解析不了：
 *  1. "November 14, 2024 6:18am"        —— am/pm 紧贴小时，缺空格
 *  2. "2024-11-14 @06h 18m 30s 500ms"   —— @小时h 分m 秒s 毫秒ms
 * 解析失败返回 undefined（而非 NaN），避免显示出 Invalid Date。
 */
export function parseSTDate(value: unknown): number | undefined {
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (typeof value !== 'string' || !value.trim()) return undefined;
  const s = value.trim();

  // 格式 2： "YYYY-M-D @HHh MMm SSs MMMms"
  const m2 = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})\s*@\s*(\d{1,2})h\s*(\d{1,2})m\s*(\d{1,2})s(?:\s*(\d{1,3})ms)?/i);
  if (m2) {
    const [, y, mo, d, h, mi, se, ms] = m2;
    const t = new Date(+y, +mo - 1, +d, +h, +mi, +se, ms ? +ms : 0).getTime();
    return Number.isFinite(t) ? t : undefined;
  }

  // 格式 1：给紧贴的 am/pm 补空格后交给原生 Date（"6:18am" -> "6:18 am"）
  const normalized = s.replace(/(\d)(am|pm)\b/i, '$1 $2');
  const t = new Date(normalized).getTime();
  return Number.isFinite(t) ? t : undefined;
}

export interface ImportStats {
  totalMessages: number;
  swipesRemoved: number;
  swipesBytesEstimate: number;
}

interface ChatImporterProps {
  onImport: (session: ChatSession, stats?: ImportStats) => void;
}

type TxtFormat = 'dialogue' | 'novel';

/** Pre-scan TXT content to extract speaker names from first 20 lines */
function preScanSpeakers(content: string): { userName: string; charName: string } {
  const lines = content.split('\n').slice(0, 20);
  const names: string[] = [];
  for (const line of lines) {
    const colonIdx = line.indexOf(':');
    if (colonIdx > 0 && colonIdx < 30) {
      const name = line.slice(0, colonIdx).trim();
      if (name && !names.includes(name)) {
        names.push(name);
        if (names.length >= 2) break;
      }
    }
  }
  return {
    userName: names[0] || 'User',
    charName: names[1] || 'Character',
  };
}

export function ChatImporter({ onImport }: ChatImporterProps) {
  const { toast } = useToast();
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [txtFormatDialog, setTxtFormatDialog] = useState(false);
  const [pendingTxtFile, setPendingTxtFile] = useState<File | null>(null);
  const [txtFormat, setTxtFormat] = useState<TxtFormat>('dialogue');
  const [dialogueUserName, setDialogueUserName] = useState('User');
  const [dialogueCharName, setDialogueCharName] = useState('Character');

  const parseJsonl = (content: string): { messages: ChatMessage[]; metadata?: STMetadata } => {
    const lines = content.trim().split('\n');
    const messages: ChatMessage[] = [];
    let metadata: STMetadata | undefined;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!line.trim()) continue;
      try {
        const parsed = JSON.parse(line) as STRawMessage;
        if (i === 0 && ('user_name' in parsed || 'character_name' in parsed || 'chat_metadata' in parsed)) {
          metadata = parsed as STMetadata;
          continue;
        }
        if (parsed.is_system) continue;
        const messageContent = parsed.mes || parsed.content || parsed.message || '';
        if (!messageContent) continue;
        messages.push({
          id: crypto.randomUUID(),
          role: parsed.is_user ? 'user' : 'assistant',
          content: messageContent,
          name: parsed.name || (parsed.is_user ? 'User' : 'Character'),
          timestamp: parseSTDate(parsed.send_date),
          rawData: parsed,
        });
      } catch {
        console.warn('Failed to parse line:', line);
      }
    }
    return { messages, metadata };
  };

  const parseJson = (content: string): { messages: ChatMessage[]; metadata?: STMetadata } => {
    const data = JSON.parse(content);
    if (Array.isArray(data)) {
      const messages = data
        .filter((item: any) => !item.is_system)
        .map((item: any) => ({
          id: crypto.randomUUID(),
          role: (item.is_user || item.role === 'user' ? 'user' : 'assistant') as 'user' | 'assistant',
          content: item.mes || item.content || item.message || '',
          name: item.name || (item.is_user ? 'User' : 'Character'),
          timestamp: parseSTDate(item.send_date),
          rawData: item as STRawMessage,
        }))
        .filter((m: ChatMessage) => m.content);
      return { messages };
    }
    if (data.messages || data.chat) {
      const msgs = data.messages || data.chat;
      const messages = msgs
        .filter((item: any) => !item.is_system)
        .map((item: any) => ({
          id: crypto.randomUUID(),
          role: (item.is_user || item.role === 'user' ? 'user' : 'assistant') as 'user' | 'assistant',
          content: item.mes || item.content || item.message || '',
          name: item.name,
          timestamp: parseSTDate(item.send_date),
          rawData: item as STRawMessage,
        }))
        .filter((m: ChatMessage) => m.content);
      return { messages };
    }
    throw new Error('无法识别的 JSON 格式（应为消息数组，或含 messages / chat 字段的对象）');
  };

  const parseTxtDialogue = (content: string, userNameOverride?: string): ChatMessage[] => {
    const lines = content.split('\n').filter(l => l.trim());
    const messages: ChatMessage[] = [];
    const targetUserName = userNameOverride || 'User';
    
    for (const line of lines) {
      const colonIdx = line.indexOf(':');
      if (colonIdx > 0 && colonIdx < 30) {
        const name = line.slice(0, colonIdx).trim();
        const text = line.slice(colonIdx + 1).trim();
        // Filter attribute lines: lowercase_only names are properties, not dialogue
        if (name && text && /^[a-z_]+$/.test(name)) {
          // Attribute line — append to last message
          if (messages.length > 0) {
            messages[messages.length - 1].content += '\n' + line.trim();
          }
          continue;
        }
        if (name && text) {
          messages.push({
            id: crypto.randomUUID(),
            role: name === targetUserName ? 'user' : 'assistant',
            content: text,
            name,
          });
          continue;
        }
      }
      // Lines without colon: append to last message or create new
      if (messages.length > 0) {
        messages[messages.length - 1].content += '\n' + line.trim();
      } else {
        messages.push({
          id: crypto.randomUUID(),
          role: 'assistant',
          content: line.trim(),
          name: 'Narrator',
        });
      }
    }
    return messages;
  };

  const parseTxtNovel = (content: string): ChatMessage[] => {
    // Split by blank lines (double newline)
    const paragraphs = content.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
    return paragraphs.map(p => ({
      id: crypto.randomUUID(),
      role: 'assistant' as const,
      content: p,
      name: 'Narrator',
    }));
  };

  const processFile = useCallback(async (file: File, forceTxtFormat?: TxtFormat) => {
    setError(null);
    try {
      // Handle PNG character cards
      if (file.name.toLowerCase().endsWith('.png')) {
        const card = await extractCharacterFromPng(file);
        const charName = getCharacterName(card);
        const firstMes = getFirstMessage(card);
        const messages: ChatMessage[] = [];

        if (firstMes) {
          messages.push({
            id: crypto.randomUUID(),
            role: 'assistant',
            content: firstMes,
            name: charName,
          });
        }

        if (messages.length === 0) {
          throw new Error('角色卡中没有可导入的消息内容（无 first_mes）');
        }

        const session: ChatSession = {
          id: crypto.randomUUID(),
          title: file.name.replace(/\.png$/i, ''),
          messages,
          character: { name: charName, color: '#8B5A2B' },
          user: { name: 'User', color: '#4A90A4' },
          createdAt: Date.now(),
        };
        onImport(session, { totalMessages: messages.length, swipesRemoved: 0, swipesBytesEstimate: 0 });
        return;
      }

      const content = await file.text();
      let messages: ChatMessage[] = [];
      let metadata: STMetadata | undefined;
      const isTxt = file.name.endsWith('.txt');

      if (isTxt && !forceTxtFormat) {
        // Check if it's actually JSONL (ST exports .txt as JSONL sometimes)
        const firstLine = content.trim().split('\n')[0];
        try {
          JSON.parse(firstLine);
          // It's JSONL disguised as .txt
          const result = parseJsonl(content);
          messages = result.messages;
          metadata = result.metadata;
        } catch {
          // It's a real TXT file, ask for format
          setPendingTxtFile(file);
          // Pre-scan for speaker names
          const speakers = preScanSpeakers(content);
          setDialogueUserName(speakers.userName);
          setDialogueCharName(speakers.charName);
          setTxtFormatDialog(true);
          return;
        }
      } else if (isTxt && forceTxtFormat) {
        messages = forceTxtFormat === 'dialogue' ? parseTxtDialogue(content, dialogueUserName) : parseTxtNovel(content);
      } else if (file.name.endsWith('.jsonl')) {
        const result = parseJsonl(content);
        messages = result.messages;
        metadata = result.metadata;
      } else if (file.name.endsWith('.json')) {
        const result = parseJson(content);
        messages = result.messages;
        metadata = result.metadata;
      } else {
        // Auto-detect
        if (content.trim().startsWith('[') || content.trim().startsWith('{')) {
          const result = parseJson(content);
          messages = result.messages;
          metadata = result.metadata;
        } else {
          const result = parseJsonl(content);
          messages = result.messages;
          metadata = result.metadata;
        }
      }

      if (messages.length === 0) throw new Error('文件里没有找到可导入的消息（可能格式不符或内容为空）');

      // Compute swipes statistics
      let swipesRemoved = 0;
      let swipesBytesEstimate = 0;
      for (const msg of messages) {
        const raw = msg.rawData;
        if (raw?.swipes && raw.swipes.length > 1) {
          swipesRemoved += raw.swipes.length - 1;
          for (let i = 0; i < raw.swipes.length; i++) {
            if (i !== (raw.swipe_id ?? 0)) {
              swipesBytesEstimate += new TextEncoder().encode(raw.swipes[i]).length;
            }
          }
        }
        if (raw?.swipe_info && raw.swipe_info.length > 1) {
          swipesBytesEstimate += JSON.stringify(raw.swipe_info.slice(1)).length;
        }
      }

      const importStats: ImportStats = {
        totalMessages: messages.length,
        swipesRemoved,
        swipesBytesEstimate,
      };

      const charMessages = messages.filter(m => m.role === 'assistant');
      const userMessages = messages.filter(m => m.role === 'user');

      const character: CharacterInfo = {
        name: metadata?.character_name || charMessages[0]?.name || 'Character',
        color: '#8B5A2B',
      };
      const user: CharacterInfo = {
        name: metadata?.user_name || userMessages[0]?.name || 'User',
        color: '#4A90A4',
      };

      const session: ChatSession = {
        id: crypto.randomUUID(),
        title: file.name.replace(/\.(jsonl?|txt|png)$/i, ''),
        messages,
        character,
        user,
        createdAt: Date.now(),
        rawMetadata: metadata,
      };
      onImport(session, importStats);
    } catch (e) {
      console.error('Import error:', e);
      const msg = e instanceof Error ? e.message : '文件解析失败，请检查格式';
      setError(msg);
      toast({ title: '导入失败', description: msg, variant: 'destructive' });
    }
  }, [onImport, toast]);

  const handleTxtFormatConfirm = () => {
    setTxtFormatDialog(false);
    if (pendingTxtFile) {
      processFile(pendingTxtFile, txtFormat);
      setPendingTxtFile(null);
    }
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  }, [processFile]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  }, [processFile]);

  return (
    <>
      <Card
        className={`relative p-8 border-2 border-dashed transition-all duration-300 ${
          isDragging ? 'border-primary bg-primary/5 scale-[1.02]' : 'border-border hover:border-primary/50'
        }`}
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
      >
        <div className="flex flex-col items-center justify-center gap-4 text-center">
          <div className={`p-4 rounded-full transition-colors ${isDragging ? 'bg-primary/20' : 'bg-secondary'}`}>
            <Upload className={`w-8 h-8 transition-colors ${isDragging ? 'text-primary' : 'text-muted-foreground'}`} />
          </div>
          <div className="space-y-2">
            <h3 className="font-display text-xl font-semibold">导入聊天记录</h3>
            <p className="text-sm text-muted-foreground">
              拖拽 JSONL/JSON/TXT/PNG 文件到此处，或点击选择文件
            </p>
          </div>
          <label>
            <input type="file" accept=".jsonl,.json,.txt,.png" onChange={handleFileSelect} className="hidden" />
            <Button variant="outline" className="cursor-pointer" asChild>
              <span><FileText className="w-4 h-4 mr-2" />选择文件</span>
            </Button>
          </label>
          {error && (
            <div className="flex items-center gap-2 text-sm text-destructive animate-fade-in">
              <AlertCircle className="w-4 h-4" />{error}
            </div>
          )}
          <p className="text-xs text-muted-foreground mt-2">
            支持 SillyTavern JSONL、JSON、TXT 对话/小说格式，以及 PNG 角色卡
          </p>
        </div>
      </Card>

      {/* TXT Format Selection Dialog */}
      <Dialog open={txtFormatDialog} onOpenChange={setTxtFormatDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>选择 TXT 格式</DialogTitle>
            <DialogDescription>
              请选择该文件的格式类型，以便正确解析内容
            </DialogDescription>
          </DialogHeader>
          <RadioGroup value={txtFormat} onValueChange={(v) => setTxtFormat(v as TxtFormat)} className="space-y-4">
            <div className="flex items-start gap-3 p-3 rounded-lg border border-border hover:bg-accent/50 cursor-pointer" onClick={() => setTxtFormat('dialogue')}>
              <RadioGroupItem value="dialogue" id="fmt-dialogue" className="mt-0.5" />
              <div className="flex-1">
                <Label htmlFor="fmt-dialogue" className="cursor-pointer font-medium">对话格式</Label>
                <p className="text-xs text-muted-foreground mt-1">
                  每行为「角色名: 内容」格式，冒号前为说话人名称<br />
                  示例：Alice: 你好啊！
                </p>
              </div>
            </div>
            {txtFormat === 'dialogue' && (
              <div className="space-y-3 pl-4 border-l-2 border-border ml-3">
                <div className="space-y-1">
                  <Label className="text-xs">用户名称（匹配此名称的行设为 user）</Label>
                  <Input
                    value={dialogueUserName}
                    onChange={(e) => setDialogueUserName(e.target.value)}
                    placeholder="User"
                    className="h-8"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">角色名称（其余行设为 assistant）</Label>
                  <Input
                    value={dialogueCharName}
                    onChange={(e) => setDialogueCharName(e.target.value)}
                    placeholder="Character"
                    className="h-8"
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  已从文件前 20 行预扫描提取，可手动修改
                </p>
              </div>
            )}
            <div className="flex items-start gap-3 p-3 rounded-lg border border-border hover:bg-accent/50 cursor-pointer" onClick={() => setTxtFormat('novel')}>
              <RadioGroupItem value="novel" id="fmt-novel" className="mt-0.5" />
              <div>
                <Label htmlFor="fmt-novel" className="cursor-pointer font-medium">小说格式</Label>
                <p className="text-xs text-muted-foreground mt-1">
                  整段文本按空行分段，每段作为一条消息<br />
                  适用于纯叙述文本导入
                </p>
              </div>
            </div>
          </RadioGroup>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setTxtFormatDialog(false); setPendingTxtFile(null); }}>取消</Button>
            <Button onClick={handleTxtFormatConfirm}>确认导入</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
