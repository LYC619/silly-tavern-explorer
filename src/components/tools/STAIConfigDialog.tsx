/**
 * 「ST 配置」查看对话框（2.0 阶段9.9 余项，仅客户端）：
 * 首页「其他资产」入口。读已接入的 ST 目录里的 settings.json，
 * 展示用户在 SillyTavern 用的 AI 连接概况（只读快照，不碰密钥、不落库）。
 */
import { useEffect, useState } from 'react';
import { KeyRound, FolderSearch } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { createTauriFs, getAppConfig } from '@/lib/vault/tauri-fs';
import { joinPath } from '@/lib/vault/fs';
import { extractSTAIConfig, type STAIConfigRow } from '@/lib/st-ai-config';

interface STAIConfigDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type LoadState =
  | { kind: 'loading' }
  | { kind: 'no-root' }
  | { kind: 'no-settings' }
  | { kind: 'ok'; rows: STAIConfigRow[]; path: string };

export function STAIConfigDialog({ open, onOpenChange }: STAIConfigDialogProps) {
  const navigate = useNavigate();
  const [state, setState] = useState<LoadState>({ kind: 'loading' });

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      setState({ kind: 'loading' });
      try {
        const stRoot = await getAppConfig<string>('stRoot');
        if (!stRoot) {
          if (!cancelled) setState({ kind: 'no-root' });
          return;
        }
        const fs = createTauriFs(stRoot);
        // 与 scanSTUserDir 同规则：直接选中用户目录，或安装根自动下钻 data/default-user
        let settingsPath = 'settings.json';
        if (!(await fs.stat(settingsPath)).exists) {
          const nested = joinPath('data/default-user', 'settings.json');
          if ((await fs.stat(nested)).exists) settingsPath = nested;
          else {
            if (!cancelled) setState({ kind: 'no-settings' });
            return;
          }
        }
        const rows = extractSTAIConfig(JSON.parse(await fs.readText(settingsPath)));
        if (!cancelled) setState({ kind: 'ok', rows, path: `${stRoot}/${settingsPath}` });
      } catch {
        if (!cancelled) setState({ kind: 'no-settings' });
      }
    })();
    return () => { cancelled = true; };
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyRound className="w-4 h-4 text-primary" />
            ST 里的 AI 配置
          </DialogTitle>
          <DialogDescription>
            你在 SillyTavern 使用的连接概况（只读快照，随看随取，不保存、不读取密钥）。
            本应用自己的 AI 配置在「设置」页。
          </DialogDescription>
        </DialogHeader>

        {state.kind === 'loading' && (
          <p className="py-6 text-center text-sm text-muted-foreground">读取中…</p>
        )}
        {state.kind === 'no-root' && (
          <div className="py-4 text-center space-y-3">
            <p className="text-sm text-muted-foreground">还没有接入 SillyTavern 目录</p>
            <Button size="sm" onClick={() => { onOpenChange(false); navigate('/tools'); }}>
              <FolderSearch className="w-4 h-4 mr-1.5" />
              去处理区接入 ST
            </Button>
          </div>
        )}
        {state.kind === 'no-settings' && (
          <p className="py-6 text-center text-sm text-muted-foreground">
            读不到 ST 的 settings.json（目录可能移动过），可在处理区重新选择 ST 目录。
          </p>
        )}
        {state.kind === 'ok' && (
          <div className="space-y-1.5">
            {state.rows.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">settings.json 里没有可识别的 AI 连接配置</p>
            ) : (
              state.rows.map((r) => (
                <div key={r.label} className="flex items-start gap-3 rounded-md bg-muted/50 px-3 py-1.5 text-sm">
                  <span className="w-24 shrink-0 text-muted-foreground text-xs pt-0.5">{r.label}</span>
                  <span className="min-w-0 break-all">{r.value}</span>
                </div>
              ))
            )}
            <p className="text-[11px] text-muted-foreground/70 break-all pt-1">来源：{state.path}</p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
