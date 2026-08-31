/**
 * 提示词块的纯判定与配色，从 PresetRoleBadge 里搬出来。
 * 搬的原因是 react-refresh：徽章组件和这两个函数同居一个文件时，改徽章样式会整页重载。
 *
 * 左边框色不走四组语义色——块角色是分类而非状态，数量随 ST 的枚举走
 * （见 docs/ui-conventions.md「分类色不是状态色」）。
 */
import type { PromptBlock } from '@/types/preset';

/** 是否为 ST 绝对注入块（injection_position === 1） */
export function isInjectionBlock(block?: PromptBlock): boolean {
  return !!block && !block.marker && block.injection_position === 1;
}

/** 块左边框色（用于预览/列表项左侧色条） */
export function roleBorderClass(block: PromptBlock): string {
  if (block.marker) return 'border-l-muted-foreground/40';
  if (block.role === 'user') return 'border-l-blue-500/60';
  if (block.role === 'assistant') return 'border-l-emerald-500/60';
  return 'border-l-primary/60';
}
