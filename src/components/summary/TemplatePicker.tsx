import { useState } from 'react';
import { Pencil, Save, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import type { SummaryKind, SummaryTemplate } from '@/types/summary';
import { generateSummaryTemplateId } from '@/types/summary';
import {
  type AnySummaryTemplate,
  isBuiltinTemplate,
} from '@/lib/summary-templates';
import { saveSummaryTemplate } from '@/lib/summary-db';

interface TemplatePickerProps {
  kind: SummaryKind;
  templates: AnySummaryTemplate[];
  selectedId: string;
  onSelect: (id: string) => void;
  /** 当前选中模板的正文（由父组件持有，允许临时编辑不落库） */
  content: string;
  onContentChange: (content: string) => void;
  /** 模板库有变化（新增自定义）时通知父组件重新加载列表 */
  onTemplatesChanged: () => void;
}

/**
 * 提示词模板选择器：内置/自定义下拉 + 查看编辑当前模板正文 + 另存为自定义模板。
 * 选中内置模板时正文只读预览，编辑会引导「另存为自定义」；选中自定义模板可直接改并保存。
 */
export function TemplatePicker({
  kind, templates, selectedId, onSelect, content, onContentChange, onTemplatesChanged,
}: TemplatePickerProps) {
  const { toast } = useToast();
  const [editOpen, setEditOpen] = useState(false);
  const [saveAsOpen, setSaveAsOpen] = useState(false);
  const [saveAsName, setSaveAsName] = useState('');

  const selected = templates.find((t) => t.id === selectedId);
  const isBuiltin = selected ? isBuiltinTemplate(selected) : false;

  const handleSaveAs = async () => {
    const title = saveAsName.trim();
    if (!title) {
      toast({ title: '请输入模板名称', variant: 'destructive' });
      return;
    }
    const tpl: SummaryTemplate = {
      id: generateSummaryTemplateId(),
      title,
      kind,
      content,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    await saveSummaryTemplate(tpl);
    setSaveAsOpen(false);
    setSaveAsName('');
    onTemplatesChanged();
    onSelect(tpl.id);
    toast({ title: '已保存为自定义模板', description: title });
  };

  const handleUpdateCustom = async () => {
    if (!selected || isBuiltinTemplate(selected)) return;
    const tpl: SummaryTemplate = { ...selected, content, updatedAt: Date.now() };
    await saveSummaryTemplate(tpl);
    setEditOpen(false);
    onTemplatesChanged();
    toast({ title: '模板已更新', description: selected.title });
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Label className="text-sm shrink-0">提示词模板</Label>
        <Select value={selectedId} onValueChange={onSelect}>
          <SelectTrigger className="h-8 flex-1">
            <SelectValue placeholder="选择模板" />
          </SelectTrigger>
          <SelectContent>
            {templates.map((t) => (
              <SelectItem key={t.id} value={t.id}>
                {t.title}{isBuiltinTemplate(t) ? '' : '（自定义）'}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" className="h-8 gap-1" onClick={() => setEditOpen(true)}>
          <Pencil className="w-3.5 h-3.5" />
          {isBuiltin ? '查看' : '编辑'}
        </Button>
      </div>

      {/* 查看/编辑模板正文 */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="!max-w-3xl">
          <DialogHeader>
            <DialogTitle>{isBuiltin ? '查看内置模板' : '编辑自定义模板'} · {selected?.title}</DialogTitle>
          </DialogHeader>
          <Textarea
            value={content}
            onChange={(e) => onContentChange(e.target.value)}
            className="min-h-[50vh] font-mono text-xs"
            placeholder="提示词全文，支持 {{char}} / {{user}} / {{volume}} 宏"
          />
          <p className="text-xs text-muted-foreground">
            {isBuiltin
              ? '内置模板不可直接改写。修改后请「另存为自定义模板」，本次生成也会用当前正文。'
              : '编辑后点「保存修改」更新此自定义模板；也可另存为新模板。'}
          </p>
          <DialogFooter className="gap-2">
            <Button variant="outline" className="gap-1" onClick={() => { setSaveAsName(selected ? `${selected.title} 副本` : ''); setSaveAsOpen(true); }}>
              <Plus className="w-4 h-4" />另存为自定义
            </Button>
            {!isBuiltin && (
              <Button className="gap-1" onClick={handleUpdateCustom}>
                <Save className="w-4 h-4" />保存修改
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 另存为 */}
      <Dialog open={saveAsOpen} onOpenChange={setSaveAsOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>另存为自定义模板</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="tpl-name">模板名称</Label>
            <Input
              id="tpl-name"
              value={saveAsName}
              onChange={(e) => setSaveAsName(e.target.value)}
              placeholder="给这个模板起个名字"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSaveAsOpen(false)}>取消</Button>
            <Button onClick={handleSaveAs}>保存</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
