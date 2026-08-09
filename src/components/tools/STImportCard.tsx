/**
 * SillyTavern 接入流程协调器。
 * 目录选择与导入执行留在这里，扫描选择和结果展示由独立弹窗负责。
 */
import { useState } from 'react';
import { FolderSearch, Loader2 } from 'lucide-react';
import { STImportResultDialog } from '@/components/tools/st-import/STImportResultDialog';
import { STImportSelectionDialog } from '@/components/tools/st-import/STImportSelectionDialog';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import {
  createAllImportPicks,
  createEmptyImportPicks,
  IMPORT_POLICY_SUMMARY,
  type STImportPicks,
} from '@/lib/vault/st-import-presentation';
import { importSelected, scanSTUserDir, type STImportSummary, type STScanResult } from '@/lib/vault/st-import';
import { createTauriFs, isTauri, pickDirectory, setAppConfig } from '@/lib/vault/tauri-fs';
import type { VaultFs } from '@/lib/vault/fs';

interface ScanState {
  root: string;
  fs: VaultFs;
  scan: STScanResult;
}

interface STImportCardProps {
  onChanged?: () => void;
  variant?: 'full' | 'compact';
  /** 设置页传入已保存路径时，紧凑按钮直接重扫，不再重复弹目录选择器。 */
  root?: string | null;
}

export function STImportCard({ onChanged, variant = 'full', root }: STImportCardProps) {
  const { toast } = useToast();
  const [scanning, setScanning] = useState(false);
  const [importing, setImporting] = useState(false);
  const [state, setState] = useState<ScanState | null>(null);
  const [picks, setPicks] = useState<STImportPicks>(createEmptyImportPicks());
  const [result, setResult] = useState<STImportSummary | null>(null);

  const notifyChanged = () => {
    try { onChanged?.(); } catch { /* UI 刷新不能把成功导入误报为失败 */ }
  };

  if (!isTauri()) return null;

  const handlePick = async () => {
    setScanning(true);
    try {
      const selectedRoot = root ?? await pickDirectory('选择 SillyTavern 目录（安装根目录或 data/default-user）');
      if (!selectedRoot) return;
      const fs = createTauriFs(selectedRoot);
      const scan = await scanSTUserDir(fs);
      if (!scan.characters.length && !scan.strayChats.length && !scan.worldbooks.length && !scan.presets.length
        && !scan.regex && !scan.archives.length && scan.relationships.status !== 'parsed') {
        const warningPaths = scan.warnings.slice(0, 3).map((warning) => warning.path).join('；');
        toast({
          title: scan.warnings.length ? '未发现可安全导入的内容' : '没有找到 ST 内容',
          description: scan.warnings.length
            ? `已跳过 ${scan.warnings.length} 项：${warningPaths}${scan.warnings.length > 3 ? '；…' : ''}`
            : '该目录下没有 characters / chats / worlds 等内容，确认选的是 ST 目录？',
          variant: 'destructive',
        });
        return;
      }

      await setAppConfig('stRoot', selectedRoot);
      setPicks(createAllImportPicks(scan));
      setState({ root: selectedRoot, fs, scan });
    } catch (err) {
      toast({ title: '扫描失败', description: String(err), variant: 'destructive' });
    } finally {
      setScanning(false);
    }
  };

  const handleImport = async () => {
    if (!state) return;
    setImporting(true);
    try {
      const { scan } = state;
      const summary = await importSelected(state.fs, {
        stRoot: state.root,
        characters: scan.characters.filter((character) => picks.chars.has(character.pngPath)),
        strayChats: scan.strayChats.filter((chat) => picks.strays.has(chat.path)),
        worldbooks: scan.worldbooks.filter((worldbook) => picks.wbs.has(worldbook.path)),
        presets: scan.presets.filter((preset) => picks.presets.has(preset.path)),
        regex: picks.regex ? scan.regex : null,
        archives: scan.archives.filter((group) => picks.archives.has(group.kind)),
        relationships: picks.settingsRelations ? scan.relationships : undefined,
        scanWarnings: scan.warnings,
      });
      const parts = [
        `角色 ${summary.characters}`,
        `故事 ${summary.stories}`,
        `世界书 ${summary.worldbooks}`,
        `预设 ${summary.presets}`,
      ];
      if (summary.regexes) parts.push(`正则规则集 ${summary.regexes}`);
      if (summary.archivedFiles) parts.push(`原样归档 ${summary.archivedFiles} 个文件`);
      if (summary.relationships) parts.push(`恢复关联 ${summary.relationships}`);
      if (summary.unresolvedRelationships.length) parts.push(`未解析关联 ${summary.unresolvedRelationships.length}`);
      if (summary.skipped) parts.push(`跳过已导入 ${summary.skipped}`);
      if (summary.failed) parts.push(`处理失败 ${summary.failed}`);
      toast({ title: '导入完成', description: parts.join('，') });
      setState(null);
      setResult(summary);
    } catch (err) {
      toast({ title: '导入失败', description: String(err), variant: 'destructive' });
    } finally {
      setImporting(false);
    }
  };

  const handleResultClose = () => {
    setResult(null);
    // 首页会在这里刷新。把通知延后到结果弹窗关闭，避免父级因 stRoot 已配置而卸载
    // 当前卡片，导致用户刚打开的处理明细随组件一起消失。
    notifyChanged();
  };

  return (
    <>
      {variant === 'full' ? (
        <Card className="flex flex-wrap items-center gap-3 p-4">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-secondary">
            <FolderSearch className="h-5 w-5 text-muted-foreground" />
          </div>
          <div className="min-w-0 basis-[14rem] grow">
            <p className="text-sm font-medium">接入 SillyTavern</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              指定 ST 目录，按类别选择角色、聊天、世界书、预设、正则、扩展和媒体。{IMPORT_POLICY_SUMMARY}
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={handlePick} disabled={scanning}>
            {scanning ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <FolderSearch className="mr-1 h-4 w-4" />}
            选择 ST 目录
          </Button>
        </Card>
      ) : (
        <Button variant="outline" size="sm" onClick={handlePick} disabled={scanning}>
          {scanning ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <FolderSearch className="mr-1 h-4 w-4" />}
          {root ? '重新扫描并选择' : '重新扫描 ST'}
        </Button>
      )}

      {state && (
        <STImportSelectionDialog
          root={state.root}
          scan={state.scan}
          picks={picks}
          importing={importing}
          onPicksChange={setPicks}
          onCancel={() => setState(null)}
          onImport={handleImport}
        />
      )}
      <STImportResultDialog result={result} onClose={handleResultClose} />
    </>
  );
}
