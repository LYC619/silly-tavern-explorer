import { useRef, useState } from 'react';
import { Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
} from '@/components/ui/alert-dialog';
import { parseWorldBook, type WorldBook } from '@/types/worldbook';
import { useToast } from '@/hooks/use-toast';

interface Props {
  onImport: (wb: WorldBook, filename: string) => void;
  onAppend?: (wb: WorldBook) => void;
  hasExisting?: boolean;
}

export function WorldBookImporter({ onImport, onAppend, hasExisting }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const [pendingWb, setPendingWb] = useState<{ wb: WorldBook; name: string } | null>(null);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const json = JSON.parse(text);
      const wb = parseWorldBook(json);
      const count = Object.keys(wb.entries).length;

      if (count === 0) {
        toast({ title: '导入失败', description: '未找到任何世界书条目', variant: 'destructive' });
        return;
      }

      const name = file.name.replace(/\.json$/i, '');

      if (hasExisting && onAppend) {
        setPendingWb({ wb, name });
      } else {
        onImport(wb, name);
        toast({ title: '导入成功', description: `已加载 ${count} 个条目` });
      }
    } catch {
      toast({ title: '导入失败', description: '无法解析 JSON 文件', variant: 'destructive' });
    }

    if (inputRef.current) inputRef.current.value = '';
  };

  const handleReplace = () => {
    if (!pendingWb) return;
    const count = Object.keys(pendingWb.wb.entries).length;
    onImport(pendingWb.wb, pendingWb.name);
    toast({ title: '导入成功', description: `已替换，加载 ${count} 个条目` });
    setPendingWb(null);
  };

  const handleAppend = () => {
    if (!pendingWb || !onAppend) return;
    onAppend(pendingWb.wb);
    setPendingWb(null);
  };

  return (
    <>
      <input ref={inputRef} type="file" accept=".json" className="hidden" onChange={handleFile} />
      <Button variant="outline" size="sm" onClick={() => inputRef.current?.click()}>
        <Upload className="w-4 h-4 mr-2" />
        导入世界书
      </Button>

      <AlertDialog open={!!pendingWb} onOpenChange={(open) => { if (!open) setPendingWb(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>导入方式</AlertDialogTitle>
            <AlertDialogDescription>
              当前已有世界书，新文件包含 {pendingWb ? Object.keys(pendingWb.wb.entries).length : 0} 个条目。请选择导入方式：
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col sm:flex-row gap-2">
            <AlertDialogCancel>取消</AlertDialogCancel>
            <Button variant="outline" onClick={handleReplace}>替换当前</Button>
            <Button onClick={handleAppend}>追加到当前</Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
