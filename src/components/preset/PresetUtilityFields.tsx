import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { NormalizedPreset } from '@/types/preset';

/** 工具型 / 格式型字段（顶层字符串字段），配置数组驱动，易扩展 */
const UTILITY_FIELDS: { key: string; label: string; desc?: string }[] = [
  { key: 'impersonation_prompt', label: '替身（Impersonation）提示词', desc: 'AI 替用户发言时的指令' },
  { key: 'new_chat_prompt', label: '新对话提示词' },
  { key: 'new_group_chat_prompt', label: '新群聊提示词' },
  { key: 'new_example_chat_prompt', label: '新示例对话提示词' },
  { key: 'continue_nudge_prompt', label: '续写引导提示词' },
  { key: 'group_nudge_prompt', label: '群聊引导提示词' },
  { key: 'wi_format', label: '世界书格式（wi_format）', desc: '世界书条目注入时的包裹格式' },
  { key: 'scenario_format', label: '场景格式（scenario_format）' },
  { key: 'personality_format', label: '性格格式（personality_format）' },
  { key: 'assistant_prefill', label: '助手预填充（assistant_prefill）' },
];

interface PresetUtilityFieldsProps {
  preset: NormalizedPreset;
  onFieldChange: (key: string, value: string) => void;
}

export function PresetUtilityFields({ preset, onFieldChange }: PresetUtilityFieldsProps) {
  const od = preset.originalData;
  // 只展示原预设里存在的字段（避免凭空塞入不属于该预设的字段）
  const present = UTILITY_FIELDS.filter((f) => typeof od[f.key] === 'string');

  if (present.length === 0) {
    return <p className="text-sm text-muted-foreground text-center py-8">该预设没有可编辑的格式 / 杂项字段</p>;
  }

  return (
    <ScrollArea className="h-[640px] pr-3">
      <div className="space-y-4 max-w-3xl">
        <p className="text-xs text-muted-foreground bg-muted/50 rounded-md p-2.5 leading-relaxed">
          这里是预设里的「格式与杂项」字段——控制 SillyTavern 如何包裹/拼接各类内容（如世界书注入格式、场景/性格格式、替身与新对话提示词等）。只显示当前预设里实际存在的字段，按需修改即可。
        </p>
        {present.map((f) => (
          <div key={f.key} className="space-y-1.5">
            <Label className="text-sm">{f.label}</Label>
            {f.desc && <p className="text-xs text-muted-foreground">{f.desc}</p>}
            <Textarea
              value={(od[f.key] as string) ?? ''}
              onChange={(e) => onFieldChange(f.key, e.target.value)}
              className="text-xs min-h-[70px] font-mono"
            />
          </div>
        ))}
      </div>
    </ScrollArea>
  );
}
