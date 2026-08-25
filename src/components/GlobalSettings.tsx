import { useState, useEffect } from 'react';
import { HardDrive, Download, Upload, Trash2, AlertCircle, RotateCcw, Info, ExternalLink, Eraser } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
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
  parseBackupFile,
  previewBackup,
  importBackup,
  clearAllData,
  formatBytes,
  type ParsedBackup,
  type BackupPreview,
} from '@/lib/storage-utils';
import { clearAllTempCache } from '@/lib/session-storage';
import { getAllCharacters, getAllArchiveStories } from '@/lib/archive-db';
import { getAllWorldBooks } from '@/lib/worldbook-db';
import { resetAllTours } from '@/lib/tour-steps';

export const APP_VERSION = 'v0.9.0';

interface StorageDetail {
  label: string;
  count: number;
  size: number;
  detail?: string;
}

interface DataSettingsPanelProps {
  onDataChanged?: () => void;
}

/**
 * 数据与存储面板（阶段9.9 从顶栏 Sheet 弹窗改造为设置页的一个区块）。
 */
export function DataSettingsPanel({ onDataChanged }: DataSettingsPanelProps) {
  const { toast } = useToast();
  const [clearDialogOpen, setClearDialogOpen] = useState(false);
  const [pendingImport, setPendingImport] = useState<{ parsed: ParsedBackup; preview: BackupPreview } | null>(null);
  const [storage, setStorage] = useState({ used: 0, quota: 0, percentage: 0 });
  const [details, setDetails] = useState<StorageDetail[]>([]);
  const [loading, setLoading] = useState(false);

  const refreshStorage = async () => {
    const info = await estimateStorageUsage();
    setStorage(info);

    // Detailed breakdown
    const breakdownItems: StorageDetail[] = [];

    try {
      const characters = await getAllCharacters();
      let totalCharSize = 0;
      const charDetails = characters.map(c => {
        const size = new Blob([JSON.stringify(c)]).size;
        totalCharSize += size;
        return `${c.name} — ${formatBytes(size)}`;
      });
      breakdownItems.push({
        label: '角色档案',
        count: characters.length,
        size: totalCharSize,
        detail: charDetails.join('\n'),
      });
    } catch { /* ignore */ }

    try {
      const stories = await getAllArchiveStories();
      let totalStorySize = 0;
      const storyDetails = stories.map(s => {
        const size = new Blob([JSON.stringify(s)]).size;
        totalStorySize += size;
        const branchNote = s.branches?.length ? `，${s.branches.length} 条分支` : '';
        return `${s.title} — ${formatBytes(size)}, ${s.session.messages.length} 楼${branchNote}`;
      });
      breakdownItems.push({
        label: '归档故事',
        count: stories.length,
        size: totalStorySize,
        detail: storyDetails.join('\n'),
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
    refreshStorage();
  }, []);

  const handleExport = async () => {
    try {
      setLoading(true);
      await exportFullBackup();
      toast({ title: '备份成功', description: '已导出完整备份（角色/故事/世界书/预设/正则/总结/故事树）' });
    } catch {
      toast({ title: '备份失败', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  // 第一步：仅解析+校验，算出将新增/覆盖/跳过什么，弹预览让用户确认（不写库）
  const handleSelectImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // 允许连续选同一文件
    if (!file) return;
    try {
      setLoading(true);
      const parsed = await parseBackupFile(file);
      const preview = await previewBackup(parsed);
      setPendingImport({ parsed, preview });
    } catch (err) {
      toast({
        title: '无法读取备份文件',
        description: err instanceof Error ? err.message : '文件校验未通过',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  // 第二步：用户确认后原子写回（单事务，失败整体回滚，不会写坏现有库）
  const confirmImport = async () => {
    if (!pendingImport) return;
    try {
      setLoading(true);
      const c = await importBackup(pendingImport.parsed);
      const parts: string[] = [];
      if (c.characters > 0) parts.push(`${c.characters} 个角色`);
      if (c.archiveStories > 0) parts.push(`${c.archiveStories} 个故事`);
      if (c.worldbooks > 0) parts.push(`${c.worldbooks} 本世界书`);
      if (c.presets > 0) parts.push(`${c.presets} 份预设`);
      if (c.cards > 0) parts.push(`${c.cards} 张角色卡`);
      if (c.regexes > 0) parts.push(`${c.regexes} 套正则`);
      if (c.summaries > 0) parts.push(`${c.summaries} 份总结`);
      if (c.summaryTemplates > 0) parts.push(`${c.summaryTemplates} 个总结模板`);
      if (c.stories > 0) parts.push(`${c.stories} 棵故事树`);
      toast({
        title: '恢复成功',
        description: parts.length ? `已写入 ${parts.join('、')}` : '备份中没有可导入的数据',
      });
      await refreshStorage();
      onDataChanged?.();
    } catch (err) {
      toast({
        title: '恢复失败',
        description: err instanceof Error ? err.message : '写入失败，现有数据未改动',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
      setPendingImport(null);
    }
  };

  const handleClear = async () => {
    try {
      setLoading(true);
      await clearAllData();
      toast({ title: '已清空', description: '所有本地数据已删除（角色/故事/世界书/预设/正则/总结）' });
      await refreshStorage();
      onDataChanged?.();
    } catch {
      toast({ title: '清空失败', variant: 'destructive' });
    } finally {
      setLoading(false);
      setClearDialogOpen(false);
    }
  };

  const handleClearTempCache = () => {
    clearAllTempCache();
    toast({
      title: '已清除临时缓存',
      description: '页面间的临时编辑态已清空（角色库与故事等已保存数据不受影响）。重新进入对应页面即可。',
    });
    refreshStorage();
  };

  return (
    <>
      <div className="space-y-6">
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
                  <Upload className="w-4 h-4" />
                  导出完整备份
                </Button>

                <label>
                  <input
                    type="file"
                    accept=".json"
                    className="hidden"
                    onChange={handleSelectImportFile}
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
                      <Download className="w-4 h-4" />
                      从备份恢复
                    </span>
                  </Button>
                </label>

                <Button
                  variant="outline"
                  size="sm"
                  className="w-full justify-start gap-2"
                  onClick={handleClearTempCache}
                  disabled={loading}
                >
                  <Eraser className="w-4 h-4" />
                  清除临时缓存
                </Button>

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
              <p className="text-xs text-muted-foreground leading-relaxed">
                「清除临时缓存」只清页面间的临时编辑态，常用于切页后内容异常时自救，不影响已保存数据；
                「清空所有数据」会永久删除全部角色、故事、世界书、预设、正则与总结，请先备份。
              </p>
            </div>

      </div>

      {/* 恢复备份前的预览确认：先看清将新增/覆盖什么，再决定写不写 */}
      <AlertDialog open={!!pendingImport} onOpenChange={(v) => { if (!v) setPendingImport(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认恢复备份</AlertDialogTitle>
            <AlertDialogDescription>
              按 id 合并写入：下方「覆盖」的条目会用备份内容替换当前同 id 记录，其余现有数据保留不动。整个过程要么全部成功、要么全部不改（失败自动回滚）。
            </AlertDialogDescription>
          </AlertDialogHeader>

          {pendingImport && (
            <div className="space-y-2">
              {pendingImport.preview.exportedAt && (
                <p className="text-xs text-muted-foreground">
                  备份导出于 {new Date(pendingImport.preview.exportedAt).toLocaleString()}
                </p>
              )}
              <div className="space-y-1.5 text-xs max-h-56 overflow-auto">
                {pendingImport.preview.stores
                  .filter((s) => s.add + s.overwrite + s.skipped > 0)
                  .map((s) => (
                    <div key={s.key} className="flex items-center justify-between rounded-md bg-muted/50 px-2 py-1.5">
                      <span className="font-medium">{s.label}</span>
                      <span className="flex gap-2.5">
                        {s.add > 0 && <span className="text-[color:var(--status-ok)]">新增 {s.add}</span>}
                        {s.overwrite > 0 && <span className="text-[color:var(--status-warn)]">覆盖 {s.overwrite}</span>}
                        {s.skipped > 0 && <span className="text-muted-foreground">跳过 {s.skipped}</span>}
                      </span>
                    </div>
                  ))}
                {pendingImport.preview.totalAdd + pendingImport.preview.totalOverwrite + pendingImport.preview.totalSkipped === 0 && (
                  <p className="text-muted-foreground">备份中没有可导入的有效数据。</p>
                )}
              </div>
              {pendingImport.preview.totalOverwrite > 0 && (
                <div className="flex items-start gap-1.5 text-xs text-[color:var(--status-warn)]">
                  <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                  <span>将覆盖 {pendingImport.preview.totalOverwrite} 条现有记录（同 id）。如需保险，可先取消、「导出完整备份」留档后再恢复。</span>
                </div>
              )}
            </div>
          )}

          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmImport}
              disabled={!pendingImport || pendingImport.preview.totalAdd + pendingImport.preview.totalOverwrite === 0}
            >
              确认恢复
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={clearDialogOpen} onOpenChange={setClearDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认清空所有数据</AlertDialogTitle>
            <AlertDialogDescription>
              此操作不可撤销，所有本地数据（角色/故事/世界书/预设/正则/总结）将被永久删除。建议先导出备份。
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

export function AboutSettingsPanel() {
  const { toast } = useToast();

  const handleResetOnboarding = () => {
    resetAllTours();
    localStorage.removeItem('st-explorer-onboarding-dismissed');
    toast({ title: '已重置', description: '下次访问各页面时将重新显示引导' });
  };

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <RotateCcw className="w-4 h-4" />
          引导与帮助
        </h3>
        <Button
          variant="outline"
          size="sm"
          className="justify-start gap-2"
          onClick={handleResetOnboarding}
        >
          <RotateCcw className="w-4 h-4" />
          重新体验新手引导
        </Button>
      </section>

      <section className="space-y-3 border-t border-border pt-5">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <Info className="w-4 h-4" />
          关于
        </h3>
        <div className="text-sm space-y-1">
          <p className="font-medium">ST Explorer</p>
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
          <p className="text-xs text-muted-foreground">AGPL-3.0-only</p>
        </div>
      </section>
    </div>
  );
}
