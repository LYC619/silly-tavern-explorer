import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, FolderOpen, Plus, RefreshCw } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { isTauri } from '@/lib/vault/tauri-fs';
import { loadVaultRegistry, VAULT_CHANGED_EVENT } from '@/lib/vault/vault-registry-store';
import type { VaultProfile, VaultRegistry } from '@/lib/vault/vault-registry';
import { cn } from '@/lib/utils';

function activeProfile(registry: VaultRegistry | null): VaultProfile | null {
  return registry?.vaults.find((item) => item.id === registry.activeId) ?? null;
}

/** 客户端全局库切换器：只切换活动根目录，刷新应用以清空旧库的读缓存。 */
export function VaultSwitcher({ expanded }: { expanded: boolean }) {
  const { toast } = useToast();
  const client = isTauri();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [registry, setRegistry] = useState<VaultRegistry | null>(null);

  const refresh = useCallback(async () => {
    if (!client) return;
    setRegistry(await loadVaultRegistry().catch(() => null));
  }, [client]);

  useEffect(() => {
    void refresh();
    const onChanged = () => void refresh();
    window.addEventListener(VAULT_CHANGED_EVENT, onChanged);
    return () => window.removeEventListener(VAULT_CHANGED_EVENT, onChanged);
  }, [refresh]);

  const current = useMemo(() => activeProfile(registry), [registry]);
  if (!client) return null;

  const reloadAfter = (profile: VaultProfile, message: string) => {
    toast({ title: message, description: `当前库：${profile.name}` });
    setOpen(false);
    window.location.reload();
  };

  const switchVault = async (id: string) => {
    if (id === current?.id) return;
    setLoading(true);
    try {
      const { selectRegisteredVaultForNextBoot } = await import('@/lib/vault/vault-registry-runtime');
      const profile = await selectRegisteredVaultForNextBoot(id);
      if (!profile) throw new Error('所选库已不在注册表中，请刷新后重试');
      reloadAfter(profile, '已切换文件库');
    } catch (error) {
      toast({ title: '切换文件库失败', description: error instanceof Error ? error.message : '无法打开所选目录', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const addVault = async () => {
    setLoading(true);
    try {
      const { chooseVaultForNextBoot } = await import('@/lib/vault/vault-registry-runtime');
      const profile = await chooseVaultForNextBoot();
      if (profile) reloadAfter(profile, '已打开文件库');
    } catch (error) {
      toast({ title: '打开文件库失败', description: error instanceof Error ? error.message : '无法打开所选目录', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={current ? `当前文件库：${current.name}` : '选择文件库'}
          title={current ? `${current.name}\n${current.path}` : '选择文件库'}
          data-vault-switcher
          className={cn(
            'flex w-full items-center rounded-md transition-colors text-left',
            expanded ? 'gap-2 px-2.5 py-2' : 'flex-col gap-1 px-0.5 py-2',
            'text-[color:var(--sidebar-text-muted)] hover:bg-[var(--hover-overlay)] hover:text-[color:var(--sidebar-text)]',
          )}
        >
          <FolderOpen className="h-[18px] w-[18px] shrink-0" />
          <span className={cn('min-w-0 truncate', expanded ? 'flex-1 text-xs' : 'text-[11px] leading-none')} title={current?.name ?? '文件库'}>{current?.name ?? '文件库'}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent side="right" align="end" className="w-80 p-2" data-vault-switcher-menu>
        <div className="flex items-center gap-2 px-2 pb-2">
          <FolderOpen className="h-4 w-4 text-brand" />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold">文件库</p>
            <p className="text-[11px] text-muted-foreground">演示库和私人库可以分开保存</p>
          </div>
          {loading && <RefreshCw className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
        </div>
        <div className="max-h-56 space-y-1 overflow-y-auto">
          {(registry?.vaults ?? []).map((profile) => (
            <button
              type="button"
              key={profile.id}
              disabled={loading}
              onClick={() => void switchVault(profile.id)}
              className="flex w-full items-start gap-2 rounded-md px-2 py-2 text-left hover:bg-accent disabled:opacity-60"
            >
              <Check className={cn('mt-0.5 h-3.5 w-3.5 shrink-0', profile.id === registry?.activeId ? 'text-brand' : 'text-transparent')} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-medium" title={profile.name}>{profile.name}</span>
                <span className="block truncate text-[11px] text-muted-foreground" title={profile.path}>{profile.path}</span>
              </span>
            </button>
          ))}
        </div>
        <div className="mt-2 border-t border-border pt-2">
          <Button type="button" variant="outline" size="sm" className="w-full justify-start gap-1.5" disabled={loading} onClick={() => void addVault()}>
            <Plus className="h-3.5 w-3.5" />
            打开或新增一个库
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
