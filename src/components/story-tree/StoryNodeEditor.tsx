import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Pin, Archive, Trash2, Layers, Pencil } from 'lucide-react';
import type { StoryNode } from '@/types/story-tree';
import { splitContentSections } from '@/lib/story-tree-ai';

interface StoryNodeEditorProps {
  node: StoryNode;
  onChange: (patch: Partial<Omit<StoryNode, 'id' | 'parentId' | 'order'>>) => void;
  onDelete: () => void;
}

/** 右栏节点编辑表单：标题/提示/正文/标签 + 置顶/归档开关 + 删除。
 *  正文含多个 `## 卷/阶段` 小节时，提供「分卷」只读视图，按卷展现角色状态变化。 */
export function StoryNodeEditor({ node, onChange, onDelete }: StoryNodeEditorProps) {
  const sections = splitContentSections(node.content);
  const hasSections = sections.some((s) => s.label != null);
  // 有分卷小节时默认走分卷阅读视图；点「编辑」切回纯文本编辑
  const [byVolume, setByVolume] = useState(hasSections);

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <Label htmlFor="node-title" className="text-xs text-muted-foreground">标题</Label>
        <Input
          id="node-title"
          value={node.title}
          onChange={(e) => onChange({ title: e.target.value })}
          className="h-8"
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="node-hint" className="text-xs text-muted-foreground">提示 / 别名（大纲里跟在标题后）</Label>
        <Input
          id="node-hint"
          value={node.hint}
          onChange={(e) => onChange({ hint: e.target.value })}
          className="h-8"
        />
      </div>
      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <Label htmlFor="node-content" className="text-xs text-muted-foreground">正文（事实描述）</Label>
          {hasSections && (
            <div className="flex items-center gap-1">
              <Button
                variant={byVolume ? 'default' : 'ghost'} size="sm" className="h-6 px-2 gap-1 text-xs"
                onClick={() => setByVolume(true)}
              >
                <Layers className="w-3 h-3" />分卷
              </Button>
              <Button
                variant={!byVolume ? 'default' : 'ghost'} size="sm" className="h-6 px-2 gap-1 text-xs"
                onClick={() => setByVolume(false)}
              >
                <Pencil className="w-3 h-3" />编辑
              </Button>
            </div>
          )}
        </div>
        {hasSections && byVolume ? (
          <div className="space-y-2 max-h-[42vh] overflow-y-auto pr-0.5">
            {sections.map((s, i) => (
              <div key={i} className="rounded-md border bg-muted/30 p-2.5">
                {s.label && (
                  <div className="text-xs font-medium text-primary mb-1">{s.label}</div>
                )}
                <div className="text-sm whitespace-pre-wrap leading-relaxed text-foreground/90">
                  {s.body || <span className="text-muted-foreground">（空）</span>}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <Textarea
            id="node-content"
            value={node.content}
            onChange={(e) => onChange({ content: e.target.value })}
            className="min-h-[30vh] text-sm"
            placeholder="记录这个节点的事实信息……"
          />
        )}
        {hasSections && byVolume && (
          <p className="text-xs text-muted-foreground">按 AI 生成时的卷/楼层分段展示，点「编辑」可改原文（含 ## 小节标题）。</p>
        )}
      </div>
      <div className="space-y-1">
        <Label htmlFor="node-tags" className="text-xs text-muted-foreground">标签（逗号分隔）</Label>
        <Input
          id="node-tags"
          value={node.tags.join(', ')}
          onChange={(e) => onChange({ tags: e.target.value.split(',').map((t) => t.trim()).filter(Boolean) })}
          className="h-8"
          placeholder="人物, 关系, 地点…"
        />
      </div>
      <div className="flex items-center gap-4 flex-wrap pt-1">
        <label className="flex items-center gap-1.5 text-sm cursor-pointer">
          <Checkbox checked={node.pinned} onCheckedChange={(v) => onChange({ pinned: v === true })} />
          <Pin className="w-3.5 h-3.5" />置顶
        </label>
        <label className="flex items-center gap-1.5 text-sm cursor-pointer">
          <Checkbox checked={node.archived} onCheckedChange={(v) => onChange({ archived: v === true })} />
          <Archive className="w-3.5 h-3.5" />归档
        </label>
        <Button variant="ghost" size="sm" className="h-7 gap-1 text-destructive ml-auto" onClick={onDelete}>
          <Trash2 className="w-3.5 h-3.5" />删除节点（含子节点）
        </Button>
      </div>
    </div>
  );
}
