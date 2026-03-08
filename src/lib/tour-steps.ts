import type { TourStep } from '@/components/GuidedTour';

export const HOME_TOUR_STEPS: TourStep[] = [
  {
    targetSelector: '[data-tour="chat-preview"]',
    content: '这是您的聊天记录预览，示例数据已自动加载。支持导入 SillyTavern JSON、JSONL、TXT 格式。',
    action: 'next',
  },
  {
    targetSelector: '[data-tour="content-edit-btn"]',
    content: '点击进入内容编辑模式，可以直接修改任何一条消息文本。',
    action: 'click',
  },
  {
    targetSelector: '[data-tour="chat-preview"] [data-tour-message]',
    content: '点击消息即可打开编辑对话框。试试修改这条消息的内容。',
    action: 'interact',
    interactDoneSelector: '[role="dialog"]',
  },
  {
    targetSelector: '[data-tour="regex-toggle"]',
    content: '正则工具可以批量清理格式（去除 OOC、清理 HTML 标签等）。点击打开侧边栏。',
    action: 'click',
  },
  {
    targetSelector: '[data-tour="regex-quickadd"]',
    content: '这里是快速添加区域，提供了常用的正则预设规则。选择后点击添加即可应用到聊天记录中。',
    action: 'next',
  },
  {
    targetSelector: '[data-tour="chapter-mark-btn"]',
    content: '章节标记可以为长对话划分章节。您也可以用 AI 工具自动生成。',
    action: 'next',
  },
  {
    targetSelector: '[data-tour="export-button"]',
    content: '最后，导出为 JSONL 或 TXT 文件。点击导出试试。',
    action: 'click',
  },
];

export const BOOKSHELF_TOUR_STEPS: TourStep[] = [
  {
    targetSelector: '[data-tour="bookshelf-cards"]',
    content: '书架用于保存您编辑中的聊天记录。从首页点击「保存到书架」即可存入。点击作品可选择「沉浸阅读」或「编辑处理」。',
    action: 'next',
  },
  {
    targetSelector: '[data-tour="bookshelf-import"]',
    content: '点击这里可以跳转到首页导入新的聊天记录。',
    action: 'next',
  },
  {
    targetSelector: '[data-tour="global-settings"]',
    content: '在设置中可以查看存储用量、备份恢复数据、重置引导。',
    action: 'next',
  },
];

export const WORLDBOOK_TOUR_STEPS: TourStep[] = [
  {
    targetSelector: '[data-tour="wb-import"]',
    content: '导入 SillyTavern 世界书 JSON 文件，即可开始编辑。',
    action: 'next',
  },
  {
    targetSelector: '[data-tour="wb-staged"]',
    content: '之前编辑过的世界书会暂存在浏览器中，随时可以恢复。',
    action: 'next',
  },
  {
    targetSelector: '[data-tour="wb-view-toggle"]',
    content: '支持卡片视图和列表视图，适应不同编辑习惯。',
    action: 'next',
  },
  {
    targetSelector: '[data-tour="wb-batch"]',
    content: '批量模式可以一次选中多个条目进行前缀添加、删除、修改属性等操作。',
    action: 'next',
  },
  {
    targetSelector: '[data-tour="wb-prefix"]',
    content: '前缀归类可以为未分类条目分配标签，并自动整理排序。',
    action: 'next',
  },
];

export const AITOOLS_TOUR_STEPS: TourStep[] = [
  {
    targetSelector: '[data-tour="ai-config"]',
    content: '首先配置 OpenAI 兼容的 API 地址和密钥。支持自动获取模型列表。',
    action: 'next',
  },
  {
    targetSelector: '[data-tour="ai-floor-selector"]',
    content: '选择要发送给 AI 的聊天记录范围：全部、最近 N 条、或自定义勾选。',
    action: 'next',
  },
  {
    targetSelector: '[data-tour="ai-templates"]',
    content: '四个内置模板：总结剧情（含智能分章）、提取世界书、平行世界、自定义提示词。所有提示词均可自行编辑。',
    action: 'next',
  },
  {
    targetSelector: '[data-tour="ai-batch"]',
    content: '批量模式可以按段落并行处理长对话，加速分析。',
    action: 'next',
  },
];

// Storage keys
const PREFIX = 'onboarding-';
export const TOUR_MODULES = ['home', 'bookshelf', 'worldbook', 'aitools'] as const;
export type TourModule = typeof TOUR_MODULES[number];

export function isTourCompleted(module: TourModule): boolean {
  return localStorage.getItem(`${PREFIX}${module}-completed`) === '1';
}

export function setTourCompleted(module: TourModule): void {
  localStorage.setItem(`${PREFIX}${module}-completed`, '1');
}

export function resetAllTours(): void {
  TOUR_MODULES.forEach(m => {
    localStorage.removeItem(`${PREFIX}${m}-completed`);
    localStorage.removeItem(`${PREFIX}${m}-step`);
  });
}
