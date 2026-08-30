import { useState } from 'react';
import { Copy, Check, Save, Bookmark, Pencil, BookOpen, Upload, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { AIRewriteContent } from '@/components/worldbook/AIRewriteContent';
import { DiaryView } from '@/components/summary/DiaryView';
import type { SummaryKind } from '@/types/summary';
import { SUMMARY_KIND_LABELS } from '@/types/summary';

interface SummaryResultEditorProps {
  kind: SummaryKind;
  title: string;
  onTitleChange: (t: string) => void;
  content: string;
  onContentChange: (c: string) => void;
  /** 流式生成中（禁用编辑区提示） */
  streaming: boolean;
  /** 「保存」= 手动永久保存（autoSaved:false）。已自动落库，此按钮转永久。 */
  onSave: () => void;
  saving?: boolean;
  /** 是否已永久保存（控制按钮态） */
  savedPermanent?: boolean;
  /** 「不要了」= 删掉已自动暂存的记录并清空结果区。不传则不显示该按钮。 */
  onDiscard?: () => void;
  /** 角色名（日记本署名兜底） */
  charName?: string;
}

const REWRITE_PRESETS = ['润色措辞', '精简篇幅', '扩写细节', '调整语气更客观'];

/** 总结结果编辑器：标题 + 正文编辑 + AI 微调 + 保存/复制/导出 .md；日记支持日记本预览 */
export function SummaryResultEditor({
  kind, title, onTitleChange, content, onContentChange,
  streaming, onSave, saving, savedPermanent, onDiscard, charName,
}: SummaryResultEditorProps) {
  const { toast } = useToast();
  const [diaryView, setDiaryView] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast({ title: '已复制到剪贴板' });
  };

  const handleDownload = () => {
    const safeName = (title || SUMMARY_KIND_LABELS[kind]).replace(/[\\/:*?"<>|]/g, '_');
    const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${safeName}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <CardTitle className="text-base">生成结果</CardTitle>
          {/* 窄栏（整理与记录中栏）下按钮行必须可换行，否则溢出卡片压到右栏 */}
          <div className="flex items-center gap-2 flex-wrap justify-end">
            {!streaming && content && (
              <AIRewriteContent
                content={content}
                onResult={onContentChange}
                compact
                title="AI 微调本篇总结"
                systemPrompt={`你是一位文本编辑。请根据用户的要求改写下面的${SUMMARY_KIND_LABELS[kind]}文本，保持原有信息与结构，只按要求调整。直接输出改写后的完整文本，不要加解释。`}
                quickPresets={REWRITE_PRESETS}
              />
            )}
            <Button variant="ghost" size="sm" className="gap-1" onClick={handleCopy} disabled={!content}>
              {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              复制
            </Button>
            <Button variant="ghost" size="sm" className="gap-1" onClick={handleDownload} disabled={!content}>
              <Upload className="w-3.5 h-3.5" />导出 .md
            </Button>
            {onDiscard && (
              <Button
                variant="ghost"
                size="sm"
                className="gap-1 text-muted-foreground hover:text-destructive"
                onClick={onDiscard}
                disabled={!content || streaming || saving}
              >
                <Trash2 className="w-3.5 h-3.5" />不要了
              </Button>
            )}
            <Button size="sm" className="gap-1" onClick={onSave} disabled={!content || saving}>
              {savedPermanent ? <Bookmark className="w-3.5 h-3.5" /> : <Save className="w-3.5 h-3.5" />}
              {savedPermanent ? '已保存' : '保存'}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-1">
          <Label htmlFor="sum-title" className="text-xs text-muted-foreground">标题</Label>
          <Input
            id="sum-title"
            value={title}
            onChange={(e) => onTitleChange(e.target.value)}
            placeholder="总结标题（生成后可自动提取，也可手改）"
          />
        </div>
        {kind === 'diary' && !streaming && content && (
          <div className="flex items-center gap-1">
            <Button
              variant={!diaryView ? 'default' : 'ghost'}
              size="sm"
              className="gap-1"
              onClick={() => setDiaryView(false)}
            >
              <Pencil className="w-3.5 h-3.5" />编辑
            </Button>
            <Button
              variant={diaryView ? 'default' : 'ghost'}
              size="sm"
              className="gap-1"
              onClick={() => setDiaryView(true)}
            >
              <BookOpen className="w-3.5 h-3.5" />日记本
            </Button>
          </div>
        )}
        {kind === 'diary' && diaryView && !streaming && content ? (
          <DiaryView content={content} charName={charName} />
        ) : (
          <Textarea
            value={content}
            onChange={(e) => onContentChange(e.target.value)}
            className="min-h-[40vh] font-mono text-xs leading-relaxed"
            placeholder={streaming ? '生成中…' : '生成的总结将显示在这里，可自由编辑。'}
          />
        )}
        <p className="text-xs text-muted-foreground">
          生成后已自动暂存，「保存」将其转为永久保留（不受自动清理影响）
          {onDiscard ? '；不满意点「不要了」直接删掉，不用等自动清理。' : '。'}
        </p>
      </CardContent>
    </Card>
  );
}
