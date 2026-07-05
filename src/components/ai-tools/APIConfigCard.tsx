import { useState, useEffect, useCallback } from 'react';
import { Key, Check, AlertCircle, RefreshCw, Loader2, Plus, CopyPlus, Trash2, PlugZap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import { fetchModels, callOpenAIMessages } from './useOpenAI';

// 旧单配置 keys（仅用于一次性迁移到多提供商）
const LEGACY_KEY = 'st-beautifier-openai-key';
const LEGACY_URL = 'st-beautifier-api-url';
const LEGACY_MODEL = 'st-beautifier-api-model';
const LEGACY_MODEL_LIST = 'st-beautifier-model-list';

const PROFILES_KEY = 'st-beautifier-api-profiles';
const ACTIVE_KEY = 'st-beautifier-api-active-profile';

export const DEFAULT_API_URL = 'https://api.openai.com/v1/chat/completions';
export const DEFAULT_MODEL = 'gpt-4o-mini';

export interface APIConfig {
  apiKey: string;
  apiUrl: string;
  model: string;
}

/** 一个 API 提供商配置（OpenAI 兼容）。模型列表属于该提供商的元数据。 */
export interface ApiProfile extends APIConfig {
  id: string;
  name: string;
  modelList?: string[];
}

function generateProfileId(): string {
  return `api_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function persistProfiles(profiles: ApiProfile[], activeId: string): void {
  localStorage.setItem(PROFILES_KEY, JSON.stringify(profiles));
  localStorage.setItem(ACTIVE_KEY, activeId);
}

/** 读取全部提供商；首次调用时把旧的单配置 4 个 key 迁移成「默认」提供商并清掉旧 key。 */
export function loadApiProfiles(): { profiles: ApiProfile[]; activeId: string } {
  try {
    const raw = localStorage.getItem(PROFILES_KEY);
    if (raw) {
      const profiles = JSON.parse(raw) as ApiProfile[];
      if (Array.isArray(profiles) && profiles.length > 0) {
        const stored = localStorage.getItem(ACTIVE_KEY);
        const activeId = profiles.some((p) => p.id === stored) ? (stored as string) : profiles[0].id;
        return { profiles, activeId };
      }
    }
  } catch { /* 坏数据当作未初始化，走迁移 */ }

  let modelList: string[] = [];
  try { modelList = JSON.parse(localStorage.getItem(LEGACY_MODEL_LIST) || '[]'); } catch { /* ignore */ }
  const first: ApiProfile = {
    id: generateProfileId(),
    name: '默认',
    apiKey: localStorage.getItem(LEGACY_KEY) || '',
    apiUrl: localStorage.getItem(LEGACY_URL) || DEFAULT_API_URL,
    model: localStorage.getItem(LEGACY_MODEL) || DEFAULT_MODEL,
    modelList,
  };
  persistProfiles([first], first.id);
  [LEGACY_KEY, LEGACY_URL, LEGACY_MODEL, LEGACY_MODEL_LIST].forEach((k) => localStorage.removeItem(k));
  return { profiles: [first], activeId: first.id };
}

export function getActiveProfile(): ApiProfile {
  const { profiles, activeId } = loadApiProfiles();
  return profiles.find((p) => p.id === activeId) ?? profiles[0];
}

/** 兼容旧签名：返回活跃提供商的调用配置。全部 AI 调用点（总结/故事树/世界书/批量）继续用它。 */
export function loadAPIConfig(): APIConfig {
  const p = getActiveProfile();
  return {
    apiKey: p?.apiKey || '',
    apiUrl: p?.apiUrl || DEFAULT_API_URL,
    model: p?.model || DEFAULT_MODEL,
  };
}

/** 兼容旧签名：写入活跃提供商。 */
export function saveAPIConfig(config: APIConfig): void {
  const { profiles, activeId } = loadApiProfiles();
  const idx = profiles.findIndex((p) => p.id === activeId);
  if (idx < 0) return;
  profiles[idx] = { ...profiles[idx], ...config };
  persistProfiles(profiles, activeId);
}

/** 兼容旧签名：清空活跃提供商的凭据（不删除该提供商）。 */
export function clearAPIConfig(): void {
  const { profiles, activeId } = loadApiProfiles();
  const idx = profiles.findIndex((p) => p.id === activeId);
  if (idx < 0) return;
  profiles[idx] = { ...profiles[idx], apiKey: '', apiUrl: DEFAULT_API_URL, model: DEFAULT_MODEL, modelList: [] };
  persistProfiles(profiles, activeId);
}

/** 多提供商 API 配置卡：全应用唯一的 AI 配置维护点（其余页面用 ApiStatusLine 状态条）。 */
export function APIConfigCard() {
  const { toast } = useToast();
  const [profiles, setProfiles] = useState<ApiProfile[]>([]);
  const [activeId, setActiveId] = useState('');

  // 表单 = 活跃提供商的草稿（点「保存」才写入）
  const [name, setName] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [apiUrl, setApiUrl] = useState(DEFAULT_API_URL);
  const [model, setModel] = useState(DEFAULT_MODEL);
  const [modelList, setModelList] = useState<string[]>([]);
  const [dirty, setDirty] = useState(false);

  const [isKeyVisible, setIsKeyVisible] = useState(false);
  const [fetchingModels, setFetchingModels] = useState(false);
  const [showModelDropdown, setShowModelDropdown] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const loadIntoForm = (p: ApiProfile) => {
    setName(p.name);
    setApiKey(p.apiKey);
    setApiUrl(p.apiUrl || DEFAULT_API_URL);
    setModel(p.model || DEFAULT_MODEL);
    setModelList(p.modelList ?? []);
    setTestResult(null);
    setDirty(false);
  };

  const reload = useCallback(() => {
    const { profiles: ps, activeId: aid } = loadApiProfiles();
    setProfiles(ps);
    setActiveId(aid);
    const active = ps.find((p) => p.id === aid) ?? ps[0];
    if (active) loadIntoForm(active);
  }, []);

  useEffect(() => { reload(); }, [reload]);

  const savedActive = profiles.find((p) => p.id === activeId);

  const handleSwitch = (id: string) => {
    const { profiles: ps } = loadApiProfiles();
    const target = ps.find((p) => p.id === id);
    if (!target) return;
    persistProfiles(ps, id);
    setProfiles(ps);
    setActiveId(id);
    loadIntoForm(target);
  };

  const handleAdd = () => {
    const { profiles: ps } = loadApiProfiles();
    const fresh: ApiProfile = {
      id: generateProfileId(),
      name: `提供商 ${ps.length + 1}`,
      apiKey: '',
      apiUrl: DEFAULT_API_URL,
      model: DEFAULT_MODEL,
      modelList: [],
    };
    persistProfiles([...ps, fresh], fresh.id);
    reload();
    toast({ title: '已新增提供商', description: '填好配置后记得「保存」' });
  };

  const handleDuplicate = () => {
    const { profiles: ps } = loadApiProfiles();
    const copy: ApiProfile = {
      id: generateProfileId(),
      name: `${name || '提供商'} 副本`,
      apiKey: apiKey.trim(),
      apiUrl: apiUrl.trim() || DEFAULT_API_URL,
      model: model.trim() || DEFAULT_MODEL,
      modelList,
    };
    persistProfiles([...ps, copy], copy.id);
    reload();
    toast({ title: '已复制为新提供商', description: copy.name });
  };

  const handleDelete = () => {
    const { profiles: ps, activeId: aid } = loadApiProfiles();
    if (ps.length <= 1) {
      toast({ title: '至少保留一个提供商', variant: 'destructive' });
      setDeleteOpen(false);
      return;
    }
    const rest = ps.filter((p) => p.id !== aid);
    persistProfiles(rest, rest[0].id);
    setDeleteOpen(false);
    reload();
    toast({ title: '已删除提供商' });
  };

  const handleSave = () => {
    if (!apiKey.trim()) {
      toast({ title: '请输入 API Key', variant: 'destructive' });
      return;
    }
    const { profiles: ps, activeId: aid } = loadApiProfiles();
    const idx = ps.findIndex((p) => p.id === aid);
    if (idx < 0) return;
    ps[idx] = {
      ...ps[idx],
      name: name.trim() || ps[idx].name,
      apiKey: apiKey.trim(),
      apiUrl: apiUrl.trim() || DEFAULT_API_URL,
      model: model.trim() || DEFAULT_MODEL,
      modelList,
    };
    persistProfiles(ps, aid);
    setProfiles(ps);
    setDirty(false);
    toast({ title: '配置已保存', description: ps[idx].name });
  };

  const handleFetchModels = async () => {
    const key = apiKey.trim();
    const url = apiUrl.trim() || DEFAULT_API_URL;
    if (!key) {
      toast({ title: '请先输入 API Key', variant: 'destructive' });
      return;
    }
    setFetchingModels(true);
    try {
      const models = await fetchModels(url, key);
      setModelList(models);
      // 模型列表随获取即写入该提供商（属元数据，不必等「保存」）
      const { profiles: ps, activeId: aid } = loadApiProfiles();
      const idx = ps.findIndex((p) => p.id === aid);
      if (idx >= 0) {
        ps[idx] = { ...ps[idx], modelList: models };
        persistProfiles(ps, aid);
        setProfiles(ps);
      }
      toast({ title: `已获取 ${models.length} 个模型` });
      setShowModelDropdown(true);
    } catch (e) {
      toast({ title: '获取模型列表失败', description: e instanceof Error ? e.message : '请检查 API 配置', variant: 'destructive' });
    } finally {
      setFetchingModels(false);
    }
  };

  // 测试连通：用表单当前值发一个 5 token 的小请求，报延迟或错误详情（可在保存前先测）
  const handleTest = async () => {
    const cfg: APIConfig = {
      apiKey: apiKey.trim(),
      apiUrl: apiUrl.trim() || DEFAULT_API_URL,
      model: model.trim() || DEFAULT_MODEL,
    };
    if (!cfg.apiKey) {
      toast({ title: '请先输入 API Key', variant: 'destructive' });
      return;
    }
    setTesting(true);
    setTestResult(null);
    const t0 = performance.now();
    try {
      await callOpenAIMessages(cfg, [{ role: 'user', content: 'Hi' }], { params: { max_tokens: 5 } });
      const ms = Math.round(performance.now() - t0);
      setTestResult({ ok: true, text: `连通正常 · ${ms}ms · ${cfg.model}` });
    } catch (e) {
      setTestResult({ ok: false, text: e instanceof Error ? e.message : '连接失败，请检查地址/密钥/模型' });
    } finally {
      setTesting(false);
    }
  };

  const filteredModels = modelList.filter((m) => m.toLowerCase().includes(model.toLowerCase()));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Key className="w-5 h-5" />
          API 提供商
        </CardTitle>
        <CardDescription>
          可保存多个提供商配置（OpenAI 兼容格式），随时切换；全应用的 AI 功能都使用当前选中的提供商。密钥仅保存在本地浏览器。
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* 提供商切换/管理行 */}
        <div className="flex items-center gap-2 flex-wrap">
          <Select value={activeId} onValueChange={handleSwitch}>
            <SelectTrigger className="h-9 w-56">
              <SelectValue placeholder="选择提供商" />
            </SelectTrigger>
            <SelectContent>
              {profiles.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}{p.apiKey ? '' : '（未配置）'}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" className="h-9 gap-1" onClick={handleAdd}>
            <Plus className="w-4 h-4" />新增
          </Button>
          <Button variant="ghost" size="sm" className="h-9 gap-1" onClick={handleDuplicate}>
            <CopyPlus className="w-4 h-4" />复制
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-9 gap-1 text-destructive"
            onClick={() => setDeleteOpen(true)}
            disabled={profiles.length <= 1}
          >
            <Trash2 className="w-4 h-4" />删除
          </Button>
        </div>

        <div className="space-y-2">
          <Label>提供商名称</Label>
          <Input
            value={name}
            onChange={(e) => { setName(e.target.value); setDirty(true); }}
            placeholder="例如：OpenAI / 中转站 A / 本地 Ollama"
          />
        </div>

        <div className="space-y-2">
          <Label>API Key</Label>
          <div className="flex gap-2">
            <div className="flex-1 relative">
              <Input
                type={isKeyVisible ? 'text' : 'password'}
                value={apiKey}
                onChange={(e) => { setApiKey(e.target.value); setDirty(true); }}
                placeholder="sk-..."
              />
            </div>
            <Button variant="outline" onClick={() => setIsKeyVisible(!isKeyVisible)}>
              {isKeyVisible ? '隐藏' : '显示'}
            </Button>
          </div>
        </div>

        <div className="space-y-2">
          <Label>API 接口地址</Label>
          <Input
            value={apiUrl}
            onChange={(e) => { setApiUrl(e.target.value); setDirty(true); }}
            placeholder={DEFAULT_API_URL}
          />
          <p className="text-xs text-muted-foreground">
            支持 OpenAI 兼容格式的接口，如官方、各类中转站、本地部署的模型等
          </p>
        </div>

        <div className="space-y-2">
          <Label>模型名称</Label>
          <div className="flex gap-2">
            <div className="flex-1 relative">
              <Input
                value={model}
                onChange={(e) => { setModel(e.target.value); setDirty(true); setShowModelDropdown(true); }}
                onFocus={() => { if (modelList.length > 0) setShowModelDropdown(true); }}
                onBlur={() => setTimeout(() => setShowModelDropdown(false), 200)}
                placeholder={DEFAULT_MODEL}
              />
              {showModelDropdown && filteredModels.length > 0 && (
                <div className="absolute z-50 top-full left-0 right-0 mt-1 max-h-48 overflow-auto border rounded-md bg-popover shadow-md">
                  {filteredModels.slice(0, 50).map((m) => (
                    <button
                      key={m}
                      type="button"
                      className="w-full text-left px-3 py-1.5 text-sm hover:bg-accent cursor-pointer truncate"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => { setModel(m); setDirty(true); setShowModelDropdown(false); }}
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
              onClick={handleFetchModels}
              disabled={fetchingModels}
              title="从 API 获取模型列表"
            >
              {fetchingModels ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            </Button>
          </div>
        </div>

        <div className="flex gap-2 pt-2 flex-wrap items-center">
          <Button onClick={handleSave}>保存配置</Button>
          <Button variant="outline" className="gap-1" onClick={handleTest} disabled={testing}>
            {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : <PlugZap className="w-4 h-4" />}
            测试连通
          </Button>
          {dirty && <span className="text-xs text-muted-foreground">有未保存的修改</span>}
        </div>

        {testResult && (
          <div className={`flex items-center gap-2 text-sm rounded-md border px-3 py-2 ${
            testResult.ok
              ? 'border-primary/30 bg-primary/5 text-foreground'
              : 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400'
          }`}>
            {testResult.ok ? <Check className="w-4 h-4 text-primary shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
            <span className="break-all">{testResult.text}</span>
          </div>
        )}

        {savedActive?.apiKey ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Check className="w-4 h-4 text-primary" />
            使用中：{savedActive.name} · {savedActive.model}
            {savedActive.apiUrl !== DEFAULT_API_URL && <span className="text-xs">· 自定义接口</span>}
          </div>
        ) : (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <AlertCircle className="w-4 h-4 text-destructive" />
            当前提供商尚未配置 API Key
          </div>
        )}
      </CardContent>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除提供商「{savedActive?.name}」？</AlertDialogTitle>
            <AlertDialogDescription>该提供商的密钥与配置将被移除，此操作不可撤销。</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>删除</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
