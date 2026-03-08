import { useState, useCallback, useEffect } from 'react';
import { Upload, FileText, AlertCircle } from 'lucide-react';
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

interface ChatImporterProps {
  onImport: (session: ChatSession) => void;
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
          timestamp: parsed.send_date
            ? (typeof parsed.send_date === 'number' ? parsed.send_date : new Date(parsed.send_date).getTime())
            : undefined,
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
          timestamp: item.send_date
            ? (typeof item.send_date === 'number' ? item.send_date : new Date(item.send_date).getTime())
            : undefined,
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
          timestamp: item.send_date
            ? (typeof item.send_date === 'number' ? item.send_date : new Date(item.send_date).getTime())
            : undefined,
          rawData: item as STRawMessage,
        }))
        .filter((m: ChatMessage) => m.content);
      return { messages };
    }
    throw new Error('Unsupported JSON format');
  };

  const parseTxtDialogue = (content: string): ChatMessage[] => {
    const lines = content.split('\n').filter(l => l.trim());
    const messages: ChatMessage[] = [];
    const speakerCounts: Record<string, number> = {};

    // First pass: collect all speakers
    for (const line of lines) {
      const colonIdx = line.indexOf(':');
      if (colonIdx > 0 && colonIdx < 30) {
        const name = line.slice(0, colonIdx).trim();
        if (name) speakerCounts[name] = (speakerCounts[name] || 0) + 1;
      }
    }

    // Determine user: the speaker with the most messages, or first speaker as user
    const speakers = Object.keys(speakerCounts);
    // If only 2 speakers, use first as user convention; otherwise heuristic
    let userName = speakers[0] || 'User';
    
    for (const line of lines) {
      const colonIdx = line.indexOf(':');
      if (colonIdx > 0 && colonIdx < 30) {
        const name = line.slice(0, colonIdx).trim();
        const text = line.slice(colonIdx + 1).trim();
        if (name && text) {
          messages.push({
            id: crypto.randomUUID(),
            role: name === userName ? 'user' : 'assistant',
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
          setTxtFormatDialog(true);
          return;
        }
      } else if (isTxt && forceTxtFormat) {
        messages = forceTxtFormat === 'dialogue' ? parseTxtDialogue(content) : parseTxtNovel(content);
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

      if (messages.length === 0) throw new Error('No valid messages found in file');

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
        title: file.name.replace(/\.(jsonl?|txt)$/i, ''),
        messages,
        character,
        user,
        createdAt: Date.now(),
        rawMetadata: metadata,
      };
      onImport(session);
    } catch (e) {
      console.error('Import error:', e);
      setError(e instanceof Error ? e.message : 'Failed to parse file');
    }
  }, [onImport]);

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
              拖拽 JSONL/JSON/TXT 文件到此处，或点击选择文件
            </p>
          </div>
          <label>
            <input type="file" accept=".jsonl,.json,.txt" onChange={handleFileSelect} className="hidden" />
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
            支持 SillyTavern JSONL、JSON 格式，以及 TXT 对话/小说格式
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
              <div>
                <Label htmlFor="fmt-dialogue" className="cursor-pointer font-medium">对话格式</Label>
                <p className="text-xs text-muted-foreground mt-1">
                  每行为「角色名: 内容」格式，冒号前为说话人名称<br />
                  示例：Alice: 你好啊！
                </p>
              </div>
            </div>
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
