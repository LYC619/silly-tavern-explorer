/**
 * 处理区入口页（2.0 阶段5，定稿第六章）：首页第二主入口。
 * 解决"我手上有个文件要处理"——大拖放区 + 工具列表，不要求先建档。
 * 丢文件后弹类型选择（程序给默认猜测，用户确认），随后分流到对应工具页。
 */
import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { UploadCloud, ScrollText, Globe, IdCard, SlidersHorizontal, Regex, ArrowRight } from 'lucide-react';
import { AppLayout } from '@/components/AppLayout';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { guessFileType, TOOL_TYPE_LABELS, type ToolFileType } from '@/lib/file-type-guess';
import { setPendingToolFile } from '@/lib/tool-handoff';
import { APP_VERSION } from '@/components/GlobalSettings';

interface ToolEntry {
  type: ToolFileType;
  label: string;
  desc: string;
  icon: typeof ScrollText;
  path: string;
  /** 聊天是最高频入口，视觉上突出 */
  primary?: boolean;
}

const TOOLS: ToolEntry[] = [
  { type: 'chat', label: '聊天处理', desc: '正则清理、编辑、章节、导出与阅读', icon: ScrollText, path: '/chat', primary: true },
  { type: 'worldbook', label: '世界书', desc: '条目浏览、编辑、批量整理、AI 追加', icon: Globe, path: '/worldbook' },
  { type: 'card', label: '角色卡', desc: '查看与编辑卡内字段，PNG/JSON 回写', icon: IdCard, path: '/card-viewer' },
  { type: 'preset', label: '预设', desc: '提示词块可视化编辑与导出', icon: SlidersHorizontal, path: '/preset' },
  { type: 'regex', label: '正则', desc: '规则管理、批量导入、可视化生效预览', icon: Regex, path: '/regex' },
];

const Tools = () => {
  const navigate = useNavigate();
  const [dragOver, setDragOver] = useState(false);
  // 待确认的文件 + 程序猜测（null = 没猜出来，让用户自己选）
  const [pending, setPending] = useState<{ file: File; guess: ToolFileType | null } | null>(null);
  const [chosenType, setChosenType] = useState<ToolFileType>('chat');

  const handleFile = useCallback(async (file: File) => {
    // .json 需要读内容嗅探；其他类型看扩展名即可
    let content: string | undefined;
    if (file.name.toLowerCase().endsWith('.json')) {
      try {
        content = await file.text();
      } catch { /* 读失败按无内容处理 */ }
    }
    const guess = guessFileType(file.name, content);
    setPending({ file, guess });
    setChosenType(guess ?? 'chat');
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const handleConfirm = () => {
    if (!pending) return;
    const target = TOOLS.find((t) => t.type === chosenType);
    if (!target) return;
    setPendingToolFile(chosenType, pending.file);
    setPending(null);
    navigate(target.path);
  };

  return (
    <AppLayout>
      <div className="container mx-auto px-4 py-6">
        <div className="max-w-3xl mx-auto space-y-6 animate-fade-in">
          <div className="text-center">
            <h1 className="font-display text-3xl mb-2 text-gradient">处理区</h1>
            <p className="text-muted-foreground text-sm">
              丢进来一个文件，或直接打开工具。处理完可入库归档，也可以只导出、不留档。
            </p>
          </div>

          {/* 大拖放区 */}
          <Card
            className={`relative p-10 border-2 border-dashed transition-all duration-300 cursor-pointer ${
              dragOver ? 'border-primary bg-primary/5 scale-[1.01]' : 'border-border hover:border-primary/50'
            }`}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => document.getElementById('tools-file-input')?.click()}
            data-tour="tools-dropzone"
          >
            <input
              id="tools-file-input"
              type="file"
              accept=".jsonl,.json,.txt,.png"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ''; }}
            />
            <div className="flex flex-col items-center gap-3 text-center">
              <div className={`p-4 rounded-full transition-colors ${dragOver ? 'bg-primary/20' : 'bg-secondary'}`}>
                <UploadCloud className={`w-8 h-8 ${dragOver ? 'text-primary' : 'text-muted-foreground'}`} />
              </div>
              <div>
                <h2 className="font-display text-lg font-semibold">拖入文件开始处理</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  聊天记录 (.jsonl/.json/.txt) · 角色卡 (.png/.json) · 世界书 / 预设 / 正则 (.json)
                </p>
              </div>
            </div>
          </Card>

          {/* 工具列表：不带文件也能直接进 */}
          <div className="flex flex-wrap gap-3">
            {TOOLS.map((tool) => {
              const Icon = tool.icon;
              return (
                <button
                  key={tool.type}
                  onClick={() => navigate(tool.path)}
                  className={`flex items-start gap-3 rounded-lg border p-4 text-left transition-colors basis-[16rem] grow hover:border-primary/50 ${
                    tool.primary ? 'bg-primary/5 border-primary/30' : 'bg-card border-border'
                  }`}
                >
                  <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${tool.primary ? 'gold-gradient shadow-card' : 'bg-secondary'}`}>
                    <Icon className={`w-5 h-5 ${tool.primary ? 'text-primary-foreground' : 'text-muted-foreground'}`} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-sm flex items-center gap-1">
                      {tool.label}
                      <ArrowRight className="w-3.5 h-3.5 text-muted-foreground" />
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">{tool.desc}</p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* 类型确认：程序猜测 + 用户拍板（选择器即适配层） */}
      <Dialog open={!!pending} onOpenChange={(v) => { if (!v) setPending(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>这是什么文件？</DialogTitle>
            <DialogDescription>
              {pending?.file.name}
              {pending?.guess
                ? ` — 看起来像${TOOL_TYPE_LABELS[pending.guess]}，确认后进入对应工具`
                : ' — 没认出来，请选择用哪个工具处理'}
            </DialogDescription>
          </DialogHeader>
          <RadioGroup value={chosenType} onValueChange={(v) => setChosenType(v as ToolFileType)} className="space-y-2">
            {TOOLS.map((tool) => (
              <div
                key={tool.type}
                className="flex items-center gap-3 p-2.5 rounded-lg border border-border hover:bg-accent/50 cursor-pointer"
                onClick={() => setChosenType(tool.type)}
              >
                <RadioGroupItem value={tool.type} id={`type-${tool.type}`} />
                <Label htmlFor={`type-${tool.type}`} className="cursor-pointer flex-1">
                  {TOOL_TYPE_LABELS[tool.type]}
                  {pending?.guess === tool.type && (
                    <span className="ml-2 text-xs text-primary">（猜测）</span>
                  )}
                </Label>
              </div>
            ))}
          </RadioGroup>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPending(null)}>取消</Button>
            <Button onClick={handleConfirm}>确认并处理</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <footer className="border-t border-border py-6 text-center text-sm text-muted-foreground">
        <p>ST 聊天记录处理器 {APP_VERSION}</p>
      </footer>
    </AppLayout>
  );
};

export default Tools;
