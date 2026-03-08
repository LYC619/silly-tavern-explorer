import { useState, useEffect } from 'react';
import { Settings, HardDrive, Download, Upload, Trash2, AlertCircle, RotateCcw, Info, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Separator } from '@/components/ui/separator';
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
import { getAllBooks } from '@/lib/bookshelf-db';
import { getAllWorldBooks } from '@/lib/worldbook-db';

const APP_VERSION = 'v0.9';
import { resetAllTours } from '@/lib/tour-steps';

interface StorageDetail {
  label: string;
  count: number;
  size: number;
  detail?: string;
}

interface GlobalSettingsProps {
  onDataChanged?: () => void;
  'data-tour'?: string;
}

export function GlobalSettings({ onDataChanged, ...props }: GlobalSettingsProps) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [clearDialogOpen, setClearDialogOpen] = useState(false);
  const [storage, setStorage] = useState({ used: 0, quota: 0, percentage: 0 });
  const [details, setDetails] = useState<StorageDetail[]>([]);
  const [loading, setLoading] = useState(false);

  const refreshStorage = async () => {
    const info = await estimateStorageUsage();
    setStorage(info);

    // Detailed breakdown
    const breakdownItems: StorageDetail[] = [];

    try {
      const books = await getAllBooks();
      let totalBookSize = 0;
      const bookDetails = books.map(b => {
        const size = new Blob([JSON.stringify(b)]).size;
        totalBookSize += size;
        return `${b.title} — ${formatBytes(size)}, ${b.session.messages.length} 条消息`;
      });
      breakdownItems.push({
        label: '书架作品',
        count: books.length,
        size: totalBookSize,
        detail: bookDetails.join('\n'),
      });
    } catch { /* ignore */ }

    try {
      const wbs = await getAllWorldBooks();
      let totalWbSize = 0;
      const wbDetails = wbs.map(wb => {
        const size = new Blob([JSON.stringify(wb)]).size;
        totalWbSize += size;
        const entryCount = wb.worldbook ? Object.keys(wb.worldbook.entries).length : 0;
        return `${wb.title} — ${formatBytes(size)}, ${entryCount} 个条目`;
      });
      breakdownItems.push({
        label: '世界书',
        count: wbs.length,
        size: totalWbSize,
        detail: wbDetails.join('\n'),
      });
    } catch { /* ignore */ }

    // Estimate localStorage usage
    let lsSize = 0;
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key) {
        lsSize += (localStorage.getItem(key) || '').length * 2; // UTF-16
      }
    }
    breakdownItems.push({
      label: 'AI 配置及缓存、正则规则、设置',
      count: localStorage.length,
      size: lsSize,
    });

    setDetails(breakdownItems);
  };

  useEffect(() => {
    if (open) refreshStorage();
  }, [open]);

  const handleExport = async () => {
    try {
      setLoading(true);
      await exportFullBackup();
      toast({ title: '备份成功', description: '已导出完整数据备份' });
    } catch {
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

  const handleResetOnboarding = () => {
    resetAllTours();
    localStorage.removeItem('st-explorer-onboarding-dismissed');
    toast({ title: '已重置', description: '下次访问各页面时将重新显示引导' });
  };

  return (
    <>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <Button variant="ghost" size="icon" className="h-8 w-8" title="设置" data-tour={props['data-tour'] || 'global-settings'}>
            <Settings className="w-4 h-4" />
          </Button>
        </SheetTrigger>
        <SheetContent className="w-[360px] sm:w-[400px] overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <Settings className="w-5 h-5" />
              设置
            </SheetTitle>
          </SheetHeader>

          <div className="space-y-6 mt-6">
            {/* Storage Overview */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <HardDrive className="w-4 h-4" />
                存储概览
              </h3>
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">总存储用量</span>
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

              {/* Detail breakdown */}
              {details.length > 0 && (
                <div className="space-y-2 text-xs">
                  {details.map((d, i) => (
                    <div key={i} className="p-2 rounded-md bg-muted/50 space-y-1">
                      <div className="flex justify-between font-medium">
                        <span>{d.label}</span>
                        <span>{d.count} 项 · {formatBytes(d.size)}</span>
                      </div>
                      {d.detail && (
                        <div className="text-muted-foreground whitespace-pre-wrap max-h-24 overflow-auto text-[11px] leading-relaxed">
                          {d.detail}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Actions */}
              <div className="space-y-2">
                <Button
                  variant="outline"
                  size="sm"
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
                    size="sm"
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
                  size="sm"
                  className="w-full justify-start gap-2 text-destructive hover:text-destructive"
                  onClick={() => setClearDialogOpen(true)}
                  disabled={loading}
                >
                  <Trash2 className="w-4 h-4" />
                  清空所有数据
                </Button>
              </div>
            </div>

            <Separator />

            {/* Help & Guidance */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <RotateCcw className="w-4 h-4" />
                引导与帮助
              </h3>
              <Button
                variant="outline"
                size="sm"
                className="w-full justify-start gap-2"
                onClick={handleResetOnboarding}
              >
                <RotateCcw className="w-4 h-4" />
                重新体验新手引导
              </Button>
              <p className="text-xs text-muted-foreground">
                版本：{APP_VERSION}
              </p>
            </div>

            <Separator />

            {/* About */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <Info className="w-4 h-4" />
                关于
              </h3>
              <div className="text-sm space-y-1">
                <p className="font-medium">ST 聊天记录处理器</p>
                <p className="text-muted-foreground text-xs">{APP_VERSION}</p>
                <a
                  href="https://github.com/LYC619/silly-tavern-explorer"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                >
                  <ExternalLink className="w-3 h-3" />
                  GitHub
                </a>
                <p className="text-xs text-muted-foreground">MIT License</p>
              </div>
            </div>
          </div>
        </SheetContent>
      </Sheet>

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
