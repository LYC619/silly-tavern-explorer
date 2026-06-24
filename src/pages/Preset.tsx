import { useState, useEffect, useCallback, useRef } from 'react';
import { SlidersHorizontal, Upload, Save, History, FileJson } from 'lucide-react';
import { AppLayout } from '@/components/AppLayout';
import { HelpCard } from '@/components/HelpCard';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Card, CardContent } from '@/components/ui/card';
import {
  Popover, PopoverContent, PopoverTrigger,
} from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import type { NormalizedPreset, OrderEntry, PresetItem } from '@/types/preset';
import { DEFAULT_CHARACTER_ID, generatePresetId } from '@/types/preset';
import { parsePreset, getActiveOrder } from '@/lib/preset-parser';
import {
  getAllPresets, getPreset, savePreset, deletePreset, pruneAutoSavedPresets,
} from '@/lib/preset-db';
import { PresetOverview } from '@/components/preset/PresetOverview';
import { PromptEditor } from '@/components/preset/PromptEditor';
import { PresetUtilityFields } from '@/components/preset/PresetUtilityFields';
import { PresetRegexEditor } from '@/components/preset/PresetRegexEditor';
import { PresetExport } from '@/components/preset/PresetExport';
import { GuidedTour } from '@/components/GuidedTour';
import { PRESET_TOUR_STEPS, isTourCompleted, setTourCompleted } from '@/lib/tour-steps';
import type { RegexRule } from '@/types/chat';

const PRESET_SESSION_KEY = 'preset-active-session';
interface PresetSessionPtr { itemId: string | null; }

function loadSessionPtr(): PresetSessionPtr | null {
  try {
    const raw = sessionStorage.getItem(PRESET_SESSION_KEY);
    return raw ? (JSON.parse(raw) as PresetSessionPtr) : null;
  } catch { return null; }
}

