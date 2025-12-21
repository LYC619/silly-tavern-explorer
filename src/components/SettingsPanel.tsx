import { BookOpen, MessageCircle, Minus, Sparkles } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import type { ThemeStyle, ExportSettings } from '@/types/chat';

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

export function SettingsPanel({ settings, onSettingsChange }: SettingsPanelProps) {
  const updateSetting = <K extends keyof ExportSettings>(
    key: K,
    value: ExportSettings[K]
  ) => {
    onSettingsChange({ ...settings, [key]: value });
  };

  return (
    <div className="space-y-6">
      {/* Theme Selection */}
      <div className="space-y-3">
        <Label className="text-base font-display">主题风格</Label>
        <div className="grid grid-cols-2 gap-2">
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

      {/* Display Options */}
      <Card className="p-4 space-y-4">
        <h3 className="font-display text-sm font-medium text-muted-foreground uppercase tracking-wider">
          显示选项
        </h3>
        
        <div className="flex items-center justify-between">
          <Label htmlFor="show-timestamp">显示时间戳</Label>
          <Switch
            id="show-timestamp"
            checked={settings.showTimestamp}
            onCheckedChange={(checked) => updateSetting('showTimestamp', checked)}
          />
        </div>

        <div className="flex items-center justify-between">
          <Label htmlFor="show-avatar">显示头像</Label>
          <Switch
            id="show-avatar"
            checked={settings.showAvatar}
            onCheckedChange={(checked) => updateSetting('showAvatar', checked)}
          />
        </div>
      </Card>

      {/* Size Options */}
      <Card className="p-4 space-y-4">
        <h3 className="font-display text-sm font-medium text-muted-foreground uppercase tracking-wider">
          尺寸设置
        </h3>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label>字体大小</Label>
            <span className="text-sm text-muted-foreground">{settings.fontSize}px</span>
          </div>
          <Slider
            value={[settings.fontSize]}
            onValueChange={([value]) => updateSetting('fontSize', value)}
            min={12}
            max={20}
            step={1}
            className="w-full"
          />
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label>内容宽度</Label>
            <span className="text-sm text-muted-foreground">{settings.paperWidth}px</span>
          </div>
          <Slider
            value={[settings.paperWidth]}
            onValueChange={([value]) => updateSetting('paperWidth', value)}
            min={400}
            max={800}
            step={50}
            className="w-full"
          />
        </div>
      </Card>
    </div>
  );
}
