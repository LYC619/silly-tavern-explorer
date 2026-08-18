/**
 * 导入与导出（2.0 阶段4，定稿 5.3）：只管当前故事的聊天文件进出，独立资产不在这里。
 * 三区：① 检查 ST 更新（客户端期自动，网页版=手动重新导入走同一套合并规则）
 *      ② 导出副本（聊天 JSONL/TXT/MD + 本故事总结/日记 MD、故事树 JSON/MD）
 *      ③ 写回 ST（仅客户端，阶段7 启用，此处占位）
 * 进入不自动扫描，只显示来源路径、绑定状态、上次导入/导出时间。
 */
import { useEffect, useRef, useState } from 'react';
import { FileDown, FileJson, FileUp, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import { ExportButton } from '@/components/chat/ExportButton';
import type { ArchiveStory } from '@/types/archive';
import type { ExportSettings } from '@/types/chat';
import type { SummaryItem } from '@/types/summary';
import type { StoryTree } from '@/types/story-tree';
import { SUMMARY_KIND_LABELS } from '@/types/summary';
import { parseJsonl, parseJson, mergeReimport } from '@/lib/adapters/st';
import { isTauri, readAbsText } from '@/lib/vault/tauri-fs';
import { WritebackSection } from '@/components/workspace/WritebackSection';
import { updateBranchLine, getBranchLine, type BranchLine } from '@/lib/archive-db';
import { getAllSummaries } from '@/lib/summary-db';
import { getAllStoryTrees } from '@/lib/story-tree-db';
import { summaryToObsidian, storyTreeToObsidian, downloadMarkdown } from '@/lib/obsidian-export';
import { storyTreeToJSON } from '@/lib/story-tree-io';

interface IOPanelProps {
  story: ArchiveStory;
  /** 当前脉络（null=主线）；重新导入与聊天导出都作用于它 */
  branchId: string | null;
  line: BranchLine;
  settings: ExportSettings;
  /** 与工作区共用的故事修改入口（dirty+防抖落库） */
  onStoryUpdate: (fn: (cur: ArchiveStory) => ArchiveStory) => void;
}

function downloadJSON(name: string, content: string): void {
  const safe = name.replace(/[/\\:*?"<>|]/g, '_');
  const blob = new Blob([content], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = safe.endsWith('.json') ? safe : `${safe}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

const fmtTime = (t?: number) => (t ? new Date(t).toLocaleString('zh-CN') : '从未');

export function IOPanel({ story, branchId, line, settings, onStoryUpdate }: IOPanelProps) {
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [records, setRecords] = useState<SummaryItem[]>([]);
  const [trees, setTrees] = useState<StoryTree[]>([]);

  const branchName = branchId === null ? '主线' : story.branches?.find((b) => b.id === branchId)?.name ?? '分支';

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [allSums, allTrees] = await Promise.all([getAllSummaries(), getAllStoryTrees()]);
      if (cancelled) return;
      setRecords(allSums.filter((s) => s.bookId === story.id && s.content));
      setTrees(allTrees.filter((t) => t.bookId === story.id));
    })();
    return () => { cancelled = true; };
  }, [story.id]);

  const markExported = () => {
    onStoryUpdate((cur) => ({ ...cur, lastExportedAt: Date.now() }));
  };

  /** 解析文本并按 5.3① 合并规则并入当前脉络（选文件与按原路径重导共用） */
  const mergeText = (content: string, nameHint: string) => {
    const isJsonl = nameHint.endsWith('.jsonl') || content.trim().split('\n').length > 1;
    const parsed = isJsonl ? parseJsonl(content) : parseJson(content);
    if (parsed.messages.length === 0) throw new Error('empty');

    const result = mergeReimport(line.session, parsed);
    if (result.changed) {
      onStoryUpdate((cur) => {
        // 以落库时的最新脉络为准再合一次，避免防抖窗口内的编辑被旧快照顶掉
        const curLine = getBranchLine(cur, branchId);
        const merged = curLine ? mergeReimport(curLine.session, parsed) : result;
        const updated = updateBranchLine(cur, branchId, { session: merged.session });
        return { ...updated, lastImportedAt: Date.now() };
      });
    }
    toast({ title: '重新导入完成', description: result.summary });
  };

  // 网页版「检查 ST 更新」的等价操作：手动重选同一个聊天文件，走 5.3① 合并规则
  const handleReimport = async (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    try {
      mergeText(await file.text(), file.name);
    } catch {
      toast({ title: '导入失败', description: '无法解析该文件（应为 ST 聊天 JSONL/JSON）', variant: 'destructive' });
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  // 客户端一键重导（阶段9.7 用户反馈：能写回就不该再手动选文件）：直接读原绑定文件。
  // 只在主线开放——sourcePath 是主线的来源文件，分支该并分支自己的文件。
  const canReimportFromSource = isTauri() && !!story.sourcePath && branchId === null;
  const handleReimportFromSource = async () => {
    if (!story.sourcePath) return;
    try {
      mergeText(await readAbsText(story.sourcePath), story.sourcePath);
    } catch {
      toast({
        title: '按原文件重新导入失败',
        description: '来源文件可能已移动/删除或无法解析，可改用「另选文件重新导入」',
        variant: 'destructive',
      });
    }
  };

  const handleExportRecordMd = (item: SummaryItem) => {
    downloadMarkdown(item.title || SUMMARY_KIND_LABELS[item.kind], summaryToObsidian(item));
    markExported();
    toast({ title: '已导出 Markdown' });
  };

  const handleExportTreeMd = (tree: StoryTree) => {
    downloadMarkdown(tree.title || '故事树', storyTreeToObsidian(tree, { linkNodes: false }));
    markExported();
    toast({ title: '已导出 Markdown' });
  };

  const handleExportTreeJson = (tree: StoryTree) => {
    downloadJSON(tree.title || '故事树', storyTreeToJSON(tree));
    markExported();
    toast({ title: '已导出 JSON', description: '可用「整理与记录 → 新建▾导入」恢复为新树' });
  };

  return (
    <div className="h-full min-h-0 overflow-y-auto container mx-auto px-6 py-10 max-w-2xl space-y-4">
      <h2 className="font-display text-xl font-semibold">导入与导出</h2>

      {/* 当前故事：来源路径 / 绑定状态 / 上次导入导出时间（进入不自动扫描） */}
      <Card>
        <CardContent className="py-5 space-y-1.5">
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium">当前故事</p>
            <Badge variant={story.sourcePath ? 'secondary' : 'outline'} className="h-5 text-[11px]">
              {story.sourcePath ? '已绑定 ST 路径' : '未绑定'}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground">
            来源：{story.sourcePath ?? '手动导入（未绑定 ST 原路径，客户端版可绑定后写回）'}
          </p>
          <p className="text-xs text-muted-foreground">
            创建 {new Date(story.createdAt).toLocaleDateString('zh-CN')} · 最近修改 {new Date(story.updatedAt).toLocaleDateString('zh-CN')}
          </p>
          <p className="text-xs text-muted-foreground">
            上次重新导入：{fmtTime(story.lastImportedAt)} · 上次导出：{fmtTime(story.lastExportedAt)}
          </p>
        </CardContent>
      </Card>

      {/* ① 检查 ST 更新：网页版 = 手动重新导入同一文件，合并规则与客户端一致 */}
      <Card>
        <CardContent className="py-5 space-y-2">
          <p className="text-sm font-medium">检查 ST 更新（重新导入）</p>
          <p className="text-xs text-muted-foreground">
            在 ST 里接着玩了？把同一个聊天文件再导入一次：新楼直接追加；同一楼两边不同时，
            ST 新版当正文，STE 里的编辑版转成该楼候选并标「STE 编辑版」，不弹逐条对比。
          </p>
          <p className="text-xs text-muted-foreground">
            合并进当前脉络：<span className="text-foreground">{branchName}</span>（{line.session.messages.length} 楼）。
            分支文件请先在左栏切到对应分支再导入。
          </p>
          <input
            ref={fileRef}
            type="file"
            accept=".jsonl,.json"
            className="hidden"
            onChange={(e) => handleReimport(e.target.files)}
          />
          <div className="flex flex-wrap items-center gap-2">
            {canReimportFromSource && (
              <Button size="sm" onClick={handleReimportFromSource}>
                <RefreshCw className="w-4 h-4 mr-1.5" />
                按原绑定文件重新导入
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
              <FileUp className="w-4 h-4 mr-1.5" />
              {canReimportFromSource ? '另选文件重新导入' : '选择文件重新导入'}
            </Button>
          </div>
          {isTauri() && story.sourcePath && branchId !== null && (
            <p className="text-[11px] text-muted-foreground/70">当前在分支上：原绑定文件属于主线，请切回主线再一键重导，或另选该分支的文件。</p>
          )}
          {!isTauri() && (
            <p className="text-[11px] text-muted-foreground/70">客户端版打开故事时会自动比对 ST 目录并在角落提示，这里还可一键按原文件重导。</p>
          )}
        </CardContent>
      </Card>

      {/* ② 导出副本 */}
      <Card>
        <CardContent className="py-5 space-y-3">
          <div>
            <p className="text-sm font-medium">导出副本</p>
            <p className="text-xs text-muted-foreground mt-1">
              聊天（当前脉络：{branchName}）按阅读界面的楼层范围/正则/清理设置导出，支持 JSONL / TXT / Markdown。
            </p>
          </div>
          <ExportButton session={line.session} settings={settings} markers={line.markers} onExported={markExported} />

          {(records.length > 0 || trees.length > 0) && (
            <>
              <Separator />
              <p className="text-xs font-medium text-muted-foreground">本故事的整理成果</p>
              <div className="space-y-1.5">
                {records.map((r) => (
                  <div key={r.id} className="flex items-center gap-2 text-sm">
                    <Badge variant="outline" className="h-5 shrink-0 text-[11px] font-normal">{SUMMARY_KIND_LABELS[r.kind]}</Badge>
                    <span className="flex-1 truncate">{r.title || SUMMARY_KIND_LABELS[r.kind]}</span>
                    <Button variant="ghost" size="sm" className="h-7 px-2 text-xs shrink-0" onClick={() => handleExportRecordMd(r)}>
                      <FileDown className="w-3.5 h-3.5 mr-1" />MD
                    </Button>
                  </div>
                ))}
                {trees.map((t) => (
                  <div key={t.id} className="flex items-center gap-2 text-sm">
                    <Badge variant="outline" className="h-5 shrink-0 text-[11px] font-normal">故事树</Badge>
                    <span className="flex-1 truncate">{t.title || '未命名故事树'}</span>
                    <Button variant="ghost" size="sm" className="h-7 px-2 text-xs shrink-0" onClick={() => handleExportTreeMd(t)}>
                      <FileDown className="w-3.5 h-3.5 mr-1" />MD
                    </Button>
                    <Button variant="ghost" size="sm" className="h-7 px-2 text-xs shrink-0" onClick={() => handleExportTreeJson(t)}>
                      <FileJson className="w-3.5 h-3.5 mr-1" />JSON
                    </Button>
                  </div>
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* ③ 写回 ST：客户端 + 已绑定原路径 = 真实现（阶段7.5），否则保留说明占位 */}
      {isTauri() && story.characterId && story.sourcePath ? (
        <WritebackSection story={story} onStoryUpdate={onStoryUpdate} />
      ) : (
        <Card>
          <CardContent className="py-5 space-y-1.5 opacity-70">
            <div className="flex items-center gap-2">
              <FileUp className="w-4 h-4 text-muted-foreground" />
              <p className="text-sm font-medium">写回 ST</p>
              <Badge variant="outline" className="h-5 text-[11px]">客户端版功能</Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              仅客户端版、且故事绑定了 ST 原路径时开放：写回前自动备份原文件（保留最近若干版可恢复），
              确认摘要后执行并记录写回历史。
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
