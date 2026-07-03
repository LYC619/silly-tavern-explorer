import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';

interface FloorRangePickerProps {
  /** 总楼层数 */
  total: number;
  /** 0-based 闭区间起点 */
  start: number;
  /** 0-based 闭区间终点 */
  end: number;
  onChange: (start: number, end: number) => void;
  /** 「续上一卷」快捷起点提示（分卷用，= 已有卷最大 floorEnd + 1）；不传则不显示 */
  suggestedStart?: number;
}

/**
 * 连续楼层区间选择器（0-based，与聊天页楼层号一致）。
 * 总结场景要的是「从第几楼到第几楼」，用两个数字比 Set 更贴合引擎的 floorStart/floorEnd。
 */
export function FloorRangePicker({ total, start, end, onChange, suggestedStart }: FloorRangePickerProps) {
  const maxIdx = Math.max(0, total - 1);
  const clamp = (n: number) => Math.max(0, Math.min(maxIdx, n));
  const count = total === 0 ? 0 : Math.max(0, Math.min(end, maxIdx) - Math.max(0, start) + 1);

  const setStart = (n: number) => {
    const s = clamp(n);
    onChange(s, Math.max(s, end));
  };
  const setEnd = (n: number) => {
    const e = clamp(n);
    onChange(Math.min(start, e), e);
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">选择楼层范围</CardTitle>
          <span className="text-sm text-muted-foreground">
            共 {count} 楼 · 全书 {total} 楼（第 0 ~ {maxIdx} 楼）
          </span>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-end gap-3 flex-wrap">
          <div className="space-y-1">
            <Label htmlFor="floor-start" className="text-xs text-muted-foreground">起始楼层</Label>
            <Input
              id="floor-start"
              type="number"
              min={0}
              max={maxIdx}
              value={start}
              onChange={(e) => setStart(parseInt(e.target.value) || 0)}
              className="w-24 h-8"
            />
          </div>
          <span className="pb-2 text-muted-foreground">→</span>
          <div className="space-y-1">
            <Label htmlFor="floor-end" className="text-xs text-muted-foreground">结束楼层</Label>
            <Input
              id="floor-end"
              type="number"
              min={0}
              max={maxIdx}
              value={end}
              onChange={(e) => setEnd(parseInt(e.target.value) || 0)}
              className="w-24 h-8"
            />
          </div>
        </div>

        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={() => onChange(0, maxIdx)}>
            全书
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onChange(clamp(total - 20), maxIdx)}
            disabled={total <= 20}
          >
            最近 20 楼
          </Button>
          {suggestedStart != null && suggestedStart <= maxIdx && (
            <Button variant="outline" size="sm" onClick={() => onChange(clamp(suggestedStart), maxIdx)}>
              续上一卷（第 {suggestedStart} 楼起）
            </Button>
          )}
        </div>
        <p className="text-xs text-muted-foreground">楼层号与聊天处理页一致（从 0 开始）。</p>
      </CardContent>
    </Card>
  );
}
