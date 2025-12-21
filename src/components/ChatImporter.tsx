import { useState, useCallback } from 'react';
import { Upload, FileText, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import type { ChatMessage, ChatSession, CharacterInfo } from '@/types/chat';

interface ChatImporterProps {
  onImport: (session: ChatSession) => void;
}

export function ChatImporter({ onImport }: ChatImporterProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parseJsonl = (content: string): ChatMessage[] => {
    const lines = content.trim().split('\n');
    const messages: ChatMessage[] = [];

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const parsed = JSON.parse(line);
        // SillyTavern JSONL format adaptation
        const message: ChatMessage = {
          id: crypto.randomUUID(),
          role: parsed.is_user ? 'user' : 'assistant',
          content: parsed.mes || parsed.content || parsed.message || '',
          name: parsed.name || (parsed.is_user ? 'User' : 'Character'),
          timestamp: parsed.send_date ? new Date(parsed.send_date).getTime() : Date.now(),
        };
        if (message.content) {
          messages.push(message);
        }
      } catch (e) {
        console.warn('Failed to parse line:', line);
      }
    }
    return messages;
  };

  const parseJson = (content: string): ChatMessage[] => {
    const data = JSON.parse(content);
    
    // Handle array format
    if (Array.isArray(data)) {
      return data.map((item, index) => ({
        id: crypto.randomUUID(),
        role: (item.is_user || item.role === 'user' ? 'user' : 'assistant') as 'user' | 'assistant',
        content: item.mes || item.content || item.message || '',
        name: item.name || (item.is_user ? 'User' : 'Character'),
        timestamp: item.send_date ? new Date(item.send_date).getTime() : Date.now() + index,
      })).filter(m => m.content);
    }

    // Handle object with messages array
    if (data.messages || data.chat) {
      const msgs = data.messages || data.chat;
      return msgs.map((item: any, index: number) => ({
        id: crypto.randomUUID(),
        role: (item.is_user || item.role === 'user' ? 'user' : 'assistant') as 'user' | 'assistant',
        content: item.mes || item.content || item.message || '',
        name: item.name,
        timestamp: item.send_date ? new Date(item.send_date).getTime() : Date.now() + index,
      })).filter((m: ChatMessage) => m.content);
    }

    throw new Error('Unsupported JSON format');
  };

  const processFile = useCallback(async (file: File) => {
    setError(null);
    
    try {
      const content = await file.text();
      let messages: ChatMessage[] = [];

      if (file.name.endsWith('.jsonl')) {
        messages = parseJsonl(content);
      } else if (file.name.endsWith('.json')) {
        messages = parseJson(content);
      } else {
        // Try to auto-detect format
        if (content.trim().startsWith('[') || content.trim().startsWith('{')) {
          messages = parseJson(content);
        } else {
          messages = parseJsonl(content);
        }
      }

      if (messages.length === 0) {
        throw new Error('No valid messages found in file');
      }

      // Extract character info
      const charMessages = messages.filter(m => m.role === 'assistant');
      const userMessages = messages.filter(m => m.role === 'user');
      
      const character: CharacterInfo = {
        name: charMessages[0]?.name || 'Character',
        color: '#8B5A2B',
      };

      const user: CharacterInfo = {
        name: userMessages[0]?.name || 'User',
        color: '#4A90A4',
      };

      const session: ChatSession = {
        id: crypto.randomUUID(),
        title: file.name.replace(/\.(jsonl?|txt)$/i, ''),
        messages,
        character,
        user,
        createdAt: Date.now(),
      };

      onImport(session);
    } catch (e) {
      console.error('Import error:', e);
      setError(e instanceof Error ? e.message : 'Failed to parse file');
    }
  }, [onImport]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    const file = e.dataTransfer.files[0];
    if (file) {
      processFile(file);
    }
  }, [processFile]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processFile(file);
    }
  }, [processFile]);

  return (
    <Card 
      className={`relative p-8 border-2 border-dashed transition-all duration-300 ${
        isDragging 
          ? 'border-primary bg-primary/5 scale-[1.02]' 
          : 'border-border hover:border-primary/50'
      }`}
      onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleDrop}
    >
      <div className="flex flex-col items-center justify-center gap-4 text-center">
        <div className={`p-4 rounded-full transition-colors ${
          isDragging ? 'bg-primary/20' : 'bg-secondary'
        }`}>
          <Upload className={`w-8 h-8 transition-colors ${
            isDragging ? 'text-primary' : 'text-muted-foreground'
          }`} />
        </div>
        
        <div className="space-y-2">
          <h3 className="font-display text-xl font-semibold">导入聊天记录</h3>
          <p className="text-sm text-muted-foreground">
            拖拽 JSONL/JSON 文件到此处，或点击选择文件
          </p>
        </div>

        <label>
          <input
            type="file"
            accept=".jsonl,.json,.txt"
            onChange={handleFileSelect}
            className="hidden"
          />
          <Button variant="outline" className="cursor-pointer" asChild>
            <span>
              <FileText className="w-4 h-4 mr-2" />
              选择文件
            </span>
          </Button>
        </label>

        {error && (
          <div className="flex items-center gap-2 text-sm text-destructive animate-fade-in">
            <AlertCircle className="w-4 h-4" />
            {error}
          </div>
        )}

        <p className="text-xs text-muted-foreground mt-2">
          支持 SillyTavern 导出的 JSONL 格式
        </p>
      </div>
    </Card>
  );
}
