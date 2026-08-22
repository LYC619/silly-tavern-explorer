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
import type { WorldBook } from '@/types/worldbook';
import { useToast } from '@/hooks/use-toast';
import { readWorldBookUpload } from '@/lib/worldbook-file-import';

interface Props {
  onImport: (wb: WorldBook, filename: string, sourceModifiedAt?: number) => void;
  onAppend?: (wb: WorldBook) => void;
  hasExisting?: boolean;
}

export function WorldBookImporter({ onImport, onAppend, hasExisting }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const [pendingWb, setPendingWb] = useState<{ wb: WorldBook; name: string; sourceModifiedAt?: number } | null>(null);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const upload = await readWorldBookUpload(file);
      const count = Object.keys(upload.worldbook.entries).length;

      if (hasExisting && onAppend) {
        setPendingWb({ wb: upload.worldbook, name: upload.title, sourceModifiedAt: upload.sourceModifiedAt });
      } else {
        onImport(upload.worldbook, upload.title, upload.sourceModifiedAt);
        toast({ title: '导入成功', description: `已加载 ${count} 个条目` });
      }
    } catch {
      toast({ title: '导入失败', description: '无法解析 JSON 文件', variant: 'destructive' });
    } finally {
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const handleReplace = () => {
    if (!pendingWb) return;
    const count = Object.keys(pendingWb.wb.entries).length;
    onImport(pendingWb.wb, pendingWb.name, pendingWb.sourceModifiedAt);
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
        导入
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
