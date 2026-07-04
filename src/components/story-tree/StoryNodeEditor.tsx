import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Pin, Archive, Trash2 } from 'lucide-react';
import type { StoryNode } from '@/types/story-tree';

interface StoryNodeEditorProps {
  node: StoryNode;
  onChange: (patch: Partial<Omit<StoryNode, 'id' | 'parentId' | 'order'>>) => void;
  onDelete: () => void;
}

/** 右栏节点编辑表单：标题/提示/正文/标签 + 置顶/归档开关 + 删除 */
export function StoryNodeEditor({ node, onChange, onDelete }: StoryNodeEditorProps) {
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
        <Label htmlFor="node-content" className="text-xs text-muted-foreground">正文（事实描述）</Label>
        <Textarea
          id="node-content"
          value={node.content}
          onChange={(e) => onChange({ content: e.target.value })}
          className="min-h-[30vh] text-sm"
          placeholder="记录这个节点的事实信息……"
        />
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
