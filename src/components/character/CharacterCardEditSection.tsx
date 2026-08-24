import { FileText, Info, Save, Sparkles, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import type { CardEdits } from '@/lib/card-export';

function Field({
  label,
  value,
  onChange,
  multiline = true,
  className = '',
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  multiline?: boolean;
  className?: string;
}) {
  return (
    <label className={`block space-y-1.5 ${className}`}>
      <span className="text-sm font-medium text-[color:var(--character-label)]">{label}</span>
      {multiline ? (
        <Textarea value={value} onChange={(event) => onChange(event.target.value)} className="min-h-[92px] text-sm leading-relaxed" />
      ) : (
        <Input size="lg" value={value} onChange={(event) => onChange(event.target.value)} className="text-sm" />
      )}
    </label>
  );
}

interface CharacterCardEditSectionProps {
  edits: CardEdits;
  displayName: string;
  onEditChange: <K extends keyof CardEdits>(key: K, value: CardEdits[K]) => void;
  onDisplayNameChange: (value: string) => void;
  onSave: () => void | Promise<void>;
  saving: boolean;
}

export function CharacterCardEditSection({
  edits,
  displayName,
  onEditChange,
  onDisplayNameChange,
  onSave,
  saving,
}: CharacterCardEditSectionProps) {
  return (
    <section className="rounded-lg border border-[color:var(--border-normal)] bg-[color:var(--bg-elevated)] p-5">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-[color:var(--brand-hi)]" />
            <h2 className="text-base font-semibold text-[color:var(--text-primary)]">角色卡编辑</h2>
          </div>
          <p className="mt-1 text-sm text-[color:var(--text-muted)]">修改会保留卡片中未编辑的世界书、扩展和其他字段。</p>
        </div>
        <Button size="sm" onClick={() => void onSave()} disabled={saving}>
          <Save className="mr-1.5 h-3.5 w-3.5" />
          {saving ? '保存中…' : '保存修改'}
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Field label="实际名（卡内 name）" value={edits.name} onChange={(value) => onEditChange('name', value)} multiline={false} />
        <Field label="展示名（STE 本地）" value={displayName} onChange={onDisplayNameChange} multiline={false} />
        <Field label="昵称（nickname）" value={edits.nickname} onChange={(value) => onEditChange('nickname', value)} multiline={false} />
        <Field label="作者（creator）" value={edits.creator} onChange={(value) => onEditChange('creator', value)} multiline={false} />
        <Field label="角色版本（character_version）" value={edits.characterVersion} onChange={(value) => onEditChange('characterVersion', value)} multiline={false} />
        <Field label="性格（personality）" value={edits.personality} onChange={(value) => onEditChange('personality', value)} />
        <Field label="描述（description）" value={edits.description} onChange={(value) => onEditChange('description', value)} className="md:col-span-2" />
        <Field label="场景（scenario）" value={edits.scenario} onChange={(value) => onEditChange('scenario', value)} className="md:col-span-2" />
        <Field label="对话示例（mes_example）" value={edits.messageExample} onChange={(value) => onEditChange('messageExample', value)} />
        <Field label="作者备注（creator_notes）" value={edits.creatorNotes} onChange={(value) => onEditChange('creatorNotes', value)} />
        <Field label="系统提示（system_prompt）" value={edits.systemPrompt} onChange={(value) => onEditChange('systemPrompt', value)} />
        <Field label="历史后指令（post_history_instructions）" value={edits.postHistoryInstructions} onChange={(value) => onEditChange('postHistoryInstructions', value)} />
      </div>
    </section>
  );
}
