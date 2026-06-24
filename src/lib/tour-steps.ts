import type { TourStep } from '@/components/GuidedTour';

export const HOME_TOUR_STEPS: TourStep[] = [
  {
    targetSelector: '[data-tour="chat-preview"]',
    content: '这是您的聊天记录预览，示例数据已自动加载。支持导入 SillyTavern JSON、JSONL、TXT 格式。',
    action: 'next',
  },
  {
    targetSelector: '[data-tour="msg-edit-pencil"]',
    content: '每条消息右上角的铅笔图标，点击即可直接编辑该楼的内容与说话人——所见即点，无需先切换模式。',
    action: 'next',
  },
  {
    targetSelector: '[data-tour="regex-toggle"]',
    content: '正则工具可以批量清理格式（去除 OOC、清理 HTML 标签等）。点击打开侧边栏。',
    action: 'next',
  },
  {
    targetSelector: '[data-tour="chapter-mark-btn"]',
    content: '章节标记可以为长对话划分章节。您也可以用 AI 工具自动生成智能分章。',
    action: 'next',
  },
  {
    targetSelector: '[data-tour="export-button"]',
    content: '点击这里导出为 JSONL 或 TXT 文件，支持选择导出范围和清理选项。',
    action: 'next',
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
  {
    targetSelector: '[data-tour="wb-ai"]',
    content: 'AI 辅助：「AI 追加」可按当前聊天记录提炼新设定、追加为新条目；编辑某条目时还能用「AI 改写」精修这一条内容。需先在「AI 工具」页配置 API。',
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

export const CARDVIEWER_TOUR_STEPS: TourStep[] = [
  {
    targetSelector: '[data-tour="card-import"]',
    content: '拖入或选择 SillyTavern 角色卡（PNG / JSON，支持 V1/V2/V3），即可解析并编辑。',
    action: 'next',
  },
  {
    targetSelector: '[data-tour="card-fields"]',
    content: '可编辑角色的核心字段：名称、描述、性格、场景、开场白、标签等；未编辑的字段（内嵌世界书、立绘资源等）会原样保留。',
    action: 'next',
  },
  {
    targetSelector: '[data-tour="card-export"]',
    content: '编辑完点这里导出：PNG 卡可回写图片（保留立绘）导出 PNG，也可导出 JSON，均能导回 SillyTavern。「保存」可留存到「已存角色卡」。',
    action: 'next',
  },
];

export const PRESET_TOUR_STEPS: TourStep[] = [
  {
    targetSelector: '[data-tour="preset-import"]',
    content: '导入 SillyTavern 的 Chat Completion 预设 `.json`，即可可视化查看与编辑。',
    action: 'next',
  },
  {
    targetSelector: '[data-tour="preset-tabs"]',
    content: '五个标签页：概览、提示词（拖拽排序 / 启用禁用 / 新建块 / AI 改写）、工具字段、正则、导出。',
    action: 'next',
  },
  {
    targetSelector: '[data-tour="preset-export"]',
    content: '编辑完可完整 / 智能 / Markdown 导出，保留未识别字段无损还原；「保存」留存到「已存预设」。',
    action: 'next',
  },
];

// Storage keys
const PREFIX = 'onboarding-';
export const TOUR_MODULES = ['home', 'bookshelf', 'worldbook', 'aitools', 'cardviewer', 'preset'] as const;
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
