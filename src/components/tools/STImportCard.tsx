/**
 * 「接入 SillyTavern」卡片（2.0 阶段7.3，仅客户端 isTauri 显示）。
 * 选 ST 目录 → scanSTUserDir 列清单（数量/体积）→ 勾选 → importSelected → toast 汇总。
 * 勾选粒度：角色 = 卡 + 其全部聊天一起；散聊天/世界书逐条；extensions/assets 按目录组。
 * ST 路径记入 app 配置 stRoot，设置页可直接使用保存路径重新扫描并选择。
 */
import { useMemo, useState } from 'react';
import { Archive, CircleAlert, Download, FolderSearch, Link2, Loader2 } from 'lucide-react';
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
  archives: Set<string>;
  settingsRelations: boolean;
}

function pickAll(scan: STScanResult): Picks {
  return {
    chars: new Set(scan.characters.map((c) => c.pngPath)),
    strays: new Set(scan.strayChats.map((c) => c.path)),
    wbs: new Set(scan.worldbooks.map((w) => w.path)),
    presets: new Set(scan.presets.map((p) => p.path)),
    regex: scan.regex !== null,
    archives: new Set(scan.archives.map((group) => group.kind)),
    settingsRelations: scan.relationships.status === 'parsed',
  };
}

const pickNone = (): Picks => ({
  chars: new Set(),
  strays: new Set(),
  wbs: new Set(),
  presets: new Set(),
  regex: false,
  archives: new Set(),
  settingsRelations: false,
});

const toggle = (set: Set<string>, key: string, on: boolean) => {
  const next = new Set(set);
  if (on) next.add(key);
  else next.delete(key);
  return next;
};

const RESULT_STATUS_LABELS: Record<STImportSummary['details'][number]['status'], string> = {
  imported: '已导入',
  archived: '已归档',
  linked: '已关联',
  skipped: '已跳过',
  failed: '失败',
  unresolved: '未解析',
};

