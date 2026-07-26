import { useState } from 'react';
import { Key, Check, AlertCircle, PlugZap, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { DEFAULT_API_URL } from './api-profiles';
import { useApiProfiles } from './useApiProfiles';
import { ProfileToolbar } from './ProfileToolbar';
import { ModelNameInput } from './ModelNameInput';

// 持久化/领域层已拆到 api-profiles.ts；barrel（index.ts）从那里导出 loadAPIConfig 等。

/** 多提供商 API 配置卡：全应用唯一的 AI 配置维护点（其余页面用 ApiStatusLine 状态条）。 */
export function APIConfigCard() {
  const {
    profiles, activeId, savedActive,
    name, setName, apiKey, setApiKey, apiUrl, setApiUrl, model, setModel, modelList,
    dirty, setDirty, fetchingModels, testing, testResult,
    handleSwitch, handleAdd, handleDuplicate, handleDelete,
    handleSave, handleFetchModels, handleTest,
  } = useApiProfiles();

  const [isKeyVisible, setIsKeyVisible] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

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
        <ProfileToolbar
          profiles={profiles}
          activeId={activeId}
          onSwitch={handleSwitch}
          onAdd={handleAdd}
          onDuplicate={handleDuplicate}
          onDeleteClick={() => setDeleteOpen(true)}
        />

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

        <ModelNameInput
          model={model}
          modelList={modelList}
          fetching={fetchingModels}
          onModelChange={(v) => { setModel(v); setDirty(true); }}
          onFetch={handleFetchModels}
        />

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
            <AlertDialogAction onClick={() => { handleDelete(); setDeleteOpen(false); }}>删除</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
