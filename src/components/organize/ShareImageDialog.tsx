/**
 * 分享图预览对话框（2.0 阶段6，定稿 5.3「美化分享图」一期：总结长图）。
 * 打开即渲染（canvas → dataURL 预览），点下载导出 PNG；不上传任何数据。
 */
import { useState, useEffect } from 'react';
import { Download, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { renderShareImage, downloadCanvasPng, type ShareImageInput } from '@/lib/share-image';

interface ShareImageDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  input: ShareImageInput | null;
}

export function ShareImageDialog({ open, onOpenChange, input }: ShareImageDialogProps) {
  const { toast } = useToast();
  const [canvas, setCanvas] = useState<HTMLCanvasElement | null>(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [rendering, setRendering] = useState(false);

  useEffect(() => {
    if (!open || !input) return;
    let cancelled = false;
    setRendering(true);
    setPreviewUrl('');
    renderShareImage(input)
      .then((c) => {
        if (cancelled) return;
        setCanvas(c);
        setPreviewUrl(c.toDataURL('image/png'));
      })
      .catch((err) => {
        if (!cancelled) {
          toast({ title: '生成分享图失败', description: err instanceof Error ? err.message : '未知错误', variant: 'destructive' });
          onOpenChange(false);
        }
      })
      .finally(() => { if (!cancelled) setRendering(false); });
    return () => { cancelled = true; };
  }, [open, input]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleDownload = () => {
    if (!canvas || !input) return;
    downloadCanvasPng(canvas, `${input.storyTitle}·${input.recordTitle}·分享图`);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>分享长图</DialogTitle>
          <DialogDescription>本地生成，不上传任何数据；长图适合直接发给朋友或社交平台。</DialogDescription>
        </DialogHeader>
        <div className="flex-1 min-h-0 overflow-y-auto rounded-md border border-border bg-muted/30">
          {rendering ? (
            <div className="flex items-center justify-center py-16 text-muted-foreground gap-2 text-sm">
              <Loader2 className="w-4 h-4 animate-spin" />正在绘制…
            </div>
          ) : previewUrl ? (
            <img src={previewUrl} alt="分享图预览" className="w-full h-auto" />
          ) : null}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>关闭</Button>
          <Button onClick={handleDownload} disabled={!previewUrl} className="gap-1">
            <Download className="w-4 h-4" />下载 PNG
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
