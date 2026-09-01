/**
 * 分享图生成（任务 #3）：从阅读界面一键生成带故事标题、当前段落、书名号装饰的
 * 分享图卡片，用 Capacitor Share API 调起系统分享面板或直接保存到相册。
 *
 * 手机上「分享当前阅读的这一段」是比桌面更自然的场景：躺着读到好玩的想发给朋友，
 * 或者存一张留念。桌面端的分享是「整篇导出」，手机上单段分享是移动端的专属能力。
 *
 * 实现方式：canvas 直接绘制（不依赖 html2canvas），卡片设计参考小红书/豆瓣书摘：
 * 上方段落正文，下方故事标题 + 角色名 + 楼层号水印，渐变背景 + 圆角投影。
 * 渲染完成后 canvas → blob → Capacitor Share（手机）或浏览器下载（网页端降级）。
 *
 * 入口布局：小说视图和沉浸阅读的底栏各加一个分享图标按钮（Capacitor 环境下才显示），
 * 点击后弹 ShareImageDialog 选段落 + 预览 + 生成 + 调起分享。
 */
import { useState, useRef, useEffect } from 'react';
import { Share as ShareIcon, Loader2, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { isCapacitor } from '@/lib/runtime';
import { bytesToBase64 } from '@/lib/utils';

interface ShareImageProps {
  /** 故事标题 */
  storyTitle: string;
  /** 角色名（可选，用于水印） */
  characterName?: string;
  /** 当前楼层号（用于水印「第 N 楼」） */
  currentFloor: number;
  /** 当前段落文本（作为默认分享内容） */
  currentText: string;
  /** 触发按钮的无障碍标签 */
  triggerLabel?: string;
}

/** 渐变方案：从主题色派生，需运行时解析 CSS 变量；回退到中性渐变 */
const GRADIENTS = [
  { id: 'theme-warm', label: '主题暖调', resolve: () => {
    const primary = getComputedStyle(document.documentElement).getPropertyValue('--primary-hsl').trim();
    const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent-hsl').trim();
    return { start: primary ? `hsl(${primary})` : '#667eea', end: accent ? `hsl(${accent})` : '#764ba2' };
  }},
  { id: 'theme-cool', label: '主题冷调', resolve: () => {
    const muted = getComputedStyle(document.documentElement).getPropertyValue('--muted-hsl').trim();
    const primary = getComputedStyle(document.documentElement).getPropertyValue('--primary-hsl').trim();
    return { start: muted ? `hsl(${muted})` : '#1a1a2e', end: primary ? `hsl(${primary})` : '#16213e' };
  }},
  { id: 'neutral-dark', label: '中性深色', resolve: () => ({ start: '#1a1a2e', end: '#16213e' }) },
  { id: 'neutral-light', label: '中性浅色', resolve: () => ({ start: '#e0e7ff', end: '#c7d2fe' }) },
];

export function ShareImage({
  storyTitle, characterName, currentFloor, currentText, triggerLabel = '生成分享图',
}: ShareImageProps) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(currentText);
  const [gradient, setGradient] = useState(GRADIENTS[0].id);
  const [generating, setGenerating] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (open) setText(currentText);
  }, [open, currentText]);

  const handleGenerate = async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    setGenerating(true);
    try {
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas context unavailable');

      // 卡片尺寸：3:4 比例，适合手机截图
      const width = 750;
      const height = 1000;
      canvas.width = width;
      canvas.height = height;

      // 背景渐变
      const selected = GRADIENTS.find((g) => g.id === gradient) ?? GRADIENTS[0];
      const colors = selected.resolve();
      const grad = ctx.createLinearGradient(0, 0, width, height);
      grad.addColorStop(0, colors.start);
      grad.addColorStop(1, colors.end);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, width, height);

      // 正文区域（上方 70%）
      ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
      ctx.fillRect(40, 40, width - 80, height * 0.7 - 60);

      // 正文文本：自动折行
      ctx.fillStyle = '#1a1a1a';
      ctx.font = '28px system-ui, sans-serif';
      ctx.textBaseline = 'top';
      const lines: string[] = [];
      const maxWidth = width - 120;
      const words = text.split('');
      let line = '';
      for (const char of words) {
        const testLine = line + char;
        const metrics = ctx.measureText(testLine);
        if (metrics.width > maxWidth && line.length > 0) {
          lines.push(line);
          line = char;
        } else {
          line = testLine;
        }
      }
      if (line) lines.push(line);

      const lineHeight = 40;
      const textStartY = 70;
      lines.slice(0, 14).forEach((ln, i) => {
        ctx.fillText(ln, 60, textStartY + i * lineHeight);
      });
      if (lines.length > 14) {
        ctx.fillText('…', 60, textStartY + 14 * lineHeight);
      }

      // 水印区域（下方 30%）
      const watermarkY = height * 0.7 + 20;
      ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
      ctx.font = 'bold 24px system-ui, sans-serif';
      ctx.fillText(storyTitle, 60, watermarkY);

      ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
      ctx.font = '18px system-ui, sans-serif';
      const meta = characterName ? `${characterName} · 第 ${currentFloor} 楼` : `第 ${currentFloor} 楼`;
      ctx.fillText(meta, 60, watermarkY + 40);

      // 导出
      canvas.toBlob(async (blob) => {
        if (!blob) throw new Error('Canvas export failed');
        const bytes = new Uint8Array(await blob.arrayBuffer());

        if (isCapacitor()) {
          const { Filesystem, Directory } = await import('@capacitor/filesystem');
          const { Share } = await import('@capacitor/share');
          const fileName = `share-${Date.now()}.png`;
          const { uri } = await Filesystem.writeFile({
            path: fileName,
            data: bytesToBase64(bytes),
            directory: Directory.Cache,
          });
          await Share.share({ title: '分享阅读卡片', url: uri, dialogTitle: '分享到' });
          toast({ description: '已调起分享面板' });
        } else {
          // 网页端降级：直接下载
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `${storyTitle}-${currentFloor}.png`;
          a.click();
          URL.revokeObjectURL(url);
          toast({ description: '图片已下载' });
        }

        setOpen(false);
      }, 'image/png');
    } catch (err) {
      toast({ variant: 'destructive', description: `生成失败：${err}` });
    } finally {
      setGenerating(false);
    }
  };

  if (!isCapacitor()) return null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" aria-label={triggerLabel}>
          <ShareIcon className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>生成分享图</DialogTitle>
          <DialogDescription>选择要分享的段落和背景样式</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label htmlFor="share-text">分享内容</Label>
            <Textarea
              id="share-text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={6}
              className="mt-1.5"
              placeholder="输入要分享的文字..."
            />
          </div>
          <div>
            <Label htmlFor="share-gradient">背景样式</Label>
            <Select value={gradient} onValueChange={setGradient}>
              <SelectTrigger id="share-gradient" className="mt-1.5">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {GRADIENTS.map((g) => (
                  <SelectItem key={g.id} value={g.id}>{g.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex gap-2">
            <Button onClick={handleGenerate} disabled={generating || !text.trim()} className="flex-1">
              {generating ? (
                <><Loader2 className="mr-1.5 h-4 w-4 animate-spin" />生成中...</>
              ) : (
                <><Download className="mr-1.5 h-4 w-4" />生成并分享</>
              )}
            </Button>
          </div>
        </div>
        <canvas ref={canvasRef} className="hidden" />
      </DialogContent>
    </Dialog>
  );
}
