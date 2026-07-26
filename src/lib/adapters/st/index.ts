/**
 * SillyTavern 导入适配器边界（2.0 阶段0 确立）。
 *
 * 设计约束（见 _reference/STE 概念设计/STE 2.0 设计定稿.md 第八章）：
 * ST 只是第一个数据来源，未来接其他角色扮演工具 = 新增一个 adapters/<tool>/，
 * 出口统一为 @/types/chat 与 @/types/archive 的通用类型；应用层不直接依赖 ST 专有格式。
 *
 * 现有 ST 专有解析器暂留原路径（避免无行为收益的 import 大迁移），由此处统一转发；
 * 阶段2+ 新代码一律从 '@/lib/adapters/st' 导入，不再直接引 png-parser 等内部模块。
 */

// 聊天：JSONL / JSON
export { parseJsonl, parseJson, parseSTDate, isTrueSystemMessage, serializeChatJsonl } from './chat-jsonl';

// 重复导入合并（阶段4，定稿 5.3①：新楼追加、冲突楼 STE 版转 swipe）
export { mergeReimport, STE_EDIT_SWIPE_FLAG, type ReimportMergeResult } from './reimport-merge';

// 角色卡：PNG（tEXt chara 块）/ JSON
export * from '@/lib/png-parser';
export * from '@/lib/png-writer';

// 预设
export * from '@/lib/preset-parser';

// 世界书（角色卡内嵌 character_book 与独立世界书）
export * from '@/lib/character-book';
