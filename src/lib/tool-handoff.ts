/**
 * 处理区入口 → 各工具页的文件交接（2.0 阶段5，定稿第六章）。
 *
 * 入口页确认类型后把文件放到这里，navigate 到工具页；工具页挂载时取走并走
 * 自己原有的导入流程。内存态、单标签页内跳转有效——刷新即失效，此时各页自身的
 * 导入按钮照常可用，不影响任何功能，故不值得为它引入持久化（文件可能几十 MB）。
 */

export type ToolFileKind = 'chat' | 'worldbook' | 'preset' | 'card' | 'regex';

let pending: { kind: ToolFileKind; file: File } | null = null;

export function setPendingToolFile(kind: ToolFileKind, file: File): void {
  pending = { kind, file };
}

/** 取走指定类型的待处理文件（取走即清空；类型不匹配返回 null 且不清） */
export function takePendingToolFile(kind: ToolFileKind): File | null {
  if (pending?.kind !== kind) return null;
  const file = pending.file;
  pending = null;
  return file;
}

/** 只探测不取走：工具页挂载时用它决定「有交接文件就跳过自动恢复」，避免两者竞态互相覆盖 */
export function peekPendingToolFile(kind: ToolFileKind): boolean {
  return pending?.kind === kind;
}
