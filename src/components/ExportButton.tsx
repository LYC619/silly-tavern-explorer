import { useState } from 'react';
import { Download, Image, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useToast } from '@/hooks/use-toast';
import html2canvas from 'html2canvas';

interface ExportButtonProps {
  previewRef: React.RefObject<HTMLDivElement>;
  filename: string;
}

export function ExportButton({ previewRef, filename }: ExportButtonProps) {
  const [isExporting, setIsExporting] = useState(false);
  const { toast } = useToast();

  const exportAsImage = async (format: 'png' | 'jpeg') => {
    if (!previewRef.current) return;

    setIsExporting(true);
    try {
      const canvas = await html2canvas(previewRef.current, {
        backgroundColor: null,
        scale: 2,
        useCORS: true,
      });

      const link = document.createElement('a');
      link.download = `${filename}.${format}`;
      link.href = canvas.toDataURL(`image/${format}`, format === 'jpeg' ? 0.95 : undefined);
      link.click();

      toast({
        title: '导出成功',
        description: `已保存为 ${filename}.${format}`,
      });
    } catch (error) {
      console.error('Export error:', error);
      toast({
        title: '导出失败',
        description: '请稍后重试',
        variant: 'destructive',
      });
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button disabled={isExporting} className="gold-gradient text-primary-foreground">
          {isExporting ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <Download className="w-4 h-4 mr-2" />
          )}
          导出
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => exportAsImage('png')}>
          <Image className="w-4 h-4 mr-2" />
          导出为 PNG
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => exportAsImage('jpeg')}>
          <Image className="w-4 h-4 mr-2" />
          导出为 JPEG
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
