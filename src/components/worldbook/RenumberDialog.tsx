import { useState } from 'react';
import { Hash } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';

interface Props {
  sortLabel: string;
  onRenumber: (start: number, step: number) => void;
}

export function RenumberButton({ sortLabel, onRenumber }: Props) {
  const [open, setOpen] = useState(false);
  const [start, setStart] = useState(100);
  const [step, setStep] = useState(10);

  const handleConfirm = () => {
    onRenumber(start, step);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="hidden sm:inline-flex">
          <Hash className="w-4 h-4 mr-1" /> 重新编号
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 space-y-3" align="end">
        <h4 className="text-sm font-medium">批量重新编号 Order</h4>
        <p className="text-xs text-muted-foreground">
          按当前排序（{sortLabel}）重新赋值所有条目的 Order
        </p>
        <div className="space-y-2">
          <div className="space-y-1">
            <Label className="text-xs">起始值</Label>
            <Input type="number" value={start} onChange={(e) => setStart(Number(e.target.value))} className="h-8" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">步长</Label>
            <Input type="number" value={step} onChange={(e) => setStep(Number(e.target.value))} className="h-8" />
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>取消</Button>
          <Button size="sm" onClick={handleConfirm}>确认</Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