export default function Preset() {
  const { toast } = useToast();
  const [preset, setPreset] = useState<NormalizedPreset | null>(null);
  const [originalPreset, setOriginalPreset] = useState<NormalizedPreset | null>(null);
  const [fileName, setFileName] = useState('preset');
  const [activeCharacterId, setActiveCharacterId] = useState(DEFAULT_CHARACTER_ID);
  const [currentItemId, setCurrentItemId] = useState<string | null>(null);
  const [savedItems, setSavedItems] = useState<PresetItem[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [tab, setTab] = useState('overview');
  const [showTour, setShowTour] = useState(false);

  // 撤销/重做历史栈（仅覆盖激活顺序），按 ref 存快照
  const historyRef = useRef<OrderEntry[][]>([]);
  const historyIndexRef = useRef(-1);
  const [, forceUpdate] = useState(0);

  const refreshSaved = useCallback(async () => {
    try { setSavedItems(await getAllPresets()); } catch { /* ignore */ }
  }, []);

  // 首次访问自动引导
  useEffect(() => {
    if (!isTourCompleted('preset')) {
      const t = setTimeout(() => setShowTour(true), 600);
      return () => clearTimeout(t);
    }
  }, []);

  // 跨页恢复：组件挂载时凭 sessionStorage 指针从 IndexedDB 回读
  useEffect(() => {
    refreshSaved();
    const ptr = loadSessionPtr();
    if (ptr?.itemId) {
      getPreset(ptr.itemId).then((item) => {
        if (item) {
          setPreset(item.preset);
          setOriginalPreset(item.preset);
          setFileName(item.title);
          setCurrentItemId(item.id);
          const firstId = item.preset.promptOrder[0]?.character_id ?? DEFAULT_CHARACTER_ID;
          setActiveCharacterId(firstId);
          resetHistory(getActiveOrder(item.preset, firstId));
        }
      }).catch(() => { /* ignore */ });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 跨页指针持久化
  useEffect(() => {
    try {
      if (currentItemId) sessionStorage.setItem(PRESET_SESSION_KEY, JSON.stringify({ itemId: currentItemId }));
      else sessionStorage.removeItem(PRESET_SESSION_KEY);
    } catch { /* ignore */ }
  }, [currentItemId]);

  // ---- 历史栈 ----
  const resetHistory = (order: OrderEntry[]) => {
    historyRef.current = [JSON.parse(JSON.stringify(order))];
    historyIndexRef.current = 0;
  };

  const writeOrder = (np: NormalizedPreset, charId: number, order: OrderEntry[]): NormalizedPreset => ({
    ...np,
    promptOrder: np.promptOrder.map((g) => (g.character_id === charId ? { ...g, order } : g)),
  });

  const handleOrderChange = useCallback((order: OrderEntry[]) => {
    setPreset((prev) => (prev ? writeOrder(prev, activeCharacterId, order) : prev));
    // push 进历史（截断 redo 分支）
    const h = historyRef.current;
    const idx = historyIndexRef.current;
    historyRef.current = [...h.slice(0, idx + 1), JSON.parse(JSON.stringify(order))];
    historyIndexRef.current = historyRef.current.length - 1;
    forceUpdate((n) => n + 1);
  }, [activeCharacterId]);

  const applyHistorySnapshot = (snapshot: OrderEntry[]) => {
    setPreset((prev) => (prev ? writeOrder(prev, activeCharacterId, JSON.parse(JSON.stringify(snapshot))) : prev));
    forceUpdate((n) => n + 1);
  };

  const undo = useCallback(() => {
    if (historyIndexRef.current <= 0) return;
    historyIndexRef.current--;
    applyHistorySnapshot(historyRef.current[historyIndexRef.current]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCharacterId]);

  const redo = useCallback(() => {
    if (historyIndexRef.current >= historyRef.current.length - 1) return;
    historyIndexRef.current++;
    applyHistorySnapshot(historyRef.current[historyIndexRef.current]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCharacterId]);

  const canUndo = historyIndexRef.current > 0;
  const canRedo = historyIndexRef.current < historyRef.current.length - 1;

  // 切角色组：重置历史栈到该组当前 order（修 prompt-studio 切组不重置的 bug）
  const handleCharacterIdChange = useCallback((id: number) => {
    setActiveCharacterId(id);
    if (preset) resetHistory(getActiveOrder(preset, id));
    forceUpdate((n) => n + 1);
  }, [preset]);

  // ---- 内容/字段/正则编辑（不进历史栈） ----
  const handleBlockContentChange = useCallback((identifier: string, content: string) => {
    setPreset((prev) => prev ? {
      ...prev,
      prompts: prev.prompts.map((p) => (p.identifier === identifier ? { ...p, content } : p)),
    } : prev);
  }, []);

  const handleBlockNameChange = useCallback((identifier: string, name: string) => {
    setPreset((prev) => prev ? {
      ...prev,
      prompts: prev.prompts.map((p) => (p.identifier === identifier ? { ...p, name } : p)),
    } : prev);
  }, []);

  const handleBlockRoleChange = useCallback((identifier: string, role: 'system' | 'user' | 'assistant') => {
    setPreset((prev) => prev ? {
      ...prev,
      prompts: prev.prompts.map((p) => (p.identifier === identifier && !p.marker ? { ...p, role } : p)),
    } : prev);
  }, []);

  // 手动新建提示词块：加入 prompts + 当前角色组 order（启用），不进历史栈
  const handleAddBlock = useCallback((name: string) => {
    const identifier = `custom-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setPreset((prev) => {
      if (!prev) return prev;
      const newBlock = { identifier, name: name || '新提示词块', role: 'system' as const, content: '' };
      return {
        ...prev,
        prompts: [...prev.prompts, newBlock],
        promptOrder: prev.promptOrder.map((g) =>
          g.character_id === activeCharacterId
            ? { ...g, order: [...g.order, { identifier, enabled: true }] }
            : g
        ),
      };
    });
    return identifier;
  }, [activeCharacterId]);

  const handleFieldChange = useCallback((key: string, value: string) => {
    setPreset((prev) => prev ? { ...prev, originalData: { ...prev.originalData, [key]: value } } : prev);
  }, []);

  const handleRulesChange = useCallback((rules: RegexRule[]) => {
    setPreset((prev) => prev ? { ...prev, regexRules: rules, hasRegexExtension: true } : prev);
  }, []);

  // ---- 导入 ----
  const loadFile = useCallback(async (file: File) => {
    if (!file.name.toLowerCase().endsWith('.json')) {
      toast({ title: '请选择 .json 预设文件', variant: 'destructive' });
      return;
    }
    try {
      const np = parsePreset(JSON.parse(await file.text()));
      const name = file.name.replace(/\.json$/i, '');
      setPreset(np);
      setOriginalPreset(np);
      setFileName(name);
      const firstId = np.promptOrder[0]?.character_id ?? DEFAULT_CHARACTER_ID;
      setActiveCharacterId(firstId);
      resetHistory(getActiveOrder(np, firstId));
      setTab('overview');
      // 自动留存为导入历史（autoSaved），裁剪到最近 5 份
      (async () => {
        const id = generatePresetId();
        const now = Date.now();
        await savePreset({ id, title: name, preset: np, createdAt: now, updatedAt: now, autoSaved: true });
        setCurrentItemId(id);
        await pruneAutoSavedPresets(5);
        await refreshSaved();
      })().catch(() => { /* 自动历史失败不阻塞导入 */ });
      toast({ title: '预设导入成功', description: `${np.prompts.length} 个提示词块` });
    } catch (e) {
      toast({
        title: '解析失败',
        description: e instanceof Error ? e.message : '文件不是有效的 SillyTavern 预设',
        variant: 'destructive',
      });
    }
  }, [toast, refreshSaved]);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) loadFile(file);
  }, [loadFile]);

  // ---- 保存（永久留存，存入 presets store，在「已存预设」中管理） ----
  const handleSaveLocal = useCallback(async () => {
    if (!preset) return;
    const id = currentItemId || generatePresetId();
    const now = Date.now();
    await savePreset({
      id, title: fileName, preset,
      createdAt: currentItemId ? (savedItems.find((s) => s.id === id)?.createdAt ?? now) : now,
      updatedAt: now,
      autoSaved: false,
    });
    setCurrentItemId(id);
    await refreshSaved();
    toast({ title: '已保存', description: '可在右上角「已存预设」中查看；永久留存、纳入完整备份' });
  }, [preset, fileName, currentItemId, savedItems, refreshSaved, toast]);

  const handleLoadItem = useCallback((item: PresetItem) => {
    setPreset(item.preset);
    setOriginalPreset(item.preset);
    setFileName(item.title);
    setCurrentItemId(item.id);
    const firstId = item.preset.promptOrder[0]?.character_id ?? DEFAULT_CHARACTER_ID;
    setActiveCharacterId(firstId);
    resetHistory(getActiveOrder(item.preset, firstId));
    setTab('overview');
  }, []);

  const handleDeleteItem = useCallback(async (id: string) => {
    await deletePreset(id);
    if (id === currentItemId) setCurrentItemId(null);
    await refreshSaved();
  }, [currentItemId, refreshSaved]);

  const actions = preset && (
    <>
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm">
            <History className="w-4 h-4 mr-1.5" /> 已存预设
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-80" align="end">
          <h4 className="text-sm font-medium mb-2">已存预设（{savedItems.length}）</h4>
          <ScrollArea className="max-h-72">
            <div className="space-y-1">
              {savedItems.map((item) => (
                <div key={item.id} className="flex items-center gap-2 p-2 rounded-md hover:bg-accent/40 text-sm">
                  <FileJson className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                  <button className="flex-1 min-w-0 text-left truncate" onClick={() => handleLoadItem(item)}>
                    {item.title}
                    {item.autoSaved && <span className="text-[10px] text-muted-foreground ml-1">(历史)</span>}
                  </button>
                  <button className="text-muted-foreground hover:text-destructive text-xs shrink-0" onClick={() => handleDeleteItem(item.id)}>删除</button>
                </div>
              ))}
              {savedItems.length === 0 && <p className="text-xs text-muted-foreground text-center py-4">暂无</p>}
            </div>
          </ScrollArea>
        </PopoverContent>
      </Popover>
      <Button variant="outline" size="sm" onClick={handleSaveLocal}>
        <Save className="w-4 h-4 mr-1.5" /> 保存
      </Button>
      <label>
        <Button variant="outline" size="sm" asChild>
          <span><Upload className="w-4 h-4 mr-1.5" /> 导入</span>
        </Button>
        <input type="file" accept=".json,application/json" className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) loadFile(f); e.target.value = ''; }} />
      </label>
    </>
  );

  return (
    <AppLayout actions={actions}>
      <div className="container mx-auto px-4 py-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-lg gold-gradient flex items-center justify-center shadow-card">
            <SlidersHorizontal className="w-5 h-5 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-xl font-display font-semibold flex items-center gap-2">
              预设编辑
              <HelpCard>
                导入 SillyTavern 的 Chat Completion 预设（.json），可视化查看与编辑提示词激活顺序、内容、工具型字段与内嵌正则脚本，并导出回 ST 兼容格式。所有未识别字段在导出时无损保留，可直接导回 SillyTavern。
              </HelpCard>
            </h1>
            <p className="text-sm text-muted-foreground">导入 / 查看 / 编辑 / 导出 SillyTavern 预设</p>
          </div>
        </div>

        {!preset ? (
          <Card className="max-w-2xl mx-auto" data-tour="preset-import">
            <CardContent className="pt-6">
              <label
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={onDrop}
                className={`flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-10 cursor-pointer transition-colors ${
                  dragOver ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50'
                }`}
              >
                <Upload className="w-8 h-8 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">拖入或点击选择预设文件（.json）</span>
                <span className="text-xs text-muted-foreground/70">支持 SillyTavern 导出的 Chat Completion 预设</span>
                <input type="file" accept=".json,application/json" className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) loadFile(f); e.target.value = ''; }} />
              </label>
              {savedItems.length > 0 && (
                <div className="mt-4">
                  <p className="text-xs text-muted-foreground mb-2">或从已存预设打开：</p>
                  <div className="space-y-1">
                    {savedItems.slice(0, 8).map((item) => (
                      <button key={item.id} className="flex items-center gap-2 w-full p-2 rounded-md hover:bg-accent/40 text-sm text-left" onClick={() => handleLoadItem(item)}>
                        <FileJson className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                        <span className="flex-1 min-w-0 truncate">{item.title}</span>
                        {item.autoSaved && <span className="text-[10px] text-muted-foreground">(历史)</span>}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        ) : (
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList data-tour="preset-tabs">
              <TabsTrigger value="overview">概览</TabsTrigger>
              <TabsTrigger value="prompts">提示词</TabsTrigger>
              <TabsTrigger value="utility">工具字段</TabsTrigger>
              <TabsTrigger value="regex">正则{preset.regexRules.length > 0 ? `（${preset.regexRules.length}）` : ''}</TabsTrigger>
              <TabsTrigger value="export" data-tour="preset-export">导出</TabsTrigger>
            </TabsList>
            <TabsContent value="overview" className="mt-4">
              <PresetOverview preset={preset} />
            </TabsContent>
            <TabsContent value="prompts" className="mt-4">
              <PromptEditor
                preset={preset}
                activeCharacterId={activeCharacterId}
                onCharacterIdChange={handleCharacterIdChange}
                onOrderChange={handleOrderChange}
                onBlockContentChange={handleBlockContentChange}
                onBlockNameChange={handleBlockNameChange}
                onAddBlock={handleAddBlock}
                onUndo={undo}
                onRedo={redo}
                canUndo={canUndo}
                canRedo={canRedo}
              />
            </TabsContent>
            <TabsContent value="utility" className="mt-4">
              <PresetUtilityFields preset={preset} onFieldChange={handleFieldChange} />
            </TabsContent>
            <TabsContent value="regex" className="mt-4">
              <PresetRegexEditor rules={preset.regexRules} onRulesChange={handleRulesChange} />
            </TabsContent>
            <TabsContent value="export" className="mt-4">
              <PresetExport preset={preset} originalPreset={originalPreset} activeCharacterId={activeCharacterId} fileName={fileName} />
            </TabsContent>
          </Tabs>
        )}
      </div>
      {showTour && (
        <GuidedTour
          steps={PRESET_TOUR_STEPS}
          module="preset"
          onComplete={() => { setTourCompleted('preset'); setShowTour(false); }}
          onSkip={() => { setTourCompleted('preset'); setShowTour(false); }}
        />
      )}
    </AppLayout>
  );
}
