import type { LucideIcon } from 'lucide-react';
import {
  BookOpen,
  Home,
  IdCard,
  Layers,
  MessageSquare,
  Network,
  PenLine,
  Regex,
  SlidersHorizontal,
  Users,
} from 'lucide-react';

export type NavAreaKey = 'home' | 'characters' | 'editor' | 'assets';

export interface NavDestination {
  key: string;
  label: string;
  description?: string;
  icon: LucideIcon;
  path: string;
  prefixes?: string[];
  query?: Record<string, string | null>;
  activeMatches?: Array<{
    prefix: string;
    query?: Record<string, string | null>;
  }>;
}

export interface NavArea extends NavDestination {
  key: NavAreaKey;
  children: NavDestination[];
}

/**
 * 左侧导航的唯一信息架构来源。
 * 页面组件只负责渲染，不再在 AppLayout 里维护一组互相覆盖的散落路由。
 */
export const NAV_AREAS: NavArea[] = [
  {
    key: 'home',
    label: '首页',
    description: '最近角色、故事与处理入口',
    icon: Home,
    path: '/',
    prefixes: ['/'],
    children: [],
  },
  {
    key: 'characters',
    label: '角色库',
    description: '浏览、筛选和维护角色卡',
    icon: Users,
    path: '/library',
    prefixes: ['/library', '/character'],
    children: [],
  },
  {
    key: 'editor',
    label: '编辑区',
    description: '处理聊天与整理故事资料',
    icon: PenLine,
    path: '/chat',
    prefixes: ['/tools', '/chat', '/worldbook', '/card-viewer', '/preset', '/regex', '/story'],
    children: [
      { key: 'chat', label: '聊天处理', description: '正则清理、转换与导出', icon: MessageSquare, path: '/chat', prefixes: ['/chat'] },
      { key: 'summary', label: '总结', description: '生成分卷、日记和自定义记录', icon: BookOpen, path: '/tools?focus=summary', prefixes: ['/tools'], query: { focus: 'summary' } },
      { key: 'story-tree', label: '故事树', description: '整理人物与事件脉络', icon: Network, path: '/tools?focus=story-tree', prefixes: ['/tools'], query: { focus: 'story-tree' } },
      {
        key: 'worldbook', label: '世界书', description: '编辑世界设定条目', icon: BookOpen,
        path: '/tools?focus=worldbook', prefixes: ['/worldbook'],
        activeMatches: [{ prefix: '/tools', query: { focus: 'worldbook' } }, { prefix: '/worldbook' }],
      },
      { key: 'card', label: '角色卡', description: '查看和处理卡片字段', icon: IdCard, path: '/card-viewer', prefixes: ['/card-viewer'] },
      {
        key: 'preset', label: '预设', description: '编辑提示词与生成配置', icon: SlidersHorizontal,
        path: '/tools?focus=preset', prefixes: ['/preset'],
        activeMatches: [{ prefix: '/tools', query: { focus: 'preset' } }, { prefix: '/preset' }],
      },
      { key: 'regex', label: '正则', description: '编辑规则集并预览生效结果', icon: Regex, path: '/regex', prefixes: ['/regex'] },
    ],
  },
  {
    key: 'assets',
    label: '附属库',
    description: '管理可复用的共享资产',
    icon: Layers,
    path: '/assets?tab=worldbook',
    prefixes: ['/assets'],
    children: [
      { key: 'worldbook', label: '世界书', description: '共享世界书资产', icon: BookOpen, path: '/assets?tab=worldbook', prefixes: ['/assets'], query: { tab: 'worldbook' } },
      { key: 'preset', label: '预设', description: '共享预设资产', icon: SlidersHorizontal, path: '/assets?tab=preset', prefixes: ['/assets'], query: { tab: 'preset' } },
      { key: 'regex', label: '正则', description: '共享规则集资产', icon: Regex, path: '/assets?tab=regex', prefixes: ['/assets'], query: { tab: 'regex' } },
      { key: 'other', label: '其他资产', description: '资产说明与扩展归档', icon: Layers, path: '/assets', prefixes: ['/assets'], query: { tab: null } },
    ],
  },
];

function queryMatches(query: Record<string, string | null> | undefined, search: string): boolean {
  if (!query) return true;
  const params = new URLSearchParams(search);
  return Object.entries(query).every(([key, expected]) => params.get(key) === expected);
}

export function matchesNavDestination(item: NavDestination, pathname: string, search: string): boolean {
  if (item.activeMatches) {
    return item.activeMatches.some(({ prefix, query }) => (
      (prefix === '/' ? pathname === '/' : pathname.startsWith(prefix))
        && queryMatches(query, search)
    ));
  }
  const prefixes = item.prefixes ?? [item.path.split('?')[0]];
  const pathMatches = prefixes.some((prefix) => prefix === '/' ? pathname === '/' : pathname.startsWith(prefix));
  return pathMatches && queryMatches(item.query, search);
}

export function findNavArea(pathname: string, search: string): NavArea | undefined {
  return NAV_AREAS.find((area) =>
    area.children.some((child) => matchesNavDestination(child, pathname, search))
      || matchesNavDestination(area, pathname, search),
  );
}
