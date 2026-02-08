import { useState } from 'react';
import { Key, Check, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';

const API_KEY_STORAGE_KEY = 'st-beautifier-openai-key';
const API_URL_STORAGE_KEY = 'st-beautifier-api-url';
const API_MODEL_STORAGE_KEY = 'st-beautifier-api-model';

export const DEFAULT_API_URL = 'https://api.openai.com/v1/chat/completions';
export const DEFAULT_MODEL = 'gpt-4o-mini';

export interface APIConfig {
  apiKey: string;
  apiUrl: string;
  model: string;
}

export function loadAPIConfig(): APIConfig {
  return {
    apiKey: localStorage.getItem(API_KEY_STORAGE_KEY) || '',
    apiUrl: localStorage.getItem(API_URL_STORAGE_KEY) || DEFAULT_API_URL,
    model: localStorage.getItem(API_MODEL_STORAGE_KEY) || DEFAULT_MODEL,
  };
}

export function saveAPIConfig(config: APIConfig): void {
  localStorage.setItem(API_KEY_STORAGE_KEY, config.apiKey);
  localStorage.setItem(API_URL_STORAGE_KEY, config.apiUrl);
  localStorage.setItem(API_MODEL_STORAGE_KEY, config.model);
}

export function clearAPIConfig(): void {
  localStorage.removeItem(API_KEY_STORAGE_KEY);
  localStorage.removeItem(API_URL_STORAGE_KEY);
  localStorage.removeItem(API_MODEL_STORAGE_KEY);
}

interface APIConfigCardProps {
  savedConfig: APIConfig;
  onConfigSave: (config: APIConfig) => void;
  onConfigClear: () => void;
}

export function APIConfigCard({ savedConfig, onConfigSave, onConfigClear }: APIConfigCardProps) {
  const { toast } = useToast();
  const [apiKey, setApiKey] = useState(savedConfig.apiKey);
  const [apiUrl, setApiUrl] = useState(savedConfig.apiUrl);
  const [model, setModel] = useState(savedConfig.model);
  const [isKeyVisible, setIsKeyVisible] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const handleSave = () => {
    if (!apiKey.trim()) {
      toast({ title: '请输入 API Key', variant: 'destructive' });
      return;
    }
    const config: APIConfig = {
      apiKey: apiKey.trim(),
      apiUrl: apiUrl.trim() || DEFAULT_API_URL,
      model: model.trim() || DEFAULT_MODEL,
    };
    saveAPIConfig(config);
    onConfigSave(config);
    toast({ title: '配置已保存' });
  };

  const handleClear = () => {
    clearAPIConfig();
    setApiKey('');
    setApiUrl(DEFAULT_API_URL);
    setModel(DEFAULT_MODEL);
    onConfigClear();
    toast({ title: '配置已清除' });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Key className="w-5 h-5" />
          API 配置
        </CardTitle>
        <CardDescription>
          配置 AI 服务接口（支持 OpenAI 兼容格式，密钥仅保存在本地浏览器）
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label>API Key</Label>
          <div className="flex gap-2">
            <div className="flex-1 relative">
              <Input
                type={isKeyVisible ? 'text' : 'password'}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="sk-..."
              />
            </div>
            <Button
              variant="outline"
              onClick={() => setIsKeyVisible(!isKeyVisible)}
            >
              {isKeyVisible ? '隐藏' : '显示'}
            </Button>
          </div>
        </div>

        <Button
          variant="ghost"
          size="sm"
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="text-muted-foreground"
        >
          {showAdvanced ? '▼ 收起高级设置' : '▶ 展开高级设置（自定义接口地址/模型）'}
        </Button>

        {showAdvanced && (
          <div className="space-y-4 pl-4 border-l-2 border-border">
            <div className="space-y-2">
              <Label>API 接口地址</Label>
              <Input
                value={apiUrl}
                onChange={(e) => setApiUrl(e.target.value)}
                placeholder={DEFAULT_API_URL}
              />
              <p className="text-xs text-muted-foreground">
                支持 OpenAI 兼容格式的接口，如中转站、本地部署的模型等
              </p>
            </div>
            <div className="space-y-2">
              <Label>模型名称</Label>
              <Input
                value={model}
                onChange={(e) => setModel(e.target.value)}
                placeholder={DEFAULT_MODEL}
              />
              <p className="text-xs text-muted-foreground">
                例如：gpt-4o-mini, gpt-4o, claude-3-haiku, deepseek-chat 等
              </p>
            </div>
          </div>
        )}

        <div className="flex gap-2 pt-2">
          <Button onClick={handleSave}>保存配置</Button>
          {savedConfig.apiKey && (
            <Button variant="ghost" onClick={handleClear}>
              清除配置
            </Button>
          )}
        </div>

        {savedConfig.apiKey ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Check className="w-4 h-4 text-primary" />
            已配置 · 模型: {savedConfig.model}
            {savedConfig.apiUrl !== DEFAULT_API_URL && (
              <span className="text-xs">· 自定义接口</span>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <AlertCircle className="w-4 h-4 text-destructive" />
            尚未配置 API Key
          </div>
        )}
      </CardContent>
    </Card>
  );
}
