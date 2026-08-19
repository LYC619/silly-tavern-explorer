const ORGANIZE_WORKSPACE_VIEWS = new Set(['volume', 'diary', 'diy', 'tree', 'io']);

/** 整理与导入导出页面共用固定高度外壳，不渲染宽二级栏。 */
export function isOrganizeWorkspaceView(view: string): boolean {
  return ORGANIZE_WORKSPACE_VIEWS.has(view);
}
