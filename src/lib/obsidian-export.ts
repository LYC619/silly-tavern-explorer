/**
 * 导出为 Obsidian 友好的 Markdown（YAML frontmatter + 可选双链）。
 * 面向归档场景：总结与故事树导出后可直接放进 Obsidian 库，靠 frontmatter/双链组织。
 * 纯函数，产出字符串；下载由调用方处理。
 */

import type { SummaryItem, SummaryKind } from '@/types/summary';
import { SUMMARY_KIND_LABELS } from '@/types/summary';
import type { StoryTree, StoryNode } from '@/types/story-tree';
import { childrenOf, nodePath } from '@/lib/story-tree-model';

/** YAML 值转义：含特殊字符时加引号 */
function yamlValue(v: string): string {
  if (v === '') return '""';
  if (/[:#\[\]{}",&*?|<>=!%@`\n]/.test(v)) {
    return `"${v.replace(/"/g, '\\"')}"`;
  }
  return v;
}

function frontmatter(fields: Record<string, string | number | string[] | undefined>): string {
  const lines: string[] = ['---'];
  for (const [k, v] of Object.entries(fields)) {
    if (v === undefined) continue;
    if (Array.isArray(v)) {
      if (v.length === 0) continue;
      lines.push(`${k}:`);
      v.forEach((item) => lines.push(`  - ${yamlValue(item)}`));
    } else if (typeof v === 'number') {
      lines.push(`${k}: ${v}`);
    } else {
      lines.push(`${k}: ${yamlValue(v)}`);
    }
  }
  lines.push('---');
  return lines.join('\n');
}

const KIND_TAG: Record<SummaryKind, string> = {
  volume: '分卷总结',
  diary: '角色日记',
  diy: 'DIY创作',
};

/** 单条总结 → Obsidian markdown */
export function summaryToObsidian(item: SummaryItem): string {
  const fm = frontmatter({
    title: item.title,
    book: item.bookTitle,
    type: KIND_TAG[item.kind],
    volume: item.volumeNumber,
    floors: `${item.floorStart}-${item.floorEnd}`,
    created: new Date(item.createdAt).toISOString().slice(0, 10),
    tags: ['st-归档', KIND_TAG[item.kind]],
  });
  return `${fm}\n\n# ${item.title}\n\n${item.content.trim()}\n`;
}

/**
 * 故事树 → Obsidian markdown（单文件大纲，节点用标题层级 + 可选双链）。
 * linkNodes=true 时把节点标题写成 [[书名/节点路径]] 形式便于双链跳转。
 */
export function storyTreeToObsidian(tree: StoryTree, opts: { linkNodes?: boolean } = {}): string {
  const { linkNodes = false } = opts;
  const fm = frontmatter({
    title: tree.title,
    book: tree.bookTitle,
    type: '故事树',
    nodes: tree.nodes.filter((n) => !n.archived).length,
    created: new Date(tree.createdAt).toISOString().slice(0, 10),
    tags: ['st-归档', '故事树'],
  });

  const lines: string[] = [fm, '', `# ${tree.title}`, ''];

  const walk = (parentId: string | null, depth: number) => {
    for (const n of childrenOf(tree.nodes, parentId)) {
      if (n.archived) continue;
      // Obsidian 标题最多 6 级；更深用加粗列表兜底
      const path = nodePath(tree.nodes, n.id);
      const label = linkNodes ? `[[${tree.title}/${path}\\|${n.title}]]` : n.title;
      const hint = n.hint?.trim() ? ` — ${n.hint.trim()}` : '';
      if (depth < 6) {
        lines.push(`${'#'.repeat(depth + 2)} ${label}${hint}`);
      } else {
        lines.push(`${'  '.repeat(depth - 6)}- **${label}**${hint}`);
      }
      if (n.content?.trim()) lines.push('', n.content.trim());
      if (n.tags.length) lines.push('', n.tags.map((t) => `#${t}`).join(' '));
      lines.push('');
      walk(n.id, depth + 1);
    }
  };
  walk(null, 0);

  return lines.join('\n').replace(/\n{3,}/g, '\n\n');
}

/** 通用下载单个 markdown 文件 */
export function downloadMarkdown(name: string, content: string): void {
  const safe = name.replace(/[\\/:*?"<>|]/g, '_');
  const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = safe.endsWith('.md') ? safe : `${safe}.md`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
