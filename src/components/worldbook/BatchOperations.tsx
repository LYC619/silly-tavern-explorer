import { useState } from 'react';
import { useIsMobile } from '@/hooks/use-mobile';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { CheckSquare, X, Trash2, TextCursorInput, MapPin, Zap, ToggleLeft, ToggleRight, MoreHorizontal, CheckCheck, XCircle } from 'lucide-react';
import { POSITION_LABELS, ROLE_LABELS } from '@/types/worldbook';

interface BatchOperationsProps {
  selectedKeys: Set<string>;
  totalFiltered: number;
  onSelectAll: () => void;
  onDeselectAll: () => void;
  onExitBatch: () => void;
  onBatchPrefix: (prefix: string) => void;
  onBatchDelete: () => void;
  onBatchPosition: (position: number, depth?: number, role?: number) => void;
  onBatchStrategy: (strategy: 'keyword' | 'constant' | 'vectorized') => void;
  onBatchEnable: (enabled: boolean) => void;
}

export function BatchOperations({
  selectedKeys, totalFiltered,
  onSelectAll, onDeselectAll, onExitBatch,
  onBatchPrefix, onBatchDelete, onBatchPosition, onBatchStrategy, onBatchEnable,
}: BatchOperationsProps) {
  const isMobile = useIsMobile();
  const count = selectedKeys.size;

  // Dialog states
  const [prefixOpen, setPrefixOpen] = useState(false);
  const [prefixText, setPrefixText] = useState('');
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [positionOpen, setPositionOpen] = useState(false);
  const [posValue, setPosValue] = useState('1');
  const [posDepth, setPosDepth] = useState(4);
  const [posRole, setPosRole] = useState(0);
  const [strategyOpen, setStrategyOpen] = useState(false);
  const [strategyValue, setStrategyValue] = useState<'keyword' | 'constant' | 'vectorized'>('keyword');

  const handlePrefixApply = () => {
    if (prefixText.trim()) {
      onBatchPrefix(prefixText.trim());
      setPrefixOpen(false);
      setPrefixText('');
    }
  };

  const handlePositionApply = () => {
    const pos = Number(posValue);
    onBatchPosition(pos, pos === 6 ? posDepth : undefined, pos === 6 ? posRole : undefined);
    setPositionOpen(false);
  };

  const handleStrategyApply = () => {
    onBatchStrategy(strategyValue);
    setStrategyOpen(false);
  };

  const actionButtons = (
    <>
      <Button variant="outline" size="sm" className="h-7 text-xs" disabled={count === 0}
        onClick={() => setPrefixOpen(true)}>
        <TextCursorInput className="w-3.5 h-3.5 mr-1" /> 加前缀
      </Button>
      <Button variant="outline" size="sm" className="h-7 text-xs" disabled={count === 0}
        onClick={() => setPositionOpen(true)}>
        <MapPin className="w-3.5 h-3.5 mr-1" /> 改位置
      </Button>
      <Button variant="outline" size="sm" className="h-7 text-xs" disabled={count === 0}
        onClick={() => setStrategyOpen(true)}>
        <Zap className="w-3.5 h-3.5 mr-1" /> 改策略
      </Button>
      <Button variant="outline" size="sm" className="h-7 text-xs" disabled={count === 0}
        onClick={() => onBatchEnable(true)}>
        <ToggleRight className="w-3.5 h-3.5 mr-1" /> 全部启用
      </Button>
      <Button variant="outline" size="sm" className="h-7 text-xs" disabled={count === 0}
        onClick={() => onBatchEnable(false)}>
        <ToggleLeft className="w-3.5 h-3.5 mr-1" /> 全部停用
      </Button>
      <Button variant="destructive" size="sm" className="h-7 text-xs" disabled={count === 0}
        onClick={() => setDeleteOpen(true)}>
        <Trash2 className="w-3.5 h-3.5 mr-1" /> 删除
      </Button>
    </>
  );

  return (
    <>
      <div className="flex flex-wrap gap-1.5 items-center">
        {/* Left: count + select controls */}
        <span className="text-sm font-medium text-foreground mr-1">
          已选 {count} 项
        </span>
        <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={onSelectAll}>
          <CheckCheck className="w-3.5 h-3.5 mr-1" /> 全选({totalFiltered})
        </Button>
        <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={onDeselectAll} disabled={count === 0}>
          <XCircle className="w-3.5 h-3.5 mr-1" /> 取消全选
        </Button>

        <div className="w-px h-5 bg-border" />

        {/* Actions: desktop inline, mobile dropdown */}
        {isMobile ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-7 text-xs" disabled={count === 0}>
                <MoreHorizontal className="w-3.5 h-3.5 mr-1" /> 操作
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuItem onClick={() => setPrefixOpen(true)}>
                <TextCursorInput className="w-4 h-4 mr-2" /> 批量加前缀
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setPositionOpen(true)}>
                <MapPin className="w-4 h-4 mr-2" /> 批量改位置
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setStrategyOpen(true)}>
                <Zap className="w-4 h-4 mr-2" /> 批量改策略
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onBatchEnable(true)}>
                <ToggleRight className="w-4 h-4 mr-2" /> 全部启用
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onBatchEnable(false)}>
                <ToggleLeft className="w-4 h-4 mr-2" /> 全部停用
              </DropdownMenuItem>
              <DropdownMenuItem className="text-destructive" onClick={() => setDeleteOpen(true)}>
                <Trash2 className="w-4 h-4 mr-2" /> 批量删除
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          actionButtons
        )}

        <div className="flex-1" />
        <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={onExitBatch}>
          <X className="w-3.5 h-3.5 mr-1" /> 退出批量
        </Button>
      </div>

      {/* Prefix dialog */}
      <Dialog open={prefixOpen} onOpenChange={setPrefixOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>批量加前缀</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-sm text-muted-foreground">为 {count} 个条目的标题添加前缀</p>
            <Input
              value={prefixText}
              onChange={(e) => setPrefixText(e.target.value)}
              placeholder="例如：角色--"
              autoFocus
              onKeyDown={(e) => e.key === 'Enter' && handlePrefixApply()}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPrefixOpen(false)}>取消</Button>
            <Button onClick={handlePrefixApply} disabled={!prefixText.trim()}>应用</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确定删除 {count} 个条目？</AlertDialogTitle>
            <AlertDialogDescription>此操作不可撤销，选中的条目将被永久删除。</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={() => { onBatchDelete(); setDeleteOpen(false); }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Position dialog */}
      <Dialog open={positionOpen} onOpenChange={setPositionOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>批量修改位置</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-sm text-muted-foreground">为 {count} 个条目统一设置插入位置</p>
            <Select value={posValue} onValueChange={setPosValue}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(POSITION_LABELS).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {posValue === '6' && (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Label className="w-12 text-sm">深度</Label>
                  <Input type="number" value={posDepth} onChange={(e) => setPosDepth(Number(e.target.value))}
                    className="h-8 w-20" min={0} />
                </div>
                <div>
                  <Label className="text-sm mb-1 block">角色</Label>
                  <Select value={String(posRole)} onValueChange={(v) => setPosRole(Number(v))}>
                    <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(ROLE_LABELS).map(([k, v]) => (
                        <SelectItem key={k} value={k}>{v}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPositionOpen(false)}>取消</Button>
            <Button onClick={handlePositionApply}>应用</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Strategy dialog */}
      <Dialog open={strategyOpen} onOpenChange={setStrategyOpen}>
        <DialogContent className="sm:max-w-xs">
          <DialogHeader>
            <DialogTitle>批量修改策略</DialogTitle>
          </DialogHeader>
          <div className="py-2">
            <p className="text-sm text-muted-foreground mb-3">为 {count} 个条目统一设置触发策略</p>
            <RadioGroup value={strategyValue} onValueChange={(v) => setStrategyValue(v as typeof strategyValue)}>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="keyword" id="s-kw" />
                <Label htmlFor="s-kw">🟢 关键词</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="constant" id="s-ct" />
                <Label htmlFor="s-ct">🔵 常驻</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="vectorized" id="s-vc" />
                <Label htmlFor="s-vc">🔗 向量</Label>
              </div>
            </RadioGroup>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setStrategyOpen(false)}>取消</Button>
            <Button onClick={handleStrategyApply}>应用</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
