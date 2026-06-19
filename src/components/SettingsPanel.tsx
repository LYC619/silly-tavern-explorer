import { BookOpen, MessageCircle, Minus, Sparkles, SlidersHorizontal } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import type { ThemeStyle, ExportSettings, PrefixMode } from '@/types/chat';

const FONT_OPTIONS = [
  { value: 'sans-serif', label: '系统默认' },
  { value: '"Noto Serif SC", "Source Han Serif SC", serif', label: '宋体' },
  { value: '"LXGW WenKai", "KaiTi", cursive', label: '楷体' },
  { value: '"Noto Sans SC", "Source Han Sans SC", sans-serif', label: '黑体' },
  { value: '"JetBrains Mono", "Fira Code", monospace', label: '等宽' },
];

interface SettingsPanelProps {
  settings: ExportSettings;
  onSettingsChange: (settings: ExportSettings) => void;
}

const themes: { id: ThemeStyle; name: string; icon: React.ReactNode; desc: string }[] = [
  { id: 'elegant', name: '典雅', icon: <Sparkles className="w-4 h-4" />, desc: '装饰边框，书籍排版' },
  { id: 'novel', name: '小说', icon: <BookOpen className="w-4 h-4" />, desc: '经典小说对话格式' },
  { id: 'social', name: '社交', icon: <MessageCircle className="w-4 h-4" />, desc: '聊天气泡样式' },
  { id: 'minimal', name: '简约', icon: <Minus className="w-4 h-4" />, desc: '简洁左侧边框' },
];

const prefixModes: { id: PrefixMode; name: string; desc: string }[] = [
  { id: 'name', name: '角色名', desc: '使用对话中的角色名称' },
  { id: 'human-assistant', name: 'Human/Assistant', desc: '标准对话格式' },
  { id: 'user-model', name: 'user/model', desc: 'API 风格格式' },
  { id: 'none', name: '无前缀', desc: '仅显示内容' },
];

/**
 * 外观/排版设置：收纳进单个「外观」popover，不再占据主界面一整行，
 * 给阅读区让出空间。包含主题、字号、宽度、时间戳、字体、TXT 导出格式。
 */
export function SettingsPanel({ settings, onSettingsChange }: SettingsPanelProps) {
  const updateSetting = <K extends keyof ExportSettings>(
    key: K,
    value: ExportSettings[K]
  ) => {
    onSettingsChange({ ...settings, [key]: value });
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5">
          <SlidersHorizontal className="w-4 h-4" />
          外观
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 max-h-[70vh] overflow-y-auto" align="end">
        <div className="space-y-5">
          {/* 主题风格 */}
          <div className="space-y-2">
            <Label className="text-sm font-display">主题风格</Label>
            <div className="grid grid-cols-2 gap-2">
              {themes.map((theme) => (
                <button
                  key={theme.id}
                  onClick={() => updateSetting('theme', theme.id)}
                  className={`p-2.5 rounded-lg border text-left transition-all ${
                    settings.theme === theme.id
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:border-primary/50 hover:bg-secondary/50'
                  }`}
                >
                  <div className="flex items-center gap-1.5 mb-0.5">
                    {theme.icon}
                    <span className="text-sm font-medium">{theme.name}</span>
                  </div>
                  <p className="text-xs text-muted-foreground leading-tight">{theme.desc}</p>
                </button>
              ))}
            </div>
          </div>

          {/* 字号 */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-sm">字号</Label>
              <span className="text-xs text-muted-foreground">{settings.fontSize}px</span>
            </div>
            <Slider
              value={[settings.fontSize]}
              onValueChange={([value]) => updateSetting('fontSize', value)}
              min={12}
              max={20}
              step={1}
            />
          </div>

          {/* 宽度 */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-sm">阅读宽度</Label>
              <span className="text-xs text-muted-foreground">{settings.paperWidth}px</span>
            </div>
            <Slider
              value={[settings.paperWidth]}
              onValueChange={([value]) => updateSetting('paperWidth', value)}
              min={400}
              max={1000}
              step={50}
            />
          </div>

          {/* 时间戳 */}
          <div className="flex items-center justify-between">
            <Label className="text-sm">显示时间戳</Label>
            <Switch
              checked={settings.showTimestamp}
              onCheckedChange={(checked) => updateSetting('showTimestamp', checked)}
            />
          </div>

          {/* 预览字体 */}
          <div className="space-y-2">
            <Label className="text-sm">预览字体</Label>
            <Select
              value={settings.fontFamily || 'sans-serif'}
              onValueChange={(value) => updateSetting('fontFamily', value)}
            >
              <SelectTrigger>
                <SelectValue placeholder="选择字体" />
              </SelectTrigger>
              <SelectContent>
                {FONT_OPTIONS.map((f) => (
                  <SelectItem key={f.value} value={f.value}>
                    <span style={{ fontFamily: f.value }}>{f.label}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* TXT 导出格式 */}
          <div className="space-y-2">
            <Label className="text-sm">TXT 导出格式</Label>
            <Select
              value={settings.prefixMode}
              onValueChange={(value: PrefixMode) => updateSetting('prefixMode', value)}
            >
              <SelectTrigger>
                <SelectValue placeholder="选择前缀模式" />
              </SelectTrigger>
              <SelectContent>
                {prefixModes.map((mode) => (
                  <SelectItem key={mode.id} value={mode.id}>
                    <div>
                      <div className="font-medium">{mode.name}</div>
                      <div className="text-xs text-muted-foreground">{mode.desc}</div>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
