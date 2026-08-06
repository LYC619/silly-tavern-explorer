import { useCallback, useEffect, useState } from 'react';
import { Check, Eye, FolderOpen, FolderSearch, KeyRound, Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { getNsfwBlur, setNsfwBlur } from '@/lib/local-settings';
import { chooseVaultRoot } from '@/lib/vault/bootstrap';
import {
  createTauriFs,
  getAppConfig,
  getVaultRoot,
  isTauri,
  pickDirectory,
  setAppConfig,
} from '@/lib/vault/tauri-fs';
import { scanSTUserDir, type STScanResult } from '@/lib/vault/st-import';
import { STAIConfigDialog } from '@/components/tools/STAIConfigDialog';

interface STCounts {
  characters: number;
  chats: number;
  worldbooks: number;
  presets: number;
  regexes: number;
}

function scanCounts(scan: STScanResult): STCounts {
  return {
    characters: scan.characters.length,
    chats: scan.characters.reduce((total, character) => total + character.chats.length, 0) + scan.strayChats.length,
    worldbooks: scan.worldbooks.length,
    presets: scan.presets.length,
    regexes: scan.regex?.count ?? 0,
  };
}

function hasSTContent(counts: STCounts): boolean {
  return Object.values(counts).some((count) => count > 0);
}

export function RuntimeSettingsPanel() {
  const { toast } = useToast();
  const client = isTauri();
  const [blurNsfw, setBlurNsfw] = useState(() => getNsfwBlur());
  const [stRoot, setStRoot] = useState<string | null>(null);
  const [vaultRoot, setVaultRootState] = useState<string | null>(null);
  const [stCounts, setStCounts] = useState<STCounts | null>(null);
  const [busy, setBusy] = useState<'st' | 'vault' | null>(null);
  const [stConfigOpen, setStConfigOpen] = useState(false);

  const refreshPaths = useCallback(async () => {
    if (!client) return;
    const [nextStRoot, nextVaultRoot] = await Promise.all([
      getAppConfig<string>('stRoot').catch(() => null),
      getVaultRoot().catch(() => null),
    ]);
    setStRoot(nextStRoot);
    setVaultRootState(nextVaultRoot);
  }, [client]);

  useEffect(() => { void refreshPaths(); }, [refreshPaths]);

  const handleBlurChange = (checked: boolean) => {
    setBlurNsfw(checked);
    setNsfwBlur(checked);
  };

  const handleChangeStRoot = async () => {
    if (!client) return;
    setBusy('st');
    try {
      const root = await pickDirectory('选择 SillyTavern 目录（安装根目录或 data/default-user）');
      if (!root) return;
      const scan = await scanSTUserDir(createTauriFs(root));
      const counts = scanCounts(scan);
      if (!hasSTContent(counts)) {
        toast({
          title: '没有找到 ST 内容',
          description: '该目录下没有可识别的角色卡、聊天、世界书、预设或正则。',
          variant: 'destructive',
        });
        return;
      }
      await setAppConfig('stRoot', root);
      setStRoot(root);
      setStCounts(counts);
      toast({
        title: 'ST 目录已更新',
        description: `找到 ${counts.characters} 张角色卡、${counts.chats} 场聊天、${counts.worldbooks} 本世界书。`,
      });
    } catch (error) {
      toast({
        title: '更新 ST 目录失败',
        description: error instanceof Error ? error.message : '无法读取所选目录',
        variant: 'destructive',
      });
    } finally {
      setBusy(null);
    }
  };

  const handleChangeVaultRoot = async () => {
    if (!client) return;
    setBusy('vault');
    try {
      const picked = await chooseVaultRoot();
      if (!picked) return;
      setVaultRootState(picked);
      toast({ title: '库目录已切换', description: '应用将重新载入并使用新目录；旧目录不会自动迁移或修改。' });
      window.location.reload();
    } catch (error) {
      toast({
        title: '切换库目录失败',
        description: error instanceof Error ? error.message : '无法激活所选目录',
        variant: 'destructive',
      });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-4">
      <section className="rounded-md border border-border p-4 space-y-3">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3 min-w-0">
            <Eye className="w-4 h-4 mt-0.5 text-primary shrink-0" />
            <div className="min-w-0">
              <h3 className="text-sm font-semibold">显示偏好</h3>
              <p className="text-xs text-muted-foreground mt-1">角色卡面标记为 NSFW 时，列表和详情默认模糊。</p>
            </div>
          </div>
          <Switch
            checked={blurNsfw}
            onCheckedChange={handleBlurChange}
            aria-label="默认模糊 NSFW 卡面"
          />
        </div>
      </section>

      <section className="rounded-md border border-border p-4 space-y-3">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3 min-w-0">
            <FolderSearch className="w-4 h-4 mt-0.5 text-primary shrink-0" />
            <div className="min-w-0">
              <h3 className="text-sm font-semibold">SillyTavern 目录</h3>
              <p className="text-xs text-muted-foreground mt-1">
                {stRoot ? '已接入，可重新选择目录扫描最新内容。' : '尚未接入 SillyTavern 目录。'}
              </p>
            </div>
          </div>
          {stRoot && <Check className="w-4 h-4 text-primary shrink-0" aria-label="已接入" />}
        </div>
        {stRoot && <p className="text-xs break-all rounded bg-muted/50 px-2.5 py-2">{stRoot}</p>}
        {stCounts && (
          <p className="text-xs text-muted-foreground">
            最近扫描：{stCounts.characters} 张角色卡 · {stCounts.chats} 场聊天 · {stCounts.worldbooks} 本世界书 · {stCounts.presets} 份预设 · {stCounts.regexes} 条正则
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={handleChangeStRoot} disabled={!client || busy !== null}>
            {busy === 'st' ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <FolderOpen className="w-4 h-4 mr-1.5" />}
            {stRoot ? '更换 ST 目录' : '选择 ST 目录'}
          </Button>
          {client && stRoot && (
            <Button variant="ghost" size="sm" onClick={() => setStConfigOpen(true)}>
              <KeyRound className="w-4 h-4 mr-1.5" />
              查看 ST 配置
            </Button>
          )}
          {!client && <span className="text-xs text-muted-foreground self-center">网页版无法读取本机 ST 目录</span>}
        </div>
      </section>

      <section className="rounded-md border border-border p-4 space-y-3">
        <div className="flex items-start gap-3 min-w-0">
          <FolderOpen className="w-4 h-4 mt-0.5 text-primary shrink-0" />
          <div className="min-w-0">
            <h3 className="text-sm font-semibold">STE 库目录</h3>
            <p className="text-xs text-muted-foreground mt-1">
              客户端当前使用的业务数据目录。切换只改变当前库，不自动迁移旧目录内容。
            </p>
          </div>
        </div>
        {vaultRoot && <p className="text-xs break-all rounded bg-muted/50 px-2.5 py-2">{vaultRoot}</p>}
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleChangeVaultRoot} disabled={!client || busy !== null}>
            {busy === 'vault' ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-1.5" />}
            更换库目录
          </Button>
          {!client && <span className="text-xs text-muted-foreground">网页版使用浏览器本地存储</span>}
        </div>
      </section>

      {client && <STAIConfigDialog open={stConfigOpen} onOpenChange={setStConfigOpen} />}
    </div>
  );
}
