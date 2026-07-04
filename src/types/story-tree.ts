/**
 * 故事树（可视化事实树）数据类型 —— 二期。
 *
 * 定位：纯手动 + AI 辅助的事实树，回顾多角色故事时的记忆锚点。
 * 相比参考项目 st-memory-wizzard 的记忆树：
 * - 砍掉 路由/自动填树/关键词召回（那些为实时对话省 token，归档场景不需要）；
 * - 主键改用稳定 id + parentId（参考项目用 path 当主键，重命名/移动要级联改所有后代 path，
 *   是其最大技术债）——path 仅在需要时由 buildOutline 派生，支持无痛拖拽移动。
 */

export interface StoryNode {
  id: string;
  /** 父节点 id；null=根节点 */
  parentId: string | null;
  title: string;
  /** 一行提示/别名，大纲里跟在标题后 */
  hint: string;
  /** 正文（事实描述） */
  content: string;
  /** 自由标签（纯标注，不做召回） */
  tags: string[];
  /** UI 置顶标记 */
  pinned: boolean;
  /** 软删除：归档不物删（契合归档工具），归档区可恢复 */
  archived: boolean;
  /** 同级排序权重，小者在前 */
  order: number;
}

export interface StoryTree {
  id: string;
  /** 关联的书；书删后置 null，树仍保留 */
  bookId: string | null;
  bookTitle: string;
  title: string;
  nodes: StoryNode[];
  createdAt: number;
  updatedAt: number;
  /** true=自动暂存历史(最近若干份)；false/undefined=手动保存，永久留存 */
  autoSaved?: boolean;
}

/** 供 UI 渲染的嵌套节点（由扁平 nodes 派生，见 story-tree-model.toForest） */
export interface StoryNodeTree extends StoryNode {
  children: StoryNodeTree[];
}

export function generateStoryTreeId(): string {
  return `story_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export function generateStoryNodeId(): string {
  return `node_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}
