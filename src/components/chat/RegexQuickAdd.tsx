import { useState } from 'react';
import { Wand2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
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
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import type { RegexRule } from '@/types/chat';

interface RegexQuickAddProps {
  onAddRule: (rule: RegexRule) => void;
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

type QuickMode = 'wrap' | 'replace' | 'trim';

export function RegexQuickAdd({ onAddRule }: RegexQuickAddProps) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<QuickMode>('wrap');

  // 模式一：标签包裹删除
  const [startTag, setStartTag] = useState('');
  const [endTag, setEndTag] = useState('');

  // 模式二：内容替换（A → B）
  const [findText, setFindText] = useState('');
  const [replaceText, setReplaceText] = useState('');

  // 模式三：首尾删除（消息开头→标记 / 标记→消息结尾）
  const [trimDirection, setTrimDirection] = useState<'head' | 'tail'>('head');
  const [trimMarker, setTrimMarker] = useState('');
  const [trimKeepMarker, setTrimKeepMarker] = useState(false);

  const [ruleName, setRuleName] = useState('');

  const resetAll = () => {
    setStartTag('');
    setEndTag('');
    setFindText('');
    setReplaceText('');
    setTrimMarker('');
    setTrimKeepMarker(false);
    setRuleName('');
  };

  const generateWrapRule = () => {
    if (!startTag || !endTag) {
      toast({ title: '请填写开始和结束标签', variant: 'destructive' });
      return;
    }
    const regex = `${escapeRegex(startTag)}[\\s\\S]*?${escapeRegex(endTag)}(\\n)?`;
    onAddRule({
      id: crypto.randomUUID(),
      name: ruleName || `移除 ${startTag}...${endTag}`,
      findRegex: regex,
      replaceString: '',
      placement: ['all'],
      disabled: false,
    });
    toast({ title: '规则已添加' });
    setOpen(false);
    resetAll();
  };

  const generateReplaceRule = () => {
    if (!findText) {
      toast({ title: '请填写要查找的内容', variant: 'destructive' });
      return;
    }
    onAddRule({
      id: crypto.randomUUID(),
      name: ruleName || (replaceText ? `${findText} → ${replaceText}` : `删除 ${findText}`),
      findRegex: escapeRegex(findText),
      replaceString: replaceText,
      placement: ['all'],
      disabled: false,
    });
    toast({ title: '规则已添加' });
    setOpen(false);
    resetAll();
  };

  // 首尾删除的 pattern（默认 /gs 无 m，^/$ 锚定单条消息的开头/结尾）
  const trimPattern = trimMarker
    ? (trimDirection === 'head'
        ? `^[\\s\\S]*?${escapeRegex(trimMarker)}`
        : `${escapeRegex(trimMarker)}[\\s\\S]*$`)
    : '';

  const generateTrimRule = () => {
    if (!trimMarker) {
      toast({ title: '请填写标记文字', variant: 'destructive' });
      return;
    }
    // 保留标记时替换为标记本身；replace 的替换串里 $ 有特殊含义，转义为 $$
    const replacement = trimKeepMarker ? trimMarker.replace(/\$/g, '$$$$') : '';
    onAddRule({
      id: crypto.randomUUID(),
      name: ruleName || (trimDirection === 'head' ? `删除开头至 ${trimMarker}` : `删除 ${trimMarker} 至结尾`),
      findRegex: trimPattern,
      replaceString: replacement,
      placement: ['all'],
      disabled: false,
    });
    toast({ title: '规则已添加' });
    setOpen(false);
    resetAll();
  };

  const wrapPreview = startTag && endTag
    ? `/${escapeRegex(startTag)}[\\s\\S]*?${escapeRegex(endTag)}(\\n)?/gs`
    : '';
  const replacePreview = findText
    ? `/${escapeRegex(findText)}/g → "${replaceText}"`
    : '';

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) resetAll(); }}>
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
            选择一种方式自动生成清理规则，无需手写正则
          </DialogDescription>
        </DialogHeader>

        <Tabs value={mode} onValueChange={(v) => setMode(v as QuickMode)}>
          <TabsList className="flex w-full">
            <TabsTrigger value="wrap" className="flex-1 whitespace-nowrap">标签包裹</TabsTrigger>
            <TabsTrigger value="replace" className="flex-1 whitespace-nowrap">内容替换</TabsTrigger>
            <TabsTrigger value="trim" className="flex-1 whitespace-nowrap">首尾删除</TabsTrigger>
          </TabsList>

          {/* 模式一：删除「开始标签…结束标签」之间的全部内容 */}
          <TabsContent value="wrap" className="space-y-4 pt-4">
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
            {wrapPreview && (
              <div className="space-y-2">
                <Label>预览正则</Label>
                <div className="p-3 bg-muted rounded-lg font-mono text-xs break-all">
                  {wrapPreview}
                </div>
              </div>
            )}
            <div className="text-xs text-muted-foreground space-y-1">
              <p>💡 删除标签及其之间的全部内容，常见示例：</p>
              <ul className="list-disc list-inside space-y-0.5 ml-2">
                <li><code>&lt;thinking&gt;</code> 和 <code>&lt;/thinking&gt;</code></li>
                <li><code>&lt;status&gt;</code> 和 <code>&lt;/status&gt;</code></li>
              </ul>
            </div>
          </TabsContent>

          {/* 模式二：把指定内容整体替换为另一段（替换为空即为删除） */}
          <TabsContent value="replace" className="space-y-4 pt-4">
            <div className="space-y-2">
              <Label htmlFor="find-text">查找内容</Label>
              <Input
                id="find-text"
                value={findText}
                onChange={(e) => setFindText(e.target.value)}
                placeholder="要替换的文字，如 AAA"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="replace-text">替换为</Label>
              <Input
                id="replace-text"
                value={replaceText}
                onChange={(e) => setReplaceText(e.target.value)}
                placeholder="留空表示删除，如 BBB"
              />
            </div>
            {replacePreview && (
              <div className="space-y-2">
                <Label>预览</Label>
                <div className="p-3 bg-muted rounded-lg font-mono text-xs break-all">
                  {replacePreview}
                </div>
              </div>
            )}
            <div className="text-xs text-muted-foreground">
              💡 通篇把某段文字替换为另一段，例如把角色旧名「AAA」全部改成「BBB」；替换为空则直接删除该文字。按原文精确匹配，无需转义。
            </div>
          </TabsContent>

          {/* 模式三：删除消息开头→标记 / 标记→消息结尾 */}
          <TabsContent value="trim" className="space-y-4 pt-4">
            <div className="space-y-2">
              <Label>删除方向</Label>
              <Select value={trimDirection} onValueChange={(v) => setTrimDirection(v as 'head' | 'tail')}>
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="head">从消息开头 删到 标记处</SelectItem>
                  <SelectItem value="tail">从标记处 删到 消息结尾</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="trim-marker">标记文字</Label>
              <Input
                id="trim-marker"
                value={trimMarker}
                onChange={(e) => setTrimMarker(e.target.value)}
                placeholder={trimDirection === 'head' ? '如 —— 正文开始 ——' : '如 【状态栏】'}
              />
            </div>
            <div className="flex items-center gap-2">
              <Checkbox id="trim-keep" checked={trimKeepMarker} onCheckedChange={(c) => setTrimKeepMarker(c === true)} />
              <Label htmlFor="trim-keep" className="text-sm font-normal cursor-pointer">保留标记文字本身（只删标记之外的部分）</Label>
            </div>
            {trimPattern && (
              <div className="space-y-2">
                <Label>预览正则</Label>
                <div className="p-3 bg-muted rounded-lg font-mono text-xs break-all">
                  /{trimPattern}/gs
                </div>
              </div>
            )}
            <div className="text-xs text-muted-foreground">
              💡 按<b>每条消息</b>处理：删除消息开头到标记<b>首次出现</b>处（或标记首次出现处到消息结尾）的全部内容。适合裁掉每楼固定的开场杂项 / 结尾状态栏。
            </div>
          </TabsContent>
        </Tabs>

        <div className="space-y-2">
          <Label htmlFor="rule-name">规则名称（可选）</Label>
          <Input
            id="rule-name"
            value={ruleName}
            onChange={(e) => setRuleName(e.target.value)}
            placeholder="自定义规则"
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            取消
          </Button>
          {mode === 'wrap' ? (
            <Button onClick={generateWrapRule} disabled={!startTag || !endTag}>
              生成规则
            </Button>
          ) : mode === 'replace' ? (
            <Button onClick={generateReplaceRule} disabled={!findText}>
              生成规则
            </Button>
          ) : (
            <Button onClick={generateTrimRule} disabled={!trimMarker}>
              生成规则
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
