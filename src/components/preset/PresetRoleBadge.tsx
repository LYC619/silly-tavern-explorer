import { Badge } from '@/components/ui/badge';
import type { PromptBlock } from '@/types/preset';
import { PROMPT_ROLE_LABELS } from '@/types/preset';

/** 角色色条：system/user/assistant 用不同语义色，marker/未引用/空条目用专门样式 */
export function RoleBadge({ role }: { role?: string }) {
  const label = role ? (PROMPT_ROLE_LABELS[role] ?? role) : '—';
  const cls =
    role === 'user'
      ? 'bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30'
      : role === 'assistant'
        ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30'
        : 'bg-primary/10 text-primary border-primary/30'; // system / 默认
  return <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${cls}`}>{label}</Badge>;
}

export function MarkerBadge() {
  return (
    <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-muted text-muted-foreground border-border">
      插槽
    </Badge>
  );
}

export function UnreferencedBadge() {
  return (
    <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-muted/60 text-muted-foreground border-dashed">
      未引用
    </Badge>
  );
}

export function EmptyBadge() {
  return (
    <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30">
      空条目
    </Badge>
  );
}

/** 块左边框色（用于预览/列表项左侧色条） */
export function roleBorderClass(block: PromptBlock): string {
  if (block.marker) return 'border-l-muted-foreground/40';
  if (block.role === 'user') return 'border-l-blue-500/60';
  if (block.role === 'assistant') return 'border-l-emerald-500/60';
  return 'border-l-primary/60';
}
