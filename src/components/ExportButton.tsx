import { useState, useMemo } from 'react';
import { Download, FileText, FileJson } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogDescription,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { applyRegexRules, convertMessagesToTxt } from '@/lib/regex-processor';
import type { ChatSession, ExportSettings, ChapterMarker, STRawMessage, STMetadata } from '@/types/chat';

interface ExportButtonProps {
  session: ChatSession;
  settings: ExportSettings;
  markers?: ChapterMarker[];
  onSettingsChange?: (settings: ExportSettings) => void;
}

const METADATA_KEEP_KEYS = [
  'chat_id_hash', 'note_prompt', 'note_interval',
  'note_position', 'note_depth', 'note_role',
  'tainted', 'variables', 'main_chat', 'timedWorldInfo'
];

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getMessagesInRange(
  messages: import('@/types/chat').ChatMessage[],
  range: ExportSettings['exportRange'],
  recentCount: number,
  customStart: number,
  customEnd: number,
) {
  if (range === 'recent') {
    return messages.slice(-recentCount);
  }
  if (range === 'custom') {
    const start = Math.max(0, customStart - 1);
    const end = Math.min(messages.length, customEnd);
    return messages.slice(start, end);
  }
  return messages;
}

export function ExportButton({ session, settings, markers = [], onSettingsChange }: ExportButtonProps) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);

  // Local settings state for dialog
  const [cleanPluginCache, setCleanPluginCache] = useState(settings.cleanPluginCache ?? true);
  const [exportRange, setExportRange] = useState<'all' | 'recent' | 'custom'>(settings.exportRange ?? 'all');
  const [recentCount, setRecentCount] = useState(settings.recentCount ?? 100);
  const [customStart, setCustomStart] = useState(settings.customStart ?? 1);
  const [customEnd, setCustomEnd] = useState(settings.customEnd ?? session.messages.length);

  const selectedMessages = useMemo(
    () => getMessagesInRange(session.messages, exportRange, recentCount, customStart, customEnd),
    [session.messages, exportRange, recentCount, customStart, customEnd]
  );

  const stats = useMemo(() => {
    const totalMessages = session.messages.length;
    const selectedCount = selectedMessages.length;
    const userCount = selectedMessages.filter(m => m.role === 'user' || m.is_user).length;
    const charCount = selectedCount - userCount;

    // Original size estimate
    const rawMetaSize = session.rawMetadata ? JSON.stringify(session.rawMetadata).length : 100;
    const rawMsgSize = selectedMessages.reduce((acc, m) => {
      return acc + JSON.stringify(m.rawData || { mes: m.content }).length;
    }, 0);
    const originalSize = rawMetaSize + rawMsgSize;

    // Estimated export size
    let estMetaSize = rawMetaSize;
    if (cleanPluginCache && session.rawMetadata?.chat_metadata) {
      const cleaned: any = {};
      for (const key of METADATA_KEEP_KEYS) {
        if (key in (session.rawMetadata.chat_metadata as any)) {
          cleaned[key] = (session.rawMetadata.chat_metadata as any)[key];
        }
      }
      estMetaSize = JSON.stringify({ ...session.rawMetadata, chat_metadata: cleaned }).length;
    }

    const estMsgSize = selectedMessages.reduce((acc, m) => {
      const isUser = m.role === 'user' || m.is_user;
      const cleanedContent = applyRegexRules(m.content, settings.regexRules, isUser);
      if (!cleanedContent.trim()) return acc;
      const base = m.rawData ? { ...m.rawData } : { mes: cleanedContent };
      (base as any).mes = cleanedContent;
      (base as any).swipes = [];
      (base as any).swipe_id = 0;
      (base as any).swipe_info = [];
      return acc + JSON.stringify(base).length;
    }, 0);
    const estimatedSize = estMetaSize + estMsgSize;

    const savings = originalSize > 0 ? Math.round((1 - estimatedSize / originalSize) * 100) : 0;

    return { totalMessages, selectedCount, userCount, charCount, originalSize, estimatedSize, savings };
  }, [selectedMessages, session, settings.regexRules, cleanPluginCache]);

  const getExportMessages = () => selectedMessages;

  const buildMetadata = (): STMetadata => {
    const metadata: STMetadata = session.rawMetadata
      ? { ...session.rawMetadata }
      : {
          user_name: session.user.name,
          character_name: session.character.name,
          create_date: new Date().toISOString().replace(/[:-]/g, '').replace('T', '@').slice(0, 17) + 's',
        };

    if (cleanPluginCache && metadata.chat_metadata) {
      const cleaned: any = {};
      for (const key of METADATA_KEEP_KEYS) {
        if (key in (metadata.chat_metadata as any)) {
          cleaned[key] = (metadata.chat_metadata as any)[key];
        }
      }
      metadata.chat_metadata = cleaned;
    }

    return metadata;
  };

  const exportAsTxt = () => {
    const msgs = getExportMessages();
    const txtContent = convertMessagesToTxt(msgs, settings.regexRules, settings.prefixMode, markers);

    const blob = new Blob([txtContent], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${session.title}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    toast({ title: '导出成功', description: `已保存为 ${session.title}.txt` });
    setOpen(false);
  };

  const exportAsJsonl = () => {
    try {
      const lines: string[] = [];
      const metadata = buildMetadata();
      lines.push(JSON.stringify(metadata));

      const msgs = getExportMessages();
      for (const message of msgs) {
        const isUser = message.role === 'user' || message.is_user;
        const cleanedContent = applyRegexRules(message.content, settings.regexRules, isUser);
        if (!cleanedContent.trim()) continue;

        let exportMessage: STRawMessage;
        if (message.rawData) {
          exportMessage = { ...message.rawData, mes: cleanedContent };
        } else {
          exportMessage = {
            name: message.name || (isUser ? session.user.name : session.character.name),
            is_user: isUser,
            is_system: false,
            send_date: message.timestamp
              ? new Date(message.timestamp).toLocaleString('en-US', {
                  month: 'long', day: 'numeric', year: 'numeric',
                  hour: 'numeric', minute: '2-digit', hour12: true,
                })
              : new Date().toLocaleString('en-US', {
                  month: 'long', day: 'numeric', year: 'numeric',
                  hour: 'numeric', minute: '2-digit', hour12: true,
                }),
            mes: cleanedContent,
            extra: {},
          };
        }

        // P0: Clean swipes
        exportMessage.swipes = [];
        exportMessage.swipe_id = 0;
        exportMessage.swipe_info = [];

        lines.push(JSON.stringify(exportMessage));
      }

      const content = lines.join('\n');
      const blob = new Blob([content], { type: 'application/jsonl;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${session.title}_cleaned.jsonl`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      toast({ title: '导出成功', description: `已保存为 ${session.title}_cleaned.jsonl` });
      setOpen(false);
    } catch (error) {
      console.error('JSONL export error:', error);
      toast({ title: '导出失败', description: '生成 JSONL 文件时出错', variant: 'destructive' });
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="gold-gradient text-primary-foreground">
          <Download className="w-4 h-4 mr-2" />
          导出
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>导出设置</DialogTitle>
          <DialogDescription>选择导出范围和清理选项</DialogDescription>
        </DialogHeader>

        {/* Stats Panel */}
        <div className="rounded-md border border-border bg-muted/50 p-3 text-xs text-muted-foreground space-y-1">
          <div className="flex justify-between">
            <span>总消息数: {stats.totalMessages} 条</span>
            <span>选中: {stats.selectedCount} 条（用户 {stats.userCount} / 角色 {stats.charCount}）</span>
          </div>
          <div className="flex justify-between">
            <span>原始大小: {formatSize(stats.originalSize)}</span>
            <span>
              预估导出: {formatSize(stats.estimatedSize)}
              {stats.savings > 0 && (
                <span className="text-primary ml-1">（节省 {stats.savings}%）</span>
              )}
            </span>
          </div>
        </div>

        {/* Range Selection */}
        <div className="space-y-3">
          <Label className="text-sm font-medium">消息范围</Label>
          <RadioGroup value={exportRange} onValueChange={(v) => setExportRange(v as any)} className="space-y-2">
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="all" id="range-all" />
              <Label htmlFor="range-all" className="font-normal cursor-pointer">全部导出</Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="recent" id="range-recent" />
              <Label htmlFor="range-recent" className="font-normal cursor-pointer">最近</Label>
              <Input
                type="number"
                min={1}
                max={session.messages.length}
                value={recentCount}
                onChange={(e) => setRecentCount(Math.max(1, parseInt(e.target.value) || 1))}
                className="w-20 h-7 text-xs"
                disabled={exportRange !== 'recent'}
              />
              <span className="text-xs text-muted-foreground">条</span>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="custom" id="range-custom" />
              <Label htmlFor="range-custom" className="font-normal cursor-pointer">自定义</Label>
              <Input
                type="number"
                min={1}
                max={session.messages.length}
                value={customStart}
                onChange={(e) => setCustomStart(Math.max(1, parseInt(e.target.value) || 1))}
                className="w-16 h-7 text-xs"
                disabled={exportRange !== 'custom'}
              />
              <span className="text-xs text-muted-foreground">~</span>
              <Input
                type="number"
                min={1}
                max={session.messages.length}
                value={customEnd}
                onChange={(e) => setCustomEnd(Math.max(1, parseInt(e.target.value) || 1))}
                className="w-16 h-7 text-xs"
                disabled={exportRange !== 'custom'}
              />
              <span className="text-xs text-muted-foreground">楼</span>
            </div>
          </RadioGroup>
        </div>

        {/* Cleanup Options */}
        <div className="flex items-center justify-between rounded-md border border-border p-3">
          <div className="space-y-0.5">
            <Label className="text-sm">清理插件缓存</Label>
            <p className="text-xs text-muted-foreground">移除插件运行时数据，减小文件体积</p>
          </div>
          <Switch checked={cleanPluginCache} onCheckedChange={setCleanPluginCache} />
        </div>

        {/* Export Buttons */}
        <div className="flex gap-2 pt-1">
          <Button variant="outline" className="flex-1" onClick={exportAsTxt}>
            <FileText className="w-4 h-4 mr-2" />
            导出为 TXT
          </Button>
          <Button className="flex-1 gold-gradient text-primary-foreground" onClick={exportAsJsonl}>
            <FileJson className="w-4 h-4 mr-2" />
            导出为 JSONL
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
