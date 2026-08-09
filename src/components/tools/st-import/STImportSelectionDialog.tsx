import { useEffect, useMemo, useState } from 'react';
import {
  Archive,
  BookOpen,
  Braces,
  Download,
  FileText,
  Link2,
  Loader2,
  MessageSquareText,
  SlidersHorizontal,
  Users,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { formatBytes } from '@/lib/storage-utils';
import {
  countImportPicks,
  createAllImportPicks,
  createEmptyImportPicks,
  IMPORT_POLICY_SUMMARY,
  toggleImportPick,
  type STImportPicks,
} from '@/lib/vault/st-import-presentation';
import type { STScanResult } from '@/lib/vault/st-import';

interface STImportSelectionDialogProps {
  root: string;
  scan: STScanResult;
  picks: STImportPicks;
  importing: boolean;
  onPicksChange: (picks: STImportPicks) => void;
  onCancel: () => void;
  onImport: () => void;
}

type SectionId = 'characters' | 'chats' | 'worldbooks' | 'presets' | 'archives' | 'regex' | 'relationships';

interface SectionDefinition {
  id: SectionId;
  label: string;
  found: number;
  selected: number;
  icon: typeof Users;
}

interface PickRowProps {
  checked: boolean;
  title: string;
  description: string;
  onCheckedChange: (checked: boolean) => void;
  icon?: typeof Archive;
}

function PickRow({ checked, title, description, onCheckedChange, icon: Icon }: PickRowProps) {
  return (
    <Label className="flex min-h-14 cursor-pointer items-start gap-3 border-b border-border px-1 py-3 font-normal last:border-b-0 hover:bg-accent/30">
      <Checkbox checked={checked} onCheckedChange={(value) => onCheckedChange(value === true)} className="mt-0.5" />
      {Icon && <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-foreground">{title}</span>
        <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">{description}</span>
      </span>
    </Label>
  );
}

export function STImportSelectionDialog({
  root,
  scan,
  picks,
  importing,
  onPicksChange,
  onCancel,
  onImport,
}: STImportSelectionDialogProps) {
  const sections = useMemo<SectionDefinition[]>(() => {
    const rows: Array<SectionDefinition | false> = [
      scan.characters.length > 0 && {
        id: 'characters', label: '角色', found: scan.characters.length, selected: picks.chars.size, icon: Users,
      },
      scan.strayChats.length > 0 && {
        id: 'chats', label: '散聊天', found: scan.strayChats.length, selected: picks.strays.size, icon: MessageSquareText,
      },
      scan.worldbooks.length > 0 && {
        id: 'worldbooks', label: '世界书', found: scan.worldbooks.length, selected: picks.wbs.size, icon: BookOpen,
      },
      scan.presets.length > 0 && {
        id: 'presets', label: '预设', found: scan.presets.length, selected: picks.presets.size, icon: SlidersHorizontal,
      },
      scan.archives.length > 0 && {
        id: 'archives', label: '扩展与媒体', found: scan.archives.length, selected: picks.archives.size, icon: Archive,
      },
      scan.regex !== null && {
        id: 'regex', label: '正则', found: 1, selected: picks.regex ? 1 : 0, icon: Braces,
      },
      scan.relationships.status !== 'missing' && {
        id: 'relationships',
        label: '关联',
        found: scan.relationships.status === 'parsed' ? 1 : 0,
        selected: picks.settingsRelations ? 1 : 0,
        icon: Link2,
      },
    ];
    return rows.filter((row): row is SectionDefinition => row !== false);
  }, [picks, scan]);
  const [activeSection, setActiveSection] = useState<SectionId>(sections[0]?.id ?? 'characters');
  useEffect(() => {
    if (!sections.some((section) => section.id === activeSection)) {
      setActiveSection(sections[0]?.id ?? 'characters');
    }
  }, [activeSection, sections]);
  const pickedCount = countImportPicks(picks);
  const availableCount = countImportPicks(createAllImportPicks(scan));
  const characterChatCount = scan.characters.reduce((sum, character) => sum + character.chats.length, 0);
  const foundSummary = [
    `${scan.characters.length} 个角色`,
    `${characterChatCount + scan.strayChats.length} 场聊天`,
    `${scan.worldbooks.length} 本世界书`,
    `${scan.presets.length} 个预设`,
  ].join(' · ');

  return (
    <Dialog open onOpenChange={(open) => { if (!open && !importing) onCancel(); }}>
      <DialogContent className="grid max-h-[calc(100vh-2rem)] max-w-3xl grid-rows-[auto_minmax(0,1fr)_auto] gap-0 overflow-hidden p-0">
        <DialogHeader className="px-6 pb-4 pt-6 pr-12">
          <DialogTitle>选择要导入的内容</DialogTitle>
          <DialogDescription className="space-y-1">
            <span className="block">扫描到 {foundSummary}</span>
            <span className="block truncate" title={root}>
              {root}{scan.userDir ? ` · 已定位到 ${scan.userDir}` : ''}
            </span>
          </DialogDescription>
          <div className="mt-3 rounded-md border border-border bg-muted/30 px-3 py-2">
            <p className="text-xs leading-5 text-muted-foreground">
              <span className="font-medium text-foreground">重复导入规则：</span>{IMPORT_POLICY_SUMMARY}
            </p>
          </div>
        </DialogHeader>

        <div className="min-h-0 border-y border-border">
          <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-3">
            <div>
              <p className="text-sm font-medium">已选 {pickedCount} / {availableCount} 个项目组</p>
              <p className="text-xs text-muted-foreground">切换类别不会清除已经勾选的内容</p>
            </div>
            <div className="flex items-center gap-1">
              <Button type="button" variant="ghost" size="sm" onClick={() => onPicksChange(createAllImportPicks(scan))}>
                全选
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => onPicksChange(createEmptyImportPicks())}>
                清空
              </Button>
            </div>
          </div>

          <Tabs value={activeSection} onValueChange={(value) => setActiveSection(value as SectionId)} className="flex h-[min(58vh,34rem)] min-h-0 flex-col">
            <div className="shrink-0 overflow-x-auto border-y border-border bg-muted/30 px-4 py-2">
              <TabsList className="h-auto min-w-max justify-start bg-transparent p-0">
                {sections.map((section) => {
                  const Icon = section.icon;
                  return (
                    <TabsTrigger key={section.id} value={section.id} className="gap-1.5 px-2.5">
                      <Icon className="h-3.5 w-3.5" />
                      {section.label}
                      <span className="text-[10px] text-muted-foreground">{section.selected}/{section.found}</span>
                    </TabsTrigger>
                  );
                })}
              </TabsList>
            </div>

            <div className="min-h-0 overflow-y-auto px-6 py-3">
              <TabsContent value="characters" className="m-0">
                <p className="mb-2 text-xs text-muted-foreground">角色卡进入角色库，名下聊天一并进入对应角色的故事。</p>
                {scan.characters.map((character) => (
                  <PickRow
                    key={character.pngPath}
                    checked={picks.chars.has(character.pngPath)}
                    title={character.name}
                    description={character.chats.length
                      ? `${character.chats.length} 场聊天 · ${formatBytes(character.chatBytes)}`
                      : `仅角色卡 · ${formatBytes(character.pngSize)}`}
                    onCheckedChange={(checked) => onPicksChange({
                      ...picks,
                      chars: toggleImportPick(picks.chars, character.pngPath, checked),
                    })}
                  />
                ))}
              </TabsContent>

              <TabsContent value="chats" className="m-0">
                <p className="mb-2 text-xs text-muted-foreground">没有匹配角色卡的聊天会进入临时故事，内容不会丢弃。</p>
                {scan.strayChats.map((chat) => (
                  <PickRow
                    key={chat.path}
                    checked={picks.strays.has(chat.path)}
                    title={`${chat.characterDir} / ${chat.name}`}
                    description={`${formatBytes(chat.size)} · 导入为未绑定故事`}
                    onCheckedChange={(checked) => onPicksChange({
                      ...picks,
                      strays: toggleImportPick(picks.strays, chat.path, checked),
                    })}
                  />
                ))}
              </TabsContent>

              <TabsContent value="worldbooks" className="m-0">
                <p className="mb-2 text-xs text-muted-foreground">世界书进入附属库，并用于恢复角色、全局和聊天关联。</p>
                {scan.worldbooks.map((worldbook) => (
                  <PickRow
                    key={worldbook.path}
                    checked={picks.wbs.has(worldbook.path)}
                    title={worldbook.name}
                    description={formatBytes(worldbook.size)}
                    onCheckedChange={(checked) => onPicksChange({
                      ...picks,
                      wbs: toggleImportPick(picks.wbs, worldbook.path, checked),
                    })}
                  />
                ))}
              </TabsContent>

              <TabsContent value="presets" className="m-0">
                <p className="mb-2 text-xs text-muted-foreground">聊天补全预设进入附属库，可继续查看和编辑。</p>
                {scan.presets.map((preset) => (
                  <PickRow
                    key={preset.path}
                    checked={picks.presets.has(preset.path)}
                    title={preset.name}
                    description={`${formatBytes(preset.size)} · OpenAI Settings 预设`}
                    onCheckedChange={(checked) => onPicksChange({
                      ...picks,
                      presets: toggleImportPick(picks.presets, preset.path, checked),
                    })}
                  />
                ))}
              </TabsContent>

              <TabsContent value="archives" className="m-0">
                <p className="mb-2 text-xs text-muted-foreground">扩展代码不会执行；文件保持原目录结构，归档到“资产/其他/SillyTavern”。</p>
                {scan.archives.map((group) => (
                  <PickRow
                    key={group.kind}
                    icon={Archive}
                    checked={picks.archives.has(group.kind)}
                    title={`${group.kind}/`}
                    description={`${group.files.length} 个文件 · ${formatBytes(group.bytes)} · 原样归档`}
                    onCheckedChange={(checked) => onPicksChange({
                      ...picks,
                      archives: toggleImportPick(picks.archives, group.kind, checked),
                    })}
                  />
                ))}
              </TabsContent>

              <TabsContent value="regex" className="m-0">
                <p className="mb-2 text-xs text-muted-foreground">settings.json 中的全局正则整组进入附属库。</p>
                {scan.regex && (
                  <PickRow
                    checked={picks.regex}
                    title="ST 全局正则"
                    description={`${scan.regex.count} 条脚本 · 导入为一套规则集`}
                    onCheckedChange={(checked) => onPicksChange({ ...picks, regex: checked })}
                  />
                )}
              </TabsContent>

              <TabsContent value="relationships" className="m-0">
                <p className="mb-2 text-xs text-muted-foreground">主绑定和对话级关系随角色与聊天恢复；这里控制 settings 中的全局和额外链接。</p>
                {scan.relationships.status === 'parsed' ? (
                  <PickRow
                    checked={picks.settingsRelations}
                    title="settings.json 世界书关系"
                    description={`全局 ${scan.relationships.globalWorldbooks.length} 个 · 角色额外链接 ${scan.relationships.characterWorldbooks.reduce((sum, row) => sum + row.worldbooks.length, 0)} 个`}
                    onCheckedChange={(checked) => onPicksChange({ ...picks, settingsRelations: checked })}
                  />
                ) : (
                  <div className="flex items-start gap-2 rounded border border-border bg-muted/30 p-3 text-sm">
                    <FileText className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                    <p><span className="font-medium">settings.json 无法解析。</span><br /><span className="text-xs text-muted-foreground">本次不会改动已有的全局或额外世界书链接。</span></p>
                  </div>
                )}
              </TabsContent>
            </div>
          </Tabs>
        </div>

        <div className="px-6 py-4">
          {!!scan.warnings.length && (
            <p className="mb-3 text-xs text-muted-foreground">
              已安全跳过 {scan.warnings.length} 个符号链接、非法路径名或过深目录；路径会写入本次清单。
            </p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={onCancel} disabled={importing}>取消</Button>
            <Button onClick={onImport} disabled={importing || pickedCount === 0}>
              {importing ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Download className="mr-1 h-4 w-4" />}
              导入 {pickedCount} 个项目组
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
