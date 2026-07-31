/**
 * 「接入 SillyTavern」卡片（2.0 阶段7.3，仅客户端 isTauri 显示）。
 * 选 ST 目录 → scanSTUserDir 列清单（数量/体积）→ 勾选 → importSelected → toast 汇总。
 * 勾选粒度：角色 = 卡 + 其全部聊天一起；散聊天/世界书逐条。ST 路径记入 app 配置 stRoot（7.4 检查更新用）。
 */
import { useMemo, useState } from 'react';
import { Download, FolderSearch, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { formatBytes } from '@/lib/storage-utils';
import { createTauriFs, isTauri, pickDirectory, setAppConfig } from '@/lib/vault/tauri-fs';
import { scanSTUserDir, importSelected, type STImportSummary, type STScanResult } from '@/lib/vault/st-import';
import type { VaultFs } from '@/lib/vault/fs';

interface ScanState {
  root: string;
  fs: VaultFs;
  scan: STScanResult;
}

/** 勾选状态：各组一个 key 集合（角色=pngPath、其余=path）；全局正则只有一组，布尔即可 */
interface Picks {
  chars: Set<string>;
  strays: Set<string>;
  wbs: Set<string>;
  presets: Set<string>;
  regex: boolean;
}

function pickAll(scan: STScanResult): Picks {
  return {
    chars: new Set(scan.characters.map((c) => c.pngPath)),
    strays: new Set(scan.strayChats.map((c) => c.path)),
    wbs: new Set(scan.worldbooks.map((w) => w.path)),
    presets: new Set(scan.presets.map((p) => p.path)),
    regex: scan.regex !== null,
  };
}

const pickNone = (): Picks => ({ chars: new Set(), strays: new Set(), wbs: new Set(), presets: new Set(), regex: false });

const toggle = (set: Set<string>, key: string, on: boolean) => {
  const next = new Set(set);
  if (on) next.add(key);
  else next.delete(key);
  return next;
};

interface STImportCardProps {
  onChanged?: () => void;
}

export function STImportCard({ onChanged }: STImportCardProps) {
  const { toast } = useToast();
  const [scanning, setScanning] = useState(false);
  const [importing, setImporting] = useState(false);
  const [state, setState] = useState<ScanState | null>(null);
  const [picks, setPicks] = useState<Picks>(pickNone());

  const notifyChanged = () => {
    try { onChanged?.(); } catch { /* UI 刷新不能把成功导入误报为失败 */ }
  };

  const pickedCount = picks.chars.size + picks.strays.size + picks.wbs.size + picks.presets.size + (picks.regex ? 1 : 0);
  const summaryLine = useMemo(() => {
    if (!state) return '';
    const { characters, strayChats, worldbooks, presets, regex } = state.scan;
    const chatCount = characters.reduce((s, c) => s + c.chats.length, 0) + strayChats.length;
    const parts = [`角色卡 ${characters.length}`, `聊天 ${chatCount}`, `世界书 ${worldbooks.length}`, `预设 ${presets.length}`];
    if (regex) parts.push(`全局正则 ${regex.count} 条`);
    return `找到 ${parts.join(' · ')}`;
  }, [state]);

  if (!isTauri()) return null;

  const handlePick = async () => {
    setScanning(true);
    try {
      const root = await pickDirectory('选择 SillyTavern 目录（安装根目录或 data/default-user）');
      if (!root) return;
      const fs = createTauriFs(root);
      const scan = await scanSTUserDir(fs);
      if (!scan.characters.length && !scan.strayChats.length && !scan.worldbooks.length && !scan.presets.length && !scan.regex) {
        toast({ title: '没有找到 ST 内容', description: '该目录下没有 characters / chats / worlds 等内容，确认选的是 ST 目录？', variant: 'destructive' });
        return;
      }
      // 目录有效即记住（7.4 检查更新用），与本次是否导入无关
      await setAppConfig('stRoot', root);
      notifyChanged();
      setState({ root, fs, scan });
      setPicks(pickAll(scan));
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
      const summary: STImportSummary = await importSelected(state.fs, {
        stRoot: state.root,
        characters: scan.characters.filter((c) => picks.chars.has(c.pngPath)),
        strayChats: scan.strayChats.filter((c) => picks.strays.has(c.path)),
        worldbooks: scan.worldbooks.filter((w) => picks.wbs.has(w.path)),
        presets: scan.presets.filter((p) => picks.presets.has(p.path)),
        regex: picks.regex ? scan.regex : null,
      });
      const parts = [`角色 ${summary.characters}`, `故事 ${summary.stories}`, `世界书 ${summary.worldbooks}`, `预设 ${summary.presets}`];
      if (summary.regexes) parts.push(`正则规则集 ${summary.regexes}`);
      if (summary.skipped) parts.push(`跳过已导入 ${summary.skipped}`);
      if (summary.failed) parts.push(`解析失败 ${summary.failed}`);
      toast({ title: '导入完成', description: parts.join('，') });
      notifyChanged();
      setState(null);
    } catch (err) {
      toast({ title: '导入失败', description: String(err), variant: 'destructive' });
    } finally {
      setImporting(false);
    }
  };

  return (
    <>
      <Card className="p-4 flex flex-wrap items-center gap-3">
        <div className="w-9 h-9 rounded-lg bg-secondary flex items-center justify-center shrink-0">
          <FolderSearch className="w-5 h-5 text-muted-foreground" />
        </div>
        <div className="min-w-0 basis-[14rem] grow">
          <p className="font-medium text-sm">接入 SillyTavern</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            指定 ST 目录，扫描角色卡 / 聊天 / 世界书 / 预设 / 全局正则，勾选后复制进库并记住来源
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={handlePick} disabled={scanning}>
          {scanning ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <FolderSearch className="w-4 h-4 mr-1" />}
          选择 ST 目录
        </Button>
      </Card>

      <Dialog open={!!state} onOpenChange={(v) => { if (!v && !importing) setState(null); }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>从 SillyTavern 导入</DialogTitle>
            <DialogDescription className="break-all">
              {state?.root}
              {state?.scan.userDir ? `（已定位到 ${state.scan.userDir}）` : ''} — {summaryLine}
            </DialogDescription>
          </DialogHeader>

          {/* 清单区：限高滚动（布局铁律：Dialog 内容自己滚，不撑爆视口） */}
          <div className="max-h-[55vh] overflow-y-auto space-y-4 pr-1">
            {!!state?.scan.characters.length && (
              <section>
                <p className="text-xs font-medium text-muted-foreground mb-2">角色卡（勾选 = 卡 + 名下全部聊天）</p>
                <div className="flex flex-wrap gap-2">
                  {state.scan.characters.map((c) => (
                    <label
                      key={c.pngPath}
                      className="flex items-center gap-2 rounded-lg border border-border p-2.5 basis-[15rem] grow cursor-pointer hover:bg-accent/50"
                    >
                      <Checkbox
                        checked={picks.chars.has(c.pngPath)}
                        onCheckedChange={(on) => setPicks((p) => ({ ...p, chars: toggle(p.chars, c.pngPath, on === true) }))}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm truncate">{c.name}</span>
                        <span className="block text-xs text-muted-foreground">
                          {c.chats.length ? `${c.chats.length} 场聊天 · ${formatBytes(c.chatBytes)}` : '无聊天'}
                        </span>
                      </span>
                    </label>
                  ))}
                </div>
              </section>
            )}

            {!!state?.scan.strayChats.length && (
              <section>
                <p className="text-xs font-medium text-muted-foreground mb-2">散聊天（没有对应角色卡，导入为未绑定故事）</p>
                <div className="flex flex-wrap gap-2">
                  {state.scan.strayChats.map((c) => (
                    <label
                      key={c.path}
                      className="flex items-center gap-2 rounded-lg border border-border p-2.5 basis-[15rem] grow cursor-pointer hover:bg-accent/50"
                    >
                      <Checkbox
                        checked={picks.strays.has(c.path)}
                        onCheckedChange={(on) => setPicks((p) => ({ ...p, strays: toggle(p.strays, c.path, on === true) }))}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm truncate">{c.characterDir} / {c.name}</span>
                        <span className="block text-xs text-muted-foreground">{formatBytes(c.size)}</span>
                      </span>
                    </label>
                  ))}
                </div>
              </section>
            )}

            {!!state?.scan.worldbooks.length && (
              <section>
                <p className="text-xs font-medium text-muted-foreground mb-2">世界书</p>
                <div className="flex flex-wrap gap-2">
                  {state.scan.worldbooks.map((w) => (
                    <label
                      key={w.path}
                      className="flex items-center gap-2 rounded-lg border border-border p-2.5 basis-[15rem] grow cursor-pointer hover:bg-accent/50"
                    >
                      <Checkbox
                        checked={picks.wbs.has(w.path)}
                        onCheckedChange={(on) => setPicks((p) => ({ ...p, wbs: toggle(p.wbs, w.path, on === true) }))}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm truncate">{w.name}</span>
                        <span className="block text-xs text-muted-foreground">{formatBytes(w.size)}</span>
                      </span>
                    </label>
                  ))}
                </div>
              </section>
            )}

            {!!state?.scan.presets.length && (
              <section>
                <p className="text-xs font-medium text-muted-foreground mb-2">预设（OpenAI Settings 聊天补全预设）</p>
                <div className="flex flex-wrap gap-2">
                  {state.scan.presets.map((p) => (
                    <label
                      key={p.path}
                      className="flex items-center gap-2 rounded-lg border border-border p-2.5 basis-[15rem] grow cursor-pointer hover:bg-accent/50"
                    >
                      <Checkbox
                        checked={picks.presets.has(p.path)}
                        onCheckedChange={(on) => setPicks((prev) => ({ ...prev, presets: toggle(prev.presets, p.path, on === true) }))}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm truncate">{p.name}</span>
                        <span className="block text-xs text-muted-foreground">{formatBytes(p.size)}</span>
                      </span>
                    </label>
                  ))}
                </div>
              </section>
            )}

            {state?.scan.regex && (
              <section>
                <p className="text-xs font-medium text-muted-foreground mb-2">正则</p>
                <label className="flex items-center gap-2 rounded-lg border border-border p-2.5 cursor-pointer hover:bg-accent/50">
                  <Checkbox
                    checked={picks.regex}
                    onCheckedChange={(on) => setPicks((prev) => ({ ...prev, regex: on === true }))}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm">ST 全局正则</span>
                    <span className="block text-xs text-muted-foreground">
                      settings.json 里的 {state.scan.regex.count} 条脚本，整组导入为一套规则集
                    </span>
                  </span>
                </label>
              </section>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <Label className="flex items-center gap-1.5 cursor-pointer font-normal">
              <Checkbox
                checked={
                  !!state &&
                  pickedCount > 0 &&
                  pickedCount ===
                    state.scan.characters.length + state.scan.strayChats.length + state.scan.worldbooks.length +
                    state.scan.presets.length + (state.scan.regex ? 1 : 0)
                }
                onCheckedChange={(on) => state && setPicks(on === true ? pickAll(state.scan) : pickNone())}
              />
              全选
            </Label>
            <span>已选 {pickedCount} 项；已导入过的（同来源路径）会自动跳过</span>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setState(null)} disabled={importing}>取消</Button>
            <Button onClick={handleImport} disabled={importing || pickedCount === 0}>
              {importing ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Download className="w-4 h-4 mr-1" />}
              导入所选
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
