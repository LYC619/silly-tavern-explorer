import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle2, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getActiveProfile } from './api-profiles';

/**
 * 轻量 API 配置状态条：只展示状态，不承载配置表单。
 * API 配置统一在「AI 配置」页维护（多提供商），其余页面用此状态条替代内嵌配置卡。
 */
export function ApiStatusLine() {
  const navigate = useNavigate();
  const [hasKey, setHasKey] = useState(true);
  const [label, setLabel] = useState('');

  useEffect(() => {
    const p = getActiveProfile();
    setHasKey(!!p?.apiKey);
    setLabel(p ? `${p.name} · ${p.model}` : '');
  }, []);

  if (hasKey) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <CheckCircle2 className="w-3.5 h-3.5 text-primary/70 shrink-0" />
        <span>API 已配置{label ? ` · ${label}` : ''}</span>
        <button
          className="underline-offset-2 hover:underline hover:text-foreground"
          onClick={() => navigate('/settings')}
        >
          修改
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 flex-wrap rounded-md border border-[color:var(--status-warn)]/40 bg-[var(--status-warn-bg)] px-3 py-2 text-sm">
      <AlertCircle className="w-4 h-4 text-[color:var(--status-warn)] shrink-0" />
      <span>尚未配置 API Key，生成功能不可用。</span>
      <Button variant="outline" size="sm" className="h-7 ml-auto" onClick={() => navigate('/settings')}>
        去「AI 配置」页配置
      </Button>
    </div>
  );
}
