import { useEffect, useState } from 'react';
import { Bookmark } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

/** 书签锚点：聊天页的章节标记 / 收藏楼层，供快速填入起止 */
export interface FloorAnchor {
  floor: number;
  label: string;
}

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
  /** 章节标记/收藏楼层锚点；非空时显示「书签楼层」快捷选择 */
  anchors?: FloorAnchor[];
}

/**
 * 连续楼层区间选择器（0-based，与聊天页楼层号一致）。
 * 总结场景要的是「从第几楼到第几楼」，用两个数字比 Set 更贴合引擎的 floorStart/floorEnd。
 *
 * 历史 bug：早期 onChange 里做「反向夹取」(setEnd 时 Math.min(start,e))，加上输入框把空串/半成品
 * parseInt 成 0——用户清空结束楼层想重填时，end 瞬间变 0，Math.min(start,0) 把起始楼层也拽到 0。
 * 现改为：两个输入用本地字符串态，允许中途为空，编辑时**只动自己那一端、绝不反向改另一端**；
 * 失焦时再规范化（空串回填原值、起>止则对调），避免打字过程中另一端数字乱跳。
 */
export function FloorRangePicker({ total, start, end, onChange, suggestedStart, anchors }: FloorRangePickerProps) {
  const maxIdx = Math.max(0, total - 1);
  const clamp = (n: number) => Math.max(0, Math.min(maxIdx, n));
  // count 用对称 min/max，与引擎 buildFloorMessages 一致——即便中途 start>end 也显示真实楼层数
  const lo = Math.max(0, Math.min(start, end));
  const hi = Math.min(maxIdx, Math.max(start, end));
  const count = total === 0 ? 0 : Math.max(0, hi - lo + 1);

  // 本地输入字符串：外部（续上一卷/全书/载入已存条目）改动时同步显示
  const [startStr, setStartStr] = useState(String(start));
  const [endStr, setEndStr] = useState(String(end));
  useEffect(() => { setStartStr(String(start)); }, [start]);
  useEffect(() => { setEndStr(String(end)); }, [end]);

  // 编辑时只提交自己那一端（clamp 到 [0,maxIdx]），不反向夹另一端；空/非法串暂不提交，保留上次有效值
  const editStart = (raw: string) => {
    setStartStr(raw);
    if (raw.trim() === '') return;
    const n = parseInt(raw, 10);
    if (Number.isNaN(n)) return;
    onChange(clamp(n), end);
  };
  const editEnd = (raw: string) => {
    setEndStr(raw);
    if (raw.trim() === '') return;
    const n = parseInt(raw, 10);
    if (Number.isNaN(n)) return;
    onChange(start, clamp(n));
  };
  // 失焦规范化：空串回填当前值；若 start>end 则对调，保证下游区间恒有序
  const normalize = () => {
    if (startStr.trim() === '') setStartStr(String(start));
    if (endStr.trim() === '') setEndStr(String(end));
    if (start > end) onChange(end, start);
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
              value={startStr}
              onChange={(e) => editStart(e.target.value)}
              onBlur={normalize}
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
              value={endStr}
              onChange={(e) => editEnd(e.target.value)}
              onBlur={normalize}
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
          {anchors && anchors.length > 0 && (
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="gap-1">
                  <Bookmark className="w-3.5 h-3.5" />书签楼层
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-80 p-2" align="start">
                <p className="text-xs text-muted-foreground mb-1.5 px-1">
                  聊天页的章节标记与收藏楼层，点「起 / 止」填入对应端
                </p>
                <div className="max-h-56 overflow-y-auto space-y-0.5">
                  {anchors.map((a, i) => (
                    <div key={`${a.floor}-${i}`} className="flex items-center gap-1.5 rounded px-1 py-0.5 text-xs hover:bg-accent">
                      <span className="font-mono text-primary shrink-0 w-8 text-right">#{a.floor}</span>
                      <span className="truncate flex-1" title={a.label}>{a.label}</span>
                      <Button
                        variant="ghost" size="sm" className="h-5 px-1.5 text-xs shrink-0"
                        onClick={() => onChange(clamp(a.floor), Math.max(clamp(a.floor), end))}
                      >
                        起
                      </Button>
                      <Button
                        variant="ghost" size="sm" className="h-5 px-1.5 text-xs shrink-0"
                        onClick={() => onChange(Math.min(start, clamp(a.floor)), clamp(a.floor))}
                      >
                        止
                      </Button>
                    </div>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
          )}
        </div>
        <p className="text-xs text-muted-foreground">楼层号与聊天处理页一致（从 0 开始）。</p>
      </CardContent>
    </Card>
  );
}
