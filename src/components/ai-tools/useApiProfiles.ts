// APIConfigCard 的状态与操作逻辑（表单草稿 + 增删改切换 + 取模型 + 测试连通）。
// 拆自原 APIConfigCard.tsx（阶段8.1 codex P2.1）：视图只管渲染，交互全走这个 hook。
import { useState, useEffect, useCallback } from 'react';
import { useToast } from '@/hooks/use-toast';
import { fetchModels, callOpenAIMessages } from './useOpenAI';
import {
  type APIConfig, type ApiProfile, DEFAULT_API_URL, DEFAULT_MODEL,
  generateProfileId, persistProfiles, loadApiProfiles,
} from './api-profiles';

export interface TestResult { ok: boolean; text: string }

export function useApiProfiles() {
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

  const [fetchingModels, setFetchingModels] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<TestResult | null>(null);

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
      return false;
    }
    const rest = ps.filter((p) => p.id !== aid);
    persistProfiles(rest, rest[0].id);
    reload();
    toast({ title: '已删除提供商' });
    return true;
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

  const handleFetchModels = async (): Promise<boolean> => {
    const key = apiKey.trim();
    const url = apiUrl.trim() || DEFAULT_API_URL;
    if (!key) {
      toast({ title: '请先输入 API Key', variant: 'destructive' });
      return false;
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
      return true;
    } catch (e) {
      toast({ title: '获取模型列表失败', description: e instanceof Error ? e.message : '请检查 API 配置', variant: 'destructive' });
      return false;
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

  return {
    // 列表 / 活跃
    profiles, activeId, savedActive,
    // 切换共享/本库作用域后由 ApiScopeToggle 调用：localStorage 已被换成另一套配置
    reload,
    // 表单字段
    name, setName, apiKey, setApiKey, apiUrl, setApiUrl, model, setModel, modelList,
    dirty, setDirty,
    // 异步态
    fetchingModels, testing, testResult,
    // 操作
    handleSwitch, handleAdd, handleDuplicate, handleDelete,
    handleSave, handleFetchModels, handleTest,
  };
}
