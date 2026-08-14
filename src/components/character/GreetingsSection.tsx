import { MessageSquare, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import type { CardEdits } from '@/lib/card-export';

interface GreetingsSectionProps {
  edits: CardEdits;
  onEditChange: <K extends keyof CardEdits>(key: K, value: CardEdits[K]) => void;
}

export function GreetingsSection({ edits, onEditChange }: GreetingsSectionProps) {
  const updateGreeting = (index: number, value: string) => {
    const next = [...edits.alternateGreetings];
    next[index] = value;
    onEditChange('alternateGreetings', next);
  };

  return (
    <section className="rounded-lg border border-[color:var(--border-normal)] bg-[color:var(--bg-elevated)] p-5">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-[color:var(--brand-hi)]" />
            <h2 className="text-base font-semibold text-[color:var(--text-primary)]">开场白</h2>
          </div>
          <p className="mt-1 text-sm text-[color:var(--text-muted)]">设置首次对话内容，并维护可轮换的备选开场白。</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => onEditChange('alternateGreetings', [...edits.alternateGreetings, ''])}
        >
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          添加备选
        </Button>
      </div>

      <label className="block space-y-1.5">
        <span className="text-sm font-medium text-[color:var(--character-label)]">主开场白（first_mes）</span>
        <Textarea
          value={edits.firstMessage}
          onChange={(event) => onEditChange('firstMessage', event.target.value)}
          className="min-h-[180px] text-sm leading-relaxed"
        />
      </label>

      <div className="mt-6 space-y-3">
        <h3 className="text-sm font-semibold text-[color:var(--character-label)]">备选开场白（alternate_greetings）</h3>
        {edits.alternateGreetings.map((greeting, index) => (
          <div key={index} className="flex items-start gap-2">
            <span className="mt-2.5 w-6 shrink-0 text-center text-xs text-[color:var(--text-muted)]">{index + 1}</span>
            <Textarea
              value={greeting}
              onChange={(event) => updateGreeting(index, event.target.value)}
              className="min-h-[120px] flex-1 text-sm leading-relaxed"
              aria-label={`备选开场白 ${index + 1}`}
            />
            <Button
              variant="ghost"
              size="icon"
              className="mt-1 h-8 w-8 shrink-0 text-[color:var(--text-muted)] hover:text-destructive"
              onClick={() => onEditChange('alternateGreetings', edits.alternateGreetings.filter((_, i) => i !== index))}
              aria-label={`删除备选开场白 ${index + 1}`}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
        {edits.alternateGreetings.length === 0 && (
          <p className="rounded-md border border-dashed border-[color:var(--border-normal)] px-3 py-6 text-center text-sm text-[color:var(--text-muted)]">
            暂无备选开场白，点击右上角添加。
          </p>
        )}
      </div>
    </section>
  );
}
