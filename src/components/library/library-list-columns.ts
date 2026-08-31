/**
 * 列表视图的列宽定义。表头和数据行必须读同一个函数，否则两边会各自漂移、列对不齐。
 * 单独成文件是为了 react-refresh：组件文件里混着非组件导出，Vite 热替换会退化成整页重载。
 */
export function libraryListColumns(batchMode: boolean): string {
  const content = '42px minmax(0, 1fr) 64px 64px 80px 40px';
  return batchMode ? `20px ${content}` : content;
}