const RESULT_RELATION_LABELS: Record<string, string> = {
  embedded: '卡内嵌',
  primary: '主绑定',
  extra: '额外链接',
  global: '全局启用',
  chat: '对话级',
};

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
  const [picks, setPicks] = useState<Picks>(pickNone());
  const [result, setResult] = useState<STImportSummary | null>(null);

  const notifyChanged = () => {
    try { onChanged?.(); } catch { /* UI 刷新不能把成功导入误报为失败 */ }
  };

  const pickedCount = picks.chars.size + picks.strays.size + picks.wbs.size + picks.presets.size
    + picks.archives.size + (picks.regex ? 1 : 0) + (picks.settingsRelations ? 1 : 0);
  const summaryLine = useMemo(() => {
    if (!state) return '';
    const { characters, strayChats, worldbooks, presets, regex } = state.scan;
    const chatCount = characters.reduce((s, c) => s + c.chats.length, 0) + strayChats.length;
    const parts = [`角色卡 ${characters.length}`, `聊天 ${chatCount}`, `世界书 ${worldbooks.length}`, `预设 ${presets.length}`];
    if (regex) parts.push(`全局正则 ${regex.count} 条`);
    if (state.scan.relationships.status === 'parsed') parts.push('settings 世界书关系');
    for (const group of state.scan.archives) parts.push(`${group.kind} ${group.files.length} 个文件`);
    return `找到 ${parts.join(' · ')}`;
  }, [state]);

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
      // 目录有效即记住（7.4 检查更新用），与本次是否导入无关
      await setAppConfig('stRoot', selectedRoot);
      notifyChanged();
      setState({ root: selectedRoot, fs, scan });
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
        archives: scan.archives.filter((group) => picks.archives.has(group.kind)),
        relationships: picks.settingsRelations ? scan.relationships : undefined,
        scanWarnings: scan.warnings,
      });
      const parts = [`角色 ${summary.characters}`, `故事 ${summary.stories}`, `世界书 ${summary.worldbooks}`, `预设 ${summary.presets}`];
      if (summary.regexes) parts.push(`正则规则集 ${summary.regexes}`);
      if (summary.archivedFiles) parts.push(`原样归档 ${summary.archivedFiles} 个文件`);
      if (summary.relationships) parts.push(`恢复关联 ${summary.relationships}`);
      if (summary.unresolvedRelationships.length) parts.push(`未解析关联 ${summary.unresolvedRelationships.length}`);
      if (summary.skipped) parts.push(`跳过已导入 ${summary.skipped}`);
      if (summary.failed) parts.push(`解析失败 ${summary.failed}`);
      toast({ title: '导入完成', description: parts.join('，') });
      notifyChanged();
      setState(null);
      setResult(summary);
    } catch (err) {
      toast({ title: '导入失败', description: String(err), variant: 'destructive' });
    } finally {
      setImporting(false);
    }
  };

  return (
    <>
      {variant === 'full' ? (
        <Card className="p-4 flex flex-wrap items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-secondary flex items-center justify-center shrink-0">
            <FolderSearch className="w-5 h-5 text-muted-foreground" />
          </div>
          <div className="min-w-0 basis-[14rem] grow">
            <p className="font-medium text-sm">接入 SillyTavern</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              指定 ST 目录，扫描角色卡、聊天、世界书、预设、正则、扩展和媒体；勾选后复制进库并记住来源。后续可在设置里重新扫描
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={handlePick} disabled={scanning}>
            {scanning ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <FolderSearch className="w-4 h-4 mr-1" />}
            选择 ST 目录
          </Button>
        </Card>
      ) : (
        <Button variant="outline" size="sm" onClick={handlePick} disabled={scanning}>
          {scanning ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <FolderSearch className="w-4 h-4 mr-1" />}
          {root ? '重新扫描并选择' : '重新扫描 ST'}
        </Button>
      )}

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

            {!!state?.scan.archives.length && (
              <section>
                <p className="text-xs font-medium text-muted-foreground mb-2">扩展与媒体（原样归档，不执行扩展代码）</p>
                <div className="space-y-2">
                  {state.scan.archives.map((group) => (
                    <label
                      key={group.kind}
                      className="flex items-center gap-2 rounded-lg border border-border p-2.5 cursor-pointer hover:bg-accent/50"
                    >
                      <Checkbox
                        checked={picks.archives.has(group.kind)}
                        onCheckedChange={(on) => setPicks((prev) => ({
                          ...prev,
                          archives: toggle(prev.archives, group.kind, on === true),
                        }))}
                      />
                      <Archive className="w-4 h-4 text-muted-foreground shrink-0" />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm">{group.kind}/</span>
                        <span className="block text-xs text-muted-foreground">
                          {group.files.length} 个文件 · {formatBytes(group.bytes)} · 保持子目录结构
                        </span>
                      </span>
                    </label>
                  ))}
                </div>
              </section>
            )}

            {!!state?.scan.warnings.length && (
              <section className="rounded-md border border-amber-500/50 px-3 py-2 text-xs text-amber-700">
                为保证所选目录边界，已跳过 {state.scan.warnings.length} 个符号链接、非法路径名或超过深度上限的目录；
                路径会写入本次导入清单。
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

            {state && (
              <section className="border-t border-border pt-3 space-y-2 text-xs text-muted-foreground">
                <div className="flex items-center gap-1.5 font-medium text-foreground">
                  <Link2 className="w-3.5 h-3.5" />
                  关联恢复
                </div>
                {state.scan.relationships.status === 'parsed' ? (
                  <Label className="flex items-start gap-2 rounded-md border border-border p-2.5 cursor-pointer font-normal">
                    <Checkbox
                      checked={picks.settingsRelations}
                      onCheckedChange={(on) => setPicks((prev) => ({ ...prev, settingsRelations: on === true }))}
                    />
                    <span>
                      settings.json：全局世界书 {state.scan.relationships.globalWorldbooks.length} 个，角色额外链接{' '}
                      {state.scan.relationships.characterWorldbooks.reduce((sum, row) => sum + row.worldbooks.length, 0)} 个。
                      勾选后按当前 settings 状态重建，仅清理同一来源的旧标记。
                    </span>
                  </Label>
                ) : state.scan.relationships.status === 'invalid' ? (
                  <p className="text-amber-700">settings.json 无法解析，本次不会改动已有全局或额外链接。</p>
                ) : null}
                <p>主绑定随所选角色卡恢复；对话级关系随所选聊天恢复。找不到或重名的世界书会列入结果。</p>
                <p>
                  导入去向：角色卡 → 角色档案；聊天 → 角色故事或临时故事；世界书/预设/正则 → 对应资产库；
                  extensions/assets → 资产/其他/SillyTavern。完整映射和逐项清单会写入库内“说明”目录。
                </p>
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
                    state.scan.presets.length + state.scan.archives.length + (state.scan.regex ? 1 : 0) +
                    (state.scan.relationships.status === 'parsed' ? 1 : 0)
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

      <Dialog open={!!result} onOpenChange={(open) => { if (!open) setResult(null); }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>本次导入明细</DialogTitle>
            <DialogDescription>
              {result?.failed
                ? `本次有 ${result.failed} 项失败，其余项目已处理；完整清单保存在“说明/SillyTavern 最近一次导入.json”。`
                : '本次所选内容已处理；完整清单保存在“说明/SillyTavern 最近一次导入.json”。'}
            </DialogDescription>
          </DialogHeader>
          {result && (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
                <span>角色 {result.characters}</span>
                <span>故事 {result.stories}</span>
                <span>世界书 {result.worldbooks}</span>
                <span>预设 {result.presets}</span>
                <span>正则 {result.regexes}</span>
                <span>归档文件 {result.archivedFiles}（{formatBytes(result.archiveBytes)}）</span>
                <span>恢复关联 {result.relationships}</span>
                <span>跳过 {result.skipped}</span>
                <span>失败 {result.failed}</span>
              </div>
              {!!result.unresolvedRelationships.length && (
                <div className="rounded-md border border-amber-500/50 px-3 py-2 text-sm space-y-1">
                  <div className="flex items-center gap-1.5 font-medium text-amber-700">
                    <CircleAlert className="w-4 h-4" />
                    未解析关联 {result.unresolvedRelationships.length} 个
                  </div>
                  {result.unresolvedRelationships.map((item, index) => (
                    <p key={`${item.owner}-${item.name}-${index}`} className="text-xs text-muted-foreground">
                      {item.owner} → {item.name}（{RESULT_RELATION_LABELS[item.relation] ?? item.relation}，
                      {item.reason === 'ambiguous' ? '存在同名候选' : '未找到'}）
                    </p>
                  ))}
                </div>
              )}
              <div className="max-h-[48vh] overflow-y-auto border-t border-border pt-2 space-y-1">
                {result.details.slice(0, 120).map((item, index) => (
                  <div key={`${item.status}-${item.kind}-${item.name}-${index}`} className="grid grid-cols-[4.5rem_5.5rem_minmax(0,1fr)] gap-2 text-xs py-1">
                    <span className="text-muted-foreground">{RESULT_STATUS_LABELS[item.status]}</span>
                    <span>{item.kind}</span>
                    <span className="min-w-0 break-all space-y-0.5">
                      <span className="block">{item.name}{item.target ? ` → ${RESULT_RELATION_LABELS[item.target] ?? item.target}` : ''}</span>
                      {item.sourcePath && <span className="block text-[10px] text-muted-foreground">{item.sourcePath}</span>}
                    </span>
                  </div>
                ))}
                {result.details.length > 120 && (
                  <p className="text-xs text-muted-foreground pt-1">界面显示前 120 项，其余见库内完整清单。</p>
                )}
              </div>
              {!!result.scanWarnings.length && (
                <div className="rounded-md border border-amber-500/50 px-3 py-2 text-xs text-muted-foreground">
                  为保证目录边界，已跳过 {result.scanWarnings.length} 个符号链接、非法路径名或过深目录；详情见完整清单。
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => setResult(null)}>完成</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
