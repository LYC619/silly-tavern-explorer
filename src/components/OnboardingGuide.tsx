import { useState, useEffect } from 'react';
import { X, Upload, Wand2, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';

const STORAGE_KEY = 'st-explorer-onboarding-dismissed';

export function useOnboardingVisible() {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    setVisible(!localStorage.getItem(STORAGE_KEY));
  }, []);
  const dismiss = (permanent: boolean) => {
    if (permanent) localStorage.setItem(STORAGE_KEY, '1');
    setVisible(false);
  };
  const reset = () => {
    localStorage.removeItem(STORAGE_KEY);
    setVisible(true);
  };
  return { visible, dismiss, reset };
}

interface OnboardingGuideProps {
  onDismiss: (permanent: boolean) => void;
}

export function OnboardingGuide({ onDismiss }: OnboardingGuideProps) {
  const [dontShow, setDontShow] = useState(false);

  const steps = [
    {
      icon: <Upload className="w-5 h-5 text-primary" />,
      title: '导入',
      desc: '点击「导入聊天记录」，支持 SillyTavern 导出的 JSON 或 JSONL 文件',
    },
    {
      icon: <Wand2 className="w-5 h-5 text-primary" />,
      title: '处理',
      desc: '使用正则清理去除思维链等杂项，编辑消息内容，添加章节标记',
    },
    {
      icon: <Download className="w-5 h-5 text-primary" />,
      title: '导出或保存',
      desc: '导出为 JSONL（导回酒馆继续用）或 TXT（阅读用），也可保存到书架随时阅读',
    },
  ];

  return (
    <div className="mb-6 p-4 rounded-lg border border-primary/20 bg-primary/5 relative animate-fade-in">
      <Button
        variant="ghost"
        size="icon"
        className="absolute top-2 right-2 h-6 w-6"
        onClick={() => onDismiss(dontShow)}
      >
        <X className="w-4 h-4" />
      </Button>

      <h3 className="font-display font-medium mb-3">快速上手</h3>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {steps.map((step, i) => (
          <div key={i} className="flex items-start gap-3 p-3 rounded-md bg-card border border-border">
            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
              {step.icon}
            </div>
            <div>
              <div className="text-sm font-medium">
                <span className="text-primary mr-1">#{i + 1}</span>
                {step.title}
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">{step.desc}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-3 flex items-center gap-2">
        <Checkbox
          id="dont-show"
          checked={dontShow}
          onCheckedChange={(checked) => setDontShow(!!checked)}
        />
        <label htmlFor="dont-show" className="text-xs text-muted-foreground cursor-pointer">
          不再显示
        </label>
      </div>
    </div>
  );
}
