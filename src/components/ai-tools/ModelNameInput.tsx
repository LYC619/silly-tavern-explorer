// 模型名称输入框 + 自动补全下拉 + 「从 API 取模型列表」按钮。
// 下拉的开合是纯视图态，自己管；模型值与列表由父层（表单草稿）持有。
import { useState } from 'react';
import { RefreshCw, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { DEFAULT_MODEL } from './api-profiles';

interface ModelNameInputProps {
  model: string;
  modelList: string[];
  fetching: boolean;
  /** 改动模型名（含手输/选中下拉项）；父层据此置 dirty */
  onModelChange: (value: string) => void;
  /** 点刷新：取模型列表；成功返回 true 时自动展开下拉 */
  onFetch: () => Promise<boolean>;
}

export function ModelNameInput({ model, modelList, fetching, onModelChange, onFetch }: ModelNameInputProps) {
  const [showDropdown, setShowDropdown] = useState(false);
  const filteredModels = modelList.filter((m) => m.toLowerCase().includes(model.toLowerCase()));

  return (
    <div className="space-y-2">
      <Label>模型名称</Label>
      <div className="flex gap-2">
        <div className="flex-1 relative">
          <Input
            value={model}
            onChange={(e) => { onModelChange(e.target.value); setShowDropdown(true); }}
            onFocus={() => { if (modelList.length > 0) setShowDropdown(true); }}
            onBlur={() => setTimeout(() => setShowDropdown(false), 200)}
            placeholder={DEFAULT_MODEL}
          />
          {showDropdown && filteredModels.length > 0 && (
            <div className="absolute z-50 top-full left-0 right-0 mt-1 max-h-48 overflow-auto border rounded-md bg-popover shadow-md">
              {filteredModels.slice(0, 50).map((m) => (
                <button
                  key={m}
                  type="button"
                  className="w-full text-left px-3 py-1.5 text-sm hover:bg-accent cursor-pointer truncate"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => { onModelChange(m); setShowDropdown(false); }}
                >
                  {m}
                </button>
              ))}
              <div className="border-t px-3 py-1.5 text-xs text-muted-foreground">
                共 {modelList.length} 个模型，可直接输入自定义名称
              </div>
            </div>
          )}
        </div>
        <Button
          variant="outline"
          size="icon"
          onClick={async () => { if (await onFetch()) setShowDropdown(true); }}
          disabled={fetching}
          title="从 API 获取模型列表"
        >
          {fetching ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
        </Button>
      </div>
    </div>
  );
}
