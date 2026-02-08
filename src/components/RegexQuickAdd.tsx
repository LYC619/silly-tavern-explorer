import { useState } from 'react';
import { Wand2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import type { RegexRule } from '@/types/chat';

interface RegexQuickAddProps {
  onAddRule: (rule: RegexRule) => void;
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function RegexQuickAdd({ onAddRule }: RegexQuickAddProps) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [startTag, setStartTag] = useState('');
  const [endTag, setEndTag] = useState('');
  const [ruleName, setRuleName] = useState('');

  const generateRegex = () => {
    if (!startTag || !endTag) {
      toast({ title: '请填写开始和结束标签', variant: 'destructive' });
      return;
    }

    const escapedStart = escapeRegex(startTag);
    const escapedEnd = escapeRegex(endTag);
    const regex = `${escapedStart}[\\s\\S]*?${escapedEnd}(\\n)?`;

    const newRule: RegexRule = {
      id: crypto.randomUUID(),
      name: ruleName || `移除 ${startTag}...${endTag}`,
      findRegex: regex,
      replaceString: '',
      placement: ['all'],
      disabled: false,
    };

    onAddRule(newRule);
    toast({ title: '规则已添加' });
    setOpen(false);
    setStartTag('');
    setEndTag('');
    setRuleName('');
  };

  const previewRegex = startTag && endTag 
    ? `/${escapeRegex(startTag)}[\\s\\S]*?${escapeRegex(endTag)}(\\n)?/gs`
    : '';

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1">
          <Wand2 className="w-3 h-3" />
          快速添加
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>快速生成正则</DialogTitle>
          <DialogDescription>
            输入包裹内容的开始和结束标签，自动生成匹配规则
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="start-tag">开始标签</Label>
              <Input
                id="start-tag"
                value={startTag}
                onChange={(e) => setStartTag(e.target.value)}
                placeholder="<content>"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="end-tag">结束标签</Label>
              <Input
                id="end-tag"
                value={endTag}
                onChange={(e) => setEndTag(e.target.value)}
                placeholder="</content>"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="rule-name">规则名称（可选）</Label>
            <Input
              id="rule-name"
              value={ruleName}
              onChange={(e) => setRuleName(e.target.value)}
              placeholder={startTag && endTag ? `移除 ${startTag}...${endTag}` : '自定义规则'}
            />
          </div>

          {previewRegex && (
            <div className="space-y-2">
              <Label>预览正则</Label>
              <div className="p-3 bg-muted rounded-lg font-mono text-xs break-all">
                {previewRegex}
              </div>
            </div>
          )}

          <div className="text-xs text-muted-foreground space-y-1">
            <p>💡 常见标签示例:</p>
            <ul className="list-disc list-inside space-y-0.5 ml-2">
              <li><code>&lt;thinking&gt;</code> 和 <code>&lt;/thinking&gt;</code></li>
              <li><code>[思考中...]</code> 和 <code>[/思考]</code></li>
              <li><code>*状态：</code> 和 <code>*</code></li>
            </ul>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            取消
          </Button>
          <Button onClick={generateRegex} disabled={!startTag || !endTag}>
            生成规则
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
