import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Trash2 } from 'lucide-react';
import type { ChatMessage } from '@/types/chat';

interface MessageEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  message: ChatMessage | null;
  onSave: (updatedMessage: ChatMessage) => void;
  onDelete?: () => void;
}

export const MessageEditDialog = ({
  open,
  onOpenChange,
  message,
  onSave,
  onDelete,
}: MessageEditDialogProps) => {
  const [content, setContent] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState<'user' | 'assistant'>('assistant');

  useEffect(() => {
    if (message) {
      setContent(message.content);
      setName(message.name || '');
      setRole(message.role === 'user' ? 'user' : 'assistant');
    }
  }, [message]);

  const handleSave = () => {
    if (!message) return;
    
    onSave({
      ...message,
      content,
      name: name || undefined,
      role,
    });
    onOpenChange(false);
  };

  if (!message) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="font-display">编辑消息 #{message.id.slice(-4)}</DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-auto space-y-4 py-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="name">说话人</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="留空使用默认名称"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="role">角色类型</Label>
              <Select value={role} onValueChange={(v) => setRole(v as 'user' | 'assistant')}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="user">用户 (User)</SelectItem>
                  <SelectItem value="assistant">角色 (Assistant)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="content">消息内容</Label>
            <Textarea
              id="content"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              className="min-h-[300px] font-mono text-sm"
              placeholder="输入消息内容..."
            />
          </div>
        </div>

        <DialogFooter className="flex justify-between">
          <div>
            {onDelete && (
              <Button
                variant="destructive"
                onClick={() => {
                  onDelete();
                  onOpenChange(false);
                }}
              >
                <Trash2 className="w-4 h-4 mr-2" />
                删除消息
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              取消
            </Button>
            <Button onClick={handleSave} disabled={!content.trim()}>
              保存
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
