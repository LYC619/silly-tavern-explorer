import { useState, useCallback, useEffect, useRef } from 'react';
import { Download, FileText, AlertCircle } from 'lucide-react';
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
import type { ChatMessage, ChatSession, CharacterInfo, STMetadata } from '@/types/chat';
import { extractCharacterFromPng, getCharacterName, getFirstMessage } from '@/lib/png-parser';
import { scanTxtSpeakers, parseTxtDialogue } from '@/lib/txt-import';
import { parseJsonl, parseJson, parseSTDate, isTrueSystemMessage } from '@/lib/adapters/st/chat-jsonl';

// 解析逻辑已抽至 @/lib/adapters/st/chat-jsonl（2.0 阶段0）；这里转发保持旧导入路径兼容
export { parseSTDate, isTrueSystemMessage };

export interface ImportStats {
  totalMessages: number;
  swipesRemoved: number;
  swipesBytesEstimate: number;
}

interface ChatImporterProps {
  onImport: (session: ChatSession, stats?: ImportStats) => void;
  /** 处理区入口交接来的文件：挂载后自动走一遍与手选文件相同的解析流程（阶段5） */
  initialFile?: File | null;
}

type TxtFormat = 'dialogue' | 'novel';

export function ChatImporter({ onImport, initialFile }: ChatImporterProps) {
  const { toast } = useToast();
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [txtFormatDialog, setTxtFormatDialog] = useState(false);
  const [pendingTxtFile, setPendingTxtFile] = useState<File | null>(null);
  const [txtFormat, setTxtFormat] = useState<TxtFormat>('dialogue');
  const [dialogueUserName, setDialogueUserName] = useState('User');
  /** TXT 对话导入的角色名（Assistant）。与用户名一样从文件开头预扫描自动填入，最终以输入框里的值为准 */
  const [dialogueCharName, setDialogueCharName] = useState('AI');

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

  // txtUserName/txtCharName 由确认弹窗显式传入，不读 state——useCallback 闭包里的 state 是打开弹窗前的旧值
  const processFile = useCallback(async (file: File, forceTxtFormat?: TxtFormat, txtUserName?: string, txtCharName?: string) => {
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
      // TXT 对话导入时的强制命名：user=用户选中的姓名，char=第一位非用户说话人
      let txtUser: string | undefined;
      let txtChar: string | undefined;
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
          // ponytail: 预扫描只取前两位说话人做默认值——ST 导出首楼通常是角色开场白，
          // 故第 1 位预填角色、第 2 位预填用户；猜反了用户在输入框里对调即可，最终以输入框为准。
          const speakers = scanTxtSpeakers(content);
          setDialogueCharName(speakers[0] ?? 'AI');
          setDialogueUserName(speakers[1] ?? 'User');
          setTxtFormatDialog(true);
          return;
        }
      } else if (isTxt && forceTxtFormat) {
        if (forceTxtFormat === 'dialogue') {
          txtUser = txtUserName?.trim() || 'User';
          messages = parseTxtDialogue(content, txtUser);
          txtChar = txtCharName?.trim() || scanTxtSpeakers(content).find(n => n !== txtUser);
        } else {
          messages = parseTxtNovel(content);
        }
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
        name: metadata?.character_name || txtChar || charMessages[0]?.name || 'Character',
        color: '#8B5A2B',
      };
      const user: CharacterInfo = {
        name: metadata?.user_name || txtUser || userMessages[0]?.name || 'User',
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

  // 处理区入口交接来的文件只消费一次（processFile 变化不重跑）
  const consumedInitialRef = useRef(false);
  useEffect(() => {
    if (initialFile && !consumedInitialRef.current) {
      consumedInitialRef.current = true;
      processFile(initialFile);
    }
  }, [initialFile, processFile]);

  const handleTxtFormatConfirm = () => {
    setTxtFormatDialog(false);
    if (pendingTxtFile) {
      // 把两个输入框的值显式传给解析，避免 useCallback 闭包用到旧值
      processFile(pendingTxtFile, txtFormat, dialogueUserName, dialogueCharName);
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
            <Download className={`w-8 h-8 transition-colors ${isDragging ? 'text-primary' : 'text-muted-foreground'}`} />
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
              <div className="space-y-2 pl-4 border-l-2 border-border ml-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label htmlFor="txt-user-name" className="text-xs">User 用户名（你）</Label>
                    <Input
                      id="txt-user-name"
                      value={dialogueUserName}
                      onChange={(e) => setDialogueUserName(e.target.value)}
                      placeholder="User"
                      className="h-8"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="txt-char-name" className="text-xs">Assistant 角色名</Label>
                    <Input
                      id="txt-char-name"
                      value={dialogueCharName}
                      onChange={(e) => setDialogueCharName(e.target.value)}
                      placeholder="AI"
                      className="h-8"
                    />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  已从文件开头自动识别，认反了可直接改。姓名与 User 一致的行归为用户消息，其余楼层保留原始姓名并归为角色。
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
            <Button
              onClick={handleTxtFormatConfirm}
              disabled={txtFormat === 'dialogue' && !dialogueUserName.trim()}
            >确认导入</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
