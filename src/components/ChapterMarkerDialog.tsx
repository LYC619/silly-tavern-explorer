import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import type { ChapterMarker } from '@/types/chat';

interface ChapterMarkerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  messageIndex: number;
  messageId: string;
  existingMarker?: ChapterMarker;
  onSave: (marker: ChapterMarker) => void;
  onDelete?: () => void;
}

export function ChapterMarkerDialog({
  open,
  onOpenChange,
  messageIndex,
  messageId,
  existingMarker,
  onSave,
  onDelete,
}: ChapterMarkerDialogProps) {
  const [title, setTitle] = useState('');
  const [volume, setVolume] = useState('');
  const [summary, setSummary] = useState('');

  useEffect(() => {
    if (existingMarker) {
      setTitle(existingMarker.title);
      setVolume(existingMarker.volume || '');
      setSummary(existingMarker.summary || '');
    } else {
      setTitle(`第 ${messageIndex + 1} 楼`);
      setVolume('');
      setSummary('');
    }
  }, [existingMarker, messageIndex, open]);

  const handleSave = () => {
    onSave({
      messageId,
      messageIndex,
      title,
      volume: volume || undefined,
      summary: summary || undefined,
      createdAt: existingMarker?.createdAt || Date.now(),
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display">
            {existingMarker ? '编辑章节标记' : '添加章节标记'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="text-sm text-muted-foreground">
            标记位置：第 {messageIndex + 1} 楼
          </div>

          <div className="space-y-2">
            <Label htmlFor="volume">卷名（可选）</Label>
            <Input
              id="volume"
              placeholder="例：第一卷 - 初遇"
              value={volume}
              onChange={(e) => setVolume(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="title">章节标题</Label>
            <Input
              id="title"
              placeholder="例：命运的相遇"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="summary">章节概要（可选）</Label>
            <Textarea
              id="summary"
              placeholder="简要描述这一章节的内容..."
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              rows={3}
            />
          </div>
        </div>

        <DialogFooter className="flex gap-2">
          {existingMarker && onDelete && (
            <Button
              variant="destructive"
              onClick={() => {
                onDelete();
                onOpenChange(false);
              }}
              className="mr-auto"
            >
              删除标记
            </Button>
          )}
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button onClick={handleSave} disabled={!title.trim()}>
            保存
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}