/** AppLayout 重挂时保留编辑区最近列表的展开状态。 */
let editorOpen = false;

export function getEditorOpen(): boolean {
  return editorOpen;
}

export function setEditorOpenState(next: boolean): void {
  editorOpen = next;
}
