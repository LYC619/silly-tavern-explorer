import { useState, useCallback } from 'react';
import { Upload, FileText, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import type { ChatMessage, ChatSession, CharacterInfo, STMetadata, STRawMessage } from '@/types/chat';

interface ChatImporterProps {
  onImport: (session: ChatSession) => void;
}

export function ChatImporter({ onImport }: ChatImporterProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parseJsonl = (content: string): { messages: ChatMessage[]; metadata?: STMetadata } => {
    const lines = content.trim().split('\n');
    const messages: ChatMessage[] = [];
    let metadata: STMetadata | undefined;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!line.trim()) continue;
      try {
        const parsed = JSON.parse(line) as STRawMessage;
        
        // 第一行通常是元数据（包含 user_name, character_name 等）
        if (i === 0 && ('user_name' in parsed || 'character_name' in parsed || 'chat_metadata' in parsed)) {
          metadata = parsed as STMetadata;
          continue;
        }
        
        // 跳过系统消息
        if (parsed.is_system) continue;
        
        // 跳过没有实际内容的消息
        const messageContent = parsed.mes || parsed.content || parsed.message || '';
        if (!messageContent) continue;
        
        const message: ChatMessage = {
          id: crypto.randomUUID(),
          role: parsed.is_user ? 'user' : 'assistant',
          content: messageContent,
          name: parsed.name || (parsed.is_user ? 'User' : 'Character'),
          timestamp: parsed.send_date 
            ? (typeof parsed.send_date === 'number' ? parsed.send_date : new Date(parsed.send_date).getTime()) 
            : undefined,
          rawData: parsed, // 保留原始数据
        };
        messages.push(message);
      } catch (e) {
        console.warn('Failed to parse line:', line);
      }
    }
    return { messages, metadata };
  };

  const parseJson = (content: string): { messages: ChatMessage[]; metadata?: STMetadata } => {
    const data = JSON.parse(content);
    
    // Handle array format
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

    // Handle object with messages array
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

  const processFile = useCallback(async (file: File) => {
    setError(null);
    
    try {
      const content = await file.text();
      let messages: ChatMessage[] = [];
      let metadata: STMetadata | undefined;

      if (file.name.endsWith('.jsonl')) {
        const result = parseJsonl(content);
        messages = result.messages;
        metadata = result.metadata;
      } else if (file.name.endsWith('.json')) {
        const result = parseJson(content);
        messages = result.messages;
        metadata = result.metadata;
      } else {
        // Try to auto-detect format
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

      if (messages.length === 0) {
        throw new Error('No valid messages found in file');
      }

      // Extract character info
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
