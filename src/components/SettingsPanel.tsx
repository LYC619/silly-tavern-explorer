import { useState } from 'react';
import { BookOpen, MessageCircle, Minus, Sparkles, ChevronDown, ChevronUp } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Button } from '@/components/ui/button';
import type { ThemeStyle, ExportSettings, PrefixMode } from '@/types/chat';

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

export function SettingsPanel({ settings, onSettingsChange }: SettingsPanelProps) {
  const [isOpen, setIsOpen] = useState(false);

  const updateSetting = <K extends keyof ExportSettings>(
    key: K,
    value: ExportSettings[K]
  ) => {
    onSettingsChange({ ...settings, [key]: value });
  };

  const currentTheme = themes.find(t => t.id === settings.theme);

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <Card className="p-4">
        {/* Collapsed view - horizontal summary */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-6 flex-1 min-w-0">
            {/* Theme quick selector */}
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">主题:</span>
              <div className="flex gap-1">
                {themes.map((theme) => (
                  <button
                    key={theme.id}
                    onClick={() => updateSetting('theme', theme.id)}
                    className={`p-2 rounded-md transition-all ${
                      settings.theme === theme.id
                        ? 'bg-primary text-primary-foreground'
                        : 'hover:bg-secondary text-muted-foreground hover:text-foreground'
                    }`}
                    title={theme.desc}
                  >
                    {theme.icon}
                  </button>
                ))}
              </div>
            </div>

            {/* Font size quick control */}
            <div className="flex items-center gap-2 min-w-[140px]">
              <span className="text-sm text-muted-foreground whitespace-nowrap">字号:</span>
              <Slider
                value={[settings.fontSize]}
                onValueChange={([value]) => updateSetting('fontSize', value)}
                min={12}
                max={20}
                step={1}
                className="w-20"
              />
              <span className="text-xs text-muted-foreground w-8">{settings.fontSize}px</span>
            </div>

            {/* Width quick control */}
            <div className="flex items-center gap-2 min-w-[160px]">
              <span className="text-sm text-muted-foreground whitespace-nowrap">宽度:</span>
              <Slider
                value={[settings.paperWidth]}
                onValueChange={([value]) => updateSetting('paperWidth', value)}
                min={400}
                max={800}
                step={50}
                className="w-24"
              />
              <span className="text-xs text-muted-foreground w-10">{settings.paperWidth}px</span>
            </div>

            {/* Timestamp toggle */}
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">时间戳:</span>
              <Switch
                checked={settings.showTimestamp}
                onCheckedChange={(checked) => updateSetting('showTimestamp', checked)}
              />
            </div>
          </div>

          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="sm" className="flex-shrink-0">
              {isOpen ? (
                <>
                  收起 <ChevronUp className="w-4 h-4 ml-1" />
                </>
              ) : (
                <>
                  更多设置 <ChevronDown className="w-4 h-4 ml-1" />
                </>
              )}
            </Button>
          </CollapsibleTrigger>
        </div>

        {/* Expanded view - detailed settings */}
        <CollapsibleContent className="mt-4 pt-4 border-t border-border space-y-6">
          {/* Theme Selection (detailed) */}
          <div className="space-y-3">
            <Label className="text-base font-display">主题风格</Label>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {themes.map((theme) => (
                <button
                  key={theme.id}
                  onClick={() => updateSetting('theme', theme.id)}
                  className={`p-3 rounded-lg border-2 text-left transition-all ${
                    settings.theme === theme.id
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:border-primary/50 hover:bg-secondary/50'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    {theme.icon}
                    <span className="font-medium">{theme.name}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">{theme.desc}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Prefix Mode for TXT Export */}
          <div className="space-y-2">
            <Label htmlFor="prefix-mode" className="text-base font-display">TXT 导出格式</Label>
            <Select
              value={settings.prefixMode}
              onValueChange={(value: PrefixMode) => updateSetting('prefixMode', value)}
            >
              <SelectTrigger id="prefix-mode" className="w-64">
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
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}
