import { FileJson } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { applyRegexRules } from '@/lib/regex-processor';
import type { ChatSession, RegexRule, STRawMessage, STMetadata } from '@/types/chat';

interface JsonlExportButtonProps {
  session: ChatSession;
  regexRules: RegexRule[];
}

/**
 * 将 ChatSession 导出为 SillyTavern 兼容的 JSONL 格式
 * 应用正则清理后，保留原始数据结构
 */
export function JsonlExportButton({ session, regexRules }: JsonlExportButtonProps) {
  const { toast } = useToast();

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
        const cleanedContent = applyRegexRules(message.content, regexRules, isUser);
        
        // 如果清理后内容为空，跳过该消息
        if (!cleanedContent.trim()) continue;
        
        // 构建导出的消息对象
        let exportMessage: STRawMessage;
        
        if (message.rawData) {
          // 有原始数据，基于原始数据修改
          exportMessage = {
            ...message.rawData,
            mes: cleanedContent,
          };
        } else {
          // 没有原始数据，创建新的结构
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
      
      // 生成文件内容
      const content = lines.join('\n');
      
      // 创建下载
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
    <Button variant="outline" size="sm" onClick={exportAsJsonl}>
      <FileJson className="w-4 h-4 mr-2" />
      导出 JSONL
    </Button>
  );
}
