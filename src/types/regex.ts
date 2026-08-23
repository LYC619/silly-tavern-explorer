/**
 * 正则规则集资产的持久化记录（2.0 阶段5，定稿第六/七章「规则入资产库」）。
 *
 * 一条资产 = 一套命名的规则集（RegexRule[]），与世界书 / 预设同级的独立资产，
 * 支持引用 + 写时复制（derived 字段）。当前编辑中的规则仍走 localStorage
 * （session-storage），资产库负责持久化收藏与跨角色共享。
 *
 * 类型放在这里而不是 lib/regex-db.ts，是为了断开一条循环依赖：
 * regex-db → lib/repo → vault/active → vault-backend → regex-db。
 * 最后那条边只是 import type，运行时会被擦掉，但它让 vault-backend 无谓地
 * 依赖了一个数据访问模块。WorldBookItem / PresetItem 本来就在 types/ 下，
 * 这里只是把正则补齐成同一形态。
 */
import type { RegexRule } from '@/types/chat';
import type { DerivedAssetMeta, EmbeddedAssetMeta } from '@/types/archive';

export interface RegexCollectionItem {
  id: string;
  title: string;
  rules: RegexRule[];
  /** 写时复制派生副本的元数据；无 = 原生资产 */
  derived?: DerivedAssetMeta;
  /** 从 ST 目录导入时的来源绝对路径（阶段9.11，重复导入判定） */
  sourcePath?: string;
  /** 从角色卡内置正则提取时记录，用于按角色+内容哈希幂等导入。 */
  embedded?: EmbeddedAssetMeta;
  createdAt: number;
  updatedAt: number;
}
