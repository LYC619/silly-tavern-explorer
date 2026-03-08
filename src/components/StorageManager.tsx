import { useState, useEffect } from 'react';
import { HardDrive, Download, Upload, Trash2, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import {
  estimateStorageUsage,
  exportFullBackup,
  importFullBackup,
  clearAllData,
  formatBytes,
} from '@/lib/storage-utils';

interface StorageManagerProps {
  onDataChanged?: () => void;
}

export function StorageManager({ onDataChanged }: StorageManagerProps) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [clearDialogOpen, setClearDialogOpen] = useState(false);
  const [storage, setStorage] = useState({ used: 0, quota: 0, percentage: 0 });
  const [loading, setLoading] = useState(false);

  const refreshStorage = async () => {
    const info = await estimateStorageUsage();
    setStorage(info);
  };

  useEffect(() => {
    if (open) refreshStorage();
  }, [open]);

  const handleExport = async () => {
    try {
      setLoading(true);
      await exportFullBackup();
      toast({ title: '备份成功', description: '已导出完整数据备份' });
    } catch (e) {
      toast({ title: '备份失败', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setLoading(true);
      const count = await importFullBackup(file);
      toast({ title: '恢复成功', description: `已导入 ${count} 本作品` });
      await refreshStorage();
      onDataChanged?.();
    } catch (err) {
      toast({
        title: '恢复失败',
        description: err instanceof Error ? err.message : '无法解析备份文件',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
      e.target.value = '';
    }
  };

  const handleClear = async () => {
    try {
      setLoading(true);
      await clearAllData();
      toast({ title: '已清空', description: '所有书架数据已删除' });
      await refreshStorage();
      onDataChanged?.();
    } catch {
      toast({ title: '清空失败', variant: 'destructive' });
    } finally {
      setLoading(false);
      setClearDialogOpen(false);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button variant="outline" size="sm" className="gap-2">
            <HardDrive className="w-4 h-4" />
            存储管理
          </Button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>存储管理</DialogTitle>
            <DialogDescription>查看存储用量，备份和恢复数据</DialogDescription>
          </DialogHeader>

          {/* Storage Usage */}
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">存储用量</span>
              <span className="font-medium">
                {formatBytes(storage.used)}
                {storage.quota > 0 && ` / ${formatBytes(storage.quota)}`}
              </span>
            </div>
            <Progress value={storage.percentage} className="h-2" />
            {storage.percentage > 80 && (
              <div className="flex items-center gap-1.5 text-xs text-destructive">
                <AlertCircle className="w-3 h-3" />
                存储空间即将用满，建议备份后清理旧数据
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="space-y-2 pt-2">
            <Button
              variant="outline"
              className="w-full justify-start gap-2"
              onClick={handleExport}
              disabled={loading}
            >
              <Download className="w-4 h-4" />
              导出完整备份
            </Button>

            <label>
              <input
                type="file"
                accept=".json"
                className="hidden"
                onChange={handleImport}
                disabled={loading}
              />
              <Button
                variant="outline"
                className="w-full justify-start gap-2 cursor-pointer"
                asChild
                disabled={loading}
              >
                <span>
                  <Upload className="w-4 h-4" />
                  从备份恢复
                </span>
              </Button>
            </label>

            <Button
              variant="outline"
              className="w-full justify-start gap-2 text-destructive hover:text-destructive"
              onClick={() => setClearDialogOpen(true)}
              disabled={loading}
            >
              <Trash2 className="w-4 h-4" />
              清空所有数据
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={clearDialogOpen} onOpenChange={setClearDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认清空所有数据</AlertDialogTitle>
            <AlertDialogDescription>
              此操作不可撤销，所有书架数据将被永久删除。建议先导出备份。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={handleClear}>确认清空</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
