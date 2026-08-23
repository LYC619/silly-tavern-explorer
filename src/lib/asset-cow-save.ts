/**
 * 写时复制保存的落库那一半（阶段 F）。
 *
 * `asset-cow.ts` 只做纯决策，不碰存储；这里承接决策结果，把「写哪条记录 + 把角色引用切过去」
 * 收成一处。世界书 / 预设 / 正则三页原本各手抄一份三分支（update / redirect / copy），
 * 骨架逐字符相同，只有载荷字段与提示文案不同——改一处必漏另外两处。
 *
 * 分工：本函数只管落库与引用切换，不管提示与页面状态。三页的 toast 文案已经漂移
 * （「原世界书未改动」/「原预设未改动」/ 正则的原地保存干脆不提示），统一它们是另一件事，
 * 所以返回 { action, targetId, title } 让调用方自己决定说什么、改哪个 state。
 */
import type { AssetKind } from '@/types/archive';
import { planCowSave, buildDerivedMeta, type CowAssetLike, type CowPlan } from '@/lib/asset-cow';
import { updateCharacterAssetReference } from '@/lib/character-asset-ref';

/**
 * 编辑器当前内容：一条记录里除 id / title / 时间 / derived 之外的全部字段。
 * 载荷（worldbook / preset / rules）与 `autoSaved: false` 这类标志都从这里进来。
 *
 * 来源字段（sourcePath / sourceModifiedAt / embedded / stGlobal…）**故意不在这里**：
 * 派生副本从零构造，不继承原资产的来源信息——副本不是从那个 ST 文件导入来的。
 */
export type CowSaveContent<T extends CowAssetLike> = Omit<
  T,
  'id' | 'title' | 'derived' | 'createdAt' | 'updatedAt'
>;

export interface CowSaveResult {
  action: CowPlan['action'];
  /** 实际落库的资产 id（副本或原资产） */
  targetId: string;
  /** 落库后这条资产的标题：update = 传入的 title，redirect = 既有副本的标题，copy = 派生名 */
  title: string;
}

export interface CowSaveParams<T extends CowAssetLike> {
  kind: AssetKind;
  /** 当前载入的资产 id。记录内容一律以保存时重读的库内数据为准，不收调用方的快照 */
  baseId: string;
  /** 保存前重读同类资产全集：base 与该角色的既有派生副本都从这里取 */
  reload: () => Promise<T[]>;
  characterId: string;
  characterName: string;
  /** 编辑器里的当前标题（只在原地更新时生效） */
  title: string;
  content: CowSaveContent<T>;
  newId: () => string;
  save: (item: T) => Promise<void>;
  now?: number;
}

/**
 * 在角色上下文里保存一条资产：按写时复制决策落库，并把该角色的引用切到落库目标。
 * 原资产在 redirect / copy 两条分支上一个字节都不会被写。
 *
 * 读不出库内数据、或这条资产已经不在库里时**抛错**，调用方负责报给用户。
 */
export async function saveAssetWithCow<T extends CowAssetLike>(
  params: CowSaveParams<T>,
): Promise<CowSaveResult> {
  const { kind, baseId, reload, characterId, characterName, content, save } = params;

  // 落库前重读。挂载期的那份快照可能已经被别处改过（另一个标签页、一次导入、
  // 批量操作），拿它展开写回等于把别人的改动抹掉；该角色新建的派生副本也只有
  // 重读才看得见，否则会重复新建。读不出来就中止，绝不用陈旧快照顶替——
  // 与 Index.tsx 切故事时「以刚 persist 的库内数据为准」是同一条规矩。
  const all = await reload();
  const base = all.find((a) => a.id === baseId);
  if (!base) {
    throw new Error('这条资产已经不在库里了（可能已被删除），保存已中止');
  }

  const now = params.now ?? Date.now();
  const plan = planCowSave(base, characterId, characterName, all);

  let targetId: string;
  let title: string;
  let item: T;

  if (plan.action === 'update') {
    // 原地更新：无派生关系，或这条本就是该角色的副本
    targetId = plan.targetId;
    title = params.title;
    item = {
      ...base,
      ...content,
      title,
      ...(base.derived ? { derived: { ...base.derived, updatedAt: now } } : {}),
      updatedAt: now,
    } as T;
  } else if (plan.action === 'redirect') {
    // 该角色此前已建过副本：更新那一份，标题沿用副本自己的（不拿编辑器里的名字覆盖）
    const copy = all.find((a) => a.id === plan.targetId);
    if (!copy) throw new Error(`找不到派生副本 ${plan.targetId}`);
    targetId = copy.id;
    title = copy.title;
    item = {
      ...copy,
      ...content,
      derived: copy.derived ? { ...copy.derived, updatedAt: now } : copy.derived,
      updatedAt: now,
    } as T;
  } else {
    // 首次在该角色上下文改共享资产：从零构造派生副本，不继承来源字段
    targetId = params.newId();
    title = plan.copyTitle;
    // content 恰好是 T 去掉下面这五个字段，补齐即成 T；
    // 但 TS 不会把 Omit<T,K> 与补回的 K 重新合成泛型 T，只能在这里断言
    item = {
      ...content,
      id: targetId,
      title,
      derived: buildDerivedMeta(plan.derivedFrom, characterId),
      createdAt: now,
      updatedAt: now,
    } as unknown as T;
  }

  await save(item);
  // 引用切换走角色写入队列，避免用旧角色快照覆盖其他字段
  await updateCharacterAssetReference(characterId, kind, base.id, targetId, now);
  return { action: plan.action, targetId, title };
}
