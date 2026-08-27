// 「用通用配置 / 本库单独配置」开关（发布前一轮）。
// 客户端整个应用跑在一个 webview origin 上，API 配置默认跨库共享；
// 想让某个库用自己的密钥（或从零开始测一遍配置流程）就打开这个开关。
import { useCallback, useEffect, useState } from 'react';
import { Loader2, Library } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { isTauri } from '@/lib/vault/tauri-fs';
import { getApiConfigScope, setApiConfigScope } from '@/lib/vault/sensitive-config';
import { getCurrentVaultId } from '@/lib/vault/vault-scope';

interface ApiScopeToggleProps {
  /** 切换成功后重载表单：localStorage 里已经换成另一套配置了。 */
  onChanged: () => void;
}

export function ApiScopeToggle({ onChanged }: ApiScopeToggleProps) {
  const { toast } = useToast();
  const [perVault, setPerVault] = useState(false);
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!isTauri()) return;
    let alive = true;
    void getApiConfigScope().then((scope) => {
      if (alive) {
        setPerVault(scope === 'vault');
        setReady(true);
      }
    });
    return () => { alive = false; };
  }, []);

  const handleChange = useCallback(async (checked: boolean) => {
    setBusy(true);
    try {
      await setApiConfigScope(checked ? 'vault' : 'shared');
      setPerVault(checked);
      onChanged();
      toast({
        title: checked ? '已改为本库单独配置' : '已改回通用配置',
        description: checked
          ? '当前配置已复制到本库，之后在这里的修改不再影响其它库'
          : '本库改用所有库共享的那份配置（本库单独的那份仍保留，随时可切回）',
      });
    } catch (err) {
      toast({
        title: '切换失败',
        description: err instanceof Error ? err.message : '请稍后重试',
        variant: 'destructive',
      });
    } finally {
      setBusy(false);
    }
  }, [onChanged, toast]);

  // 网页版只有一个库，没有可隔离的对象；未选库时（引导阶段）也没有可写入的库 id。
  if (!isTauri() || !getCurrentVaultId()) return null;

  return (
    <div className="flex items-start justify-between gap-4 rounded-md border border-border p-3">
      <div className="flex min-w-0 items-start gap-3">
        <Library className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        <div className="min-w-0">
          <h4 className="text-sm font-semibold">本库单独配置</h4>
          <p className="mt-1 text-xs text-muted-foreground">
            默认关闭：所有库共用同一份提供商配置。打开后本库使用自己的一份（首次打开会复制当前配置作为起点），
            适合给不同库配不同密钥，或测试从零配置的流程。密钥始终只存在系统配置目录，不写入库文件夹。
          </p>
        </div>
      </div>
      {busy
        ? <Loader2 className="mt-1 h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
        : (
          <Switch
            checked={perVault}
            disabled={!ready}
            onCheckedChange={(checked) => { void handleChange(checked); }}
            aria-label="本库单独配置"
          />
        )}
    </div>
  );
}
