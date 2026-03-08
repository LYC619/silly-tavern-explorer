import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Globe, LayoutGrid, List, Library, Moon, Sun, Plus, Trash2, Save } from 'lucide-react';
import { useTheme } from 'next-themes';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { WorldBookImporter } from '@/components/worldbook/WorldBookImporter';
import { WorldBookExporter } from '@/components/worldbook/WorldBookExporter';
import { EntryCard } from '@/components/worldbook/EntryCard';
import { EntryListRow } from '@/components/worldbook/EntryListRow';
import { EntryEditor } from '@/components/worldbook/EntryEditor';
import type { WorldBook, WorldBookEntry } from '@/types/worldbook';
import { DEFAULT_ENTRY, generateWorldBookId } from '@/types/worldbook';
import { saveWorldBook } from '@/lib/worldbook-db';
import type { WorldBookItem } from '@/types/worldbook';
import { useToast } from '@/hooks/use-toast';

export default function WorldBookPage() {
  const navigate = useNavigate();
  const { theme, setTheme } = useTheme();
  const { toast } = useToast();

  const [worldbook, setWorldbook] = useState<WorldBook | null>(null);
  const [filename, setFilename] = useState('worldbook');
  const [selectedUid, setSelectedUid] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'card' | 'list'>('card');

  const entries = worldbook ? Object.entries(worldbook.entries) : [];
  const selectedEntry = selectedUid && worldbook ? worldbook.entries[selectedUid] : null;

  const handleImport = useCallback((wb: WorldBook, name: string) => {
    setWorldbook(wb);
    setFilename(name);
    setSelectedUid(null);
  }, []);

  const updateEntry = useCallback((key: string, updated: WorldBookEntry) => {
    setWorldbook(prev => {
      if (!prev) return prev;
      return { ...prev, entries: { ...prev.entries, [key]: updated } };
    });
  }, []);

  const toggleEnabled = useCallback((key: string, enabled: boolean) => {
    setWorldbook(prev => {
      if (!prev) return prev;
      const entry = prev.entries[key];
      return { ...prev, entries: { ...prev.entries, [key]: { ...entry, enabled } } };
    });
  }, []);

  const addEntry = useCallback(() => {
    if (!worldbook) return;
    const maxUid = Object.values(worldbook.entries).reduce((max, e) => Math.max(max, e.uid), -1);
    const newUid = maxUid + 1;
    const key = String(newUid);
    const newEntry: WorldBookEntry = { ...DEFAULT_ENTRY, uid: newUid, comment: '新条目' } as WorldBookEntry;
    setWorldbook(prev => prev ? { ...prev, entries: { ...prev.entries, [key]: newEntry } } : prev);
    setSelectedUid(key);
  }, [worldbook]);

  const deleteEntry = useCallback((key: string) => {
    setWorldbook(prev => {
      if (!prev) return prev;
      const { [key]: _, ...rest } = prev.entries;
      return { ...prev, entries: rest };
    });
    if (selectedUid === key) setSelectedUid(null);
  }, [selectedUid]);

  const handleSaveLocal = useCallback(async () => {
    if (!worldbook) return;
    const item: WorldBookItem = {
      id: generateWorldBookId(),
      title: filename,
      worldbook,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    await saveWorldBook(item);
    toast({ title: '已保存', description: `世界书「${filename}」已保存到本地` });
  }, [worldbook, filename, toast]);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="border-b bg-card/80 backdrop-blur sticky top-0 z-30">
        <div className="max-w-[1600px] mx-auto px-4 h-14 flex items-center gap-2">
          <Globe className="w-5 h-5 text-primary" />
          <h1 className="font-semibold text-foreground text-lg mr-4">世界书编辑器</h1>

          <Button variant="ghost" size="icon" className="h-8 w-8"
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            title={theme === 'dark' ? '日间模式' : '夜间模式'}>
            {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </Button>

          <Button variant="ghost" size="sm" onClick={() => navigate('/')}>
            <Library className="w-4 h-4 mr-1" /> 编辑器
          </Button>
          <Button variant="ghost" size="sm" onClick={() => navigate('/bookshelf')}>
            <Library className="w-4 h-4 mr-1" /> 书架
          </Button>

          <div className="flex-1" />

          <WorldBookImporter onImport={handleImport} />

          {worldbook && (
            <>
              <Button variant="outline" size="sm" onClick={addEntry}>
                <Plus className="w-4 h-4 mr-1" /> 新增条目
              </Button>
              <Button variant="outline" size="sm" onClick={handleSaveLocal}>
                <Save className="w-4 h-4 mr-1" /> 保存到本地
              </Button>
              <WorldBookExporter worldbook={worldbook} filename={filename} />

              <div className="w-px h-6 bg-border mx-1" />

              <Button variant={viewMode === 'card' ? 'default' : 'ghost'} size="icon" className="h-8 w-8"
                onClick={() => setViewMode('card')}>
                <LayoutGrid className="w-4 h-4" />
              </Button>
              <Button variant={viewMode === 'list' ? 'default' : 'ghost'} size="icon" className="h-8 w-8"
                onClick={() => setViewMode('list')}>
                <List className="w-4 h-4" />
              </Button>
            </>
          )}
        </div>
      </header>

      {/* Body */}
      <div className="flex-1 flex overflow-hidden">
        {!worldbook ? (
          /* Empty state */
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center space-y-4">
              <Globe className="w-16 h-16 mx-auto text-muted-foreground/40" />
              <h2 className="text-xl font-semibold text-foreground">开始使用世界书编辑器</h2>
              <p className="text-muted-foreground max-w-md">
                导入 SillyTavern 的世界书 JSON 文件，可视化浏览和编辑所有条目，然后导出为兼容格式。
              </p>
              <WorldBookImporter onImport={handleImport} />
            </div>
          </div>
        ) : (
          <>
            {/* Left: entries */}
            <div className="flex-1 min-w-0 border-r">
              <ScrollArea className="h-[calc(100vh-3.5rem)]">
                <div className="p-4">
                  <p className="text-sm text-muted-foreground mb-3">
                    共 {entries.length} 个条目 · {filename}
                  </p>

                  {viewMode === 'card' ? (
                    <div className="grid gap-3 grid-cols-1 lg:grid-cols-2">
                      {entries.map(([key, entry]) => (
                        <EntryCard
                          key={key}
                          entry={entry}
                          selected={selectedUid === key}
                          onClick={() => setSelectedUid(key)}
                          onToggleEnabled={(v) => toggleEnabled(key, v)}
                        />
                      ))}
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left">
                        <thead>
                          <tr className="text-xs text-muted-foreground border-b">
                            <th className="px-2 py-1.5">启用</th>
                            <th className="px-2 py-1.5">策略</th>
                            <th className="px-2 py-1.5">标题</th>
                            <th className="px-2 py-1.5">关键词</th>
                            <th className="px-2 py-1.5">位置</th>
                            <th className="px-2 py-1.5 text-right">Order</th>
                          </tr>
                        </thead>
                        <tbody>
                          {entries.map(([key, entry]) => (
                            <EntryListRow
                              key={key}
                              entry={entry}
                              selected={selectedUid === key}
                              onClick={() => setSelectedUid(key)}
                              onToggleEnabled={(v) => toggleEnabled(key, v)}
                            />
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </ScrollArea>
            </div>

            {/* Right: editor */}
            <div className="w-[400px] shrink-0 hidden md:block border-l bg-card/50">
              {selectedEntry && selectedUid ? (
                <ScrollArea className="h-[calc(100vh-3.5rem)]">
                  <EntryEditor
                    entry={selectedEntry}
                    onChange={(updated) => updateEntry(selectedUid, updated)}
                  />
                  <div className="px-4 pb-4">
                    <Button variant="destructive" size="sm" onClick={() => deleteEntry(selectedUid)}>
                      <Trash2 className="w-4 h-4 mr-1" /> 删除此条目
                    </Button>
                  </div>
                </ScrollArea>
              ) : (
                <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
                  点击左侧条目进行编辑
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
