import { Download, FileText, FileJson } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useToast } from '@/hooks/use-toast';
import { applyRegexRules, convertMessagesToTxt } from '@/lib/regex-processor';
import type { ChatSession, ExportSettings, ChapterMarker, STRawMessage, STMetadata } from '@/types/chat';

interface ExportButtonProps {
  session: ChatSession;
  settings: ExportSettings;
  markers?: ChapterMarker[];
}

export function ExportButton({ session, settings, markers = [] }: ExportButtonProps) {
  const { toast } = useToast();

  const exportAsTxt = () => {
    const txtContent = convertMessagesToTxt(
      session.messages,
      settings.regexRules,
      settings.prefixMode,
      markers
    );

    const blob = new Blob([txtContent], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `${session.title}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    toast({
      title: '导出成功',
      description: `已保存为 ${session.title}.txt`,
    });
  };

  const exportAsJsonl = () => {
    try {
      const lines: string[] = [];
      
      // 第一行：元数据
      const metadata: STMetadata = session.rawMetadata 
        ? { ...session.rawMetadata }
        : {
            user_name: session.user.name,
            character_name: session.character.name,
            create_date: new Date().toISOString().replace(/[:-]/g, '').replace('T', '@').slice(0, 17) + 's',
          };
      
      lines.push(JSON.stringify(metadata));
      
      // 处理每条消息
      for (const message of session.messages) {
        const isUser = message.role === 'user' || message.is_user;
        
        // 应用正则规则清理内容
        const cleanedContent = applyRegexRules(message.content, settings.regexRules, isUser);
        
        // 如果清理后内容为空，跳过该消息
        if (!cleanedContent.trim()) continue;
        
        // 构建导出的消息对象
        let exportMessage: STRawMessage;
        
        if (message.rawData) {
          exportMessage = {
            ...message.rawData,
            mes: cleanedContent,
          };
        } else {
          exportMessage = {
            name: message.name || (isUser ? session.user.name : session.character.name),
            is_user: isUser,
            is_system: false,
            send_date: message.timestamp 
              ? new Date(message.timestamp).toLocaleString('en-US', {
                  month: 'long',
                  day: 'numeric',
                  year: 'numeric',
                  hour: 'numeric',
                  minute: '2-digit',
                  hour12: true,
                })
              : new Date().toLocaleString('en-US', {
                  month: 'long',
                  day: 'numeric',
                  year: 'numeric',
                  hour: 'numeric',
                  minute: '2-digit',
                  hour12: true,
                }),
            mes: cleanedContent,
            extra: {},
          };
        }
        
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
      
      toast({
        title: '导出成功',
        description: `已保存为 ${session.title}_cleaned.jsonl`,
      });
    } catch (error) {
      console.error('JSONL export error:', error);
      toast({
        title: '导出失败',
        description: '生成 JSONL 文件时出错',
        variant: 'destructive',
      });
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button className="gold-gradient text-primary-foreground">
          <Download className="w-4 h-4 mr-2" />
          导出
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={exportAsTxt}>
          <FileText className="w-4 h-4 mr-2" />
          导出为 TXT
        </DropdownMenuItem>
        <DropdownMenuItem onClick={exportAsJsonl}>
          <FileJson className="w-4 h-4 mr-2" />
          导出为 JSONL
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
