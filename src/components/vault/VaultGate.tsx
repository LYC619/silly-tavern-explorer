/**
 * 客户端文件库门卫（2.0 阶段7.2c）：
 * 网页版直接放行；客户端先激活文件库再渲染应用，未配置库时全屏引导选目录。
 * 必须在任何页面读数据之前完成激活，否则首屏会先读到 IndexedDB。
 */
import { useCallback, useEffect, useState } from 'react';
import { FolderOpen, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { bootVault, chooseVaultRoot, type VaultBootState } from '@/lib/vault/bootstrap';

export function VaultGate({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<VaultBootState | 'booting'>('booting');

  useEffect(() => {
    bootVault().then(setState);
  }, []);

  const handleChoose = useCallback(async () => {
    const picked = await chooseVaultRoot();
    if (picked) setState('ready');
  }, []);

  if (state === 'booting') {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (state === 'unset') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="max-w-md space-y-4 rounded-lg border p-8 text-center">
          <FolderOpen className="mx-auto h-10 w-10 text-primary" />
          <h1 className="text-xl font-semibold">选择你的 STE 库文件夹</h1>
          <p className="text-sm text-muted-foreground">
            一个文件夹就是整个库：角色、故事、总结全部以普通文件存放，
            可以直接用资源管理器查看、网盘同步、手动备份。
            选一个空文件夹开始，或选择已有的 STE 库继续使用。
          </p>
          <Button onClick={handleChoose} className="gap-2">
            <FolderOpen className="h-4 w-4" />
            选择文件夹
          </Button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
