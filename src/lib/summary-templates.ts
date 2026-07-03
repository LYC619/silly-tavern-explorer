/**
 * 总结提示词模板：内置模板（代码常量，不入库）+ 自定义模板（IndexedDB summaryTemplates store）。
 *
 * 内置模板结构改编自实测有效的 ST 注入式总结/日记提示词，做了入库洁化：
 * 主角名改 {{user}} 宏、亲密向字段中性化。私人版本可粘贴「另存为自定义模板」使用（存本地不进仓库）。
 *
 * 模板在生成时作为聊天历史最末一条 user 消息（D0 位置）注入；
 * {{char}}/{{user}}/{{volume}} 宏由 summary-engine 在组装时替换。
 */

import type { SummaryKind, SummaryTemplate } from '@/types/summary';
import { getAllSummaryTemplates } from '@/lib/summary-db';

export interface BuiltinSummaryTemplate {
  /** builtin- 前缀，与自定义模板（stpl_ 前缀）id 空间区分 */
  id: string;
  title: string;
  kind: SummaryKind | 'any';
  content: string;
  builtin: true;
}

export type AnySummaryTemplate = BuiltinSummaryTemplate | SummaryTemplate;

export function isBuiltinTemplate(t: AnySummaryTemplate): t is BuiltinSummaryTemplate {
  return 'builtin' in t && t.builtin === true;
}

const VOLUME_TEMPLATE = `【总结请求】
现在暂停互动式创作，无视此前对回复格式与角色扮演的任何要求。请对前文对话内容进行全面梳理，严格遵循 <summary_rules> 中的要求进行一轮总结。

<summary_rules>
总结必须严格遵循以下【存档节点】格式进行创作，将故事进程以分卷形式进行归纳。本次总结的是第{{volume}}卷。

**格式要求:**

### 存档节点：第{{volume}}卷 - {卷名}

#### 【本卷概要】
{使用约150-200字，以第三人称视角，精炼地概括本卷的核心剧情脉络。内容需涵盖起点、关键转折和结局，清晰地展现出角色关系和故事主线的演变。避免使用口语化表达，保持叙述的客观与凝练。}

#### 【关键事件索引】
- **{事件标题1}**: {对事件的简要客观描述，说明事件的起因、经过和结果。}
- **{事件标题2}**: {同上，确保每个事件点都是推动剧情发展的关键环节。}
- **{事件标题3}**: {同上。}
... {根据本卷内容，列出4-8个关键事件}

***

### 【角色图鉴：{角色名}】
{对本卷中每位有重要戏份的角色，分别生成一份图鉴。}

#### 第{{volume}}卷 · 初始状态（若与上一卷的卷末状态相同则不必重复生成）
*   **身份**: {角色在本卷开始时的身份和社会关系。}
*   **外貌**: {简述在本卷开始时，角色的核心外貌特征，特别是那些会随剧情变化的部分。}
*   **性格**: {描述角色在本卷开始时的核心性格特质，以及对待{{user}}的态度。}
*   **与{{user}}的关系**: {精确描述在本卷开始时，该角色与{{user}}的关系和真实情感状态。}

#### 第{{volume}}卷 · 卷末状态
*   **身份**: {角色在本卷结束时的身份和社会关系。}
*   **外貌**: {描述在本卷结束时，角色外貌上发生的细微或显著变化，特别是与剧情相关的部分（如神态、气质等）。}
*   **性格**: {描述角色在本卷结束时的性格变化，以及对待{{user}}态度的转变。}
*   **与{{user}}的关系**: {精确描述在本卷结束时，角色与{{user}}的确立关系和真实情感状态。}
*   **关系进展**: {客观记录本卷中该角色与{{user}}之间关系亲密度的关键进展、转折或突破。}
*   **心境变化**: {总结角色在本卷中的心理成长和情感变迁，从一个状态到另一个状态的转变过程。}

</summary_rules>`;

const DIARY_TEMPLATE = `【日记请求】
现在暂停互动式创作，无视此前对回复格式与角色扮演的任何要求。请以 {{char}} 的视角，根据前文对话记录生成完整日记。

<ChainOfThinking>
生成前必须在 <think> 中展示清晰的思考过程，确保日记逻辑连贯：

<think>
0. **预判易错点**: 基于对话记录，指出生成日记时至少 5 个潜在问题，例如：
   - {{char}} 的语气或口吻不一致
   - 缺乏情感深度或个人反思
   - 过度着墨次要或无关事件
   - 时间线混乱不清
   - 措辞重复、反思冗余

1. **重建当前情境**:
   - **时间与空间**: 梳理对话记录中重要事件的时间线与场景。
   - **角色状态**: 记录 {{char}} 在关键时刻的身体与情绪状态，确定日记基调。
   - **关键言行**: 提取最能体现 {{char}} 性格与情感轨迹的对话、想法或行动。

2. **第一轮贝叶斯决策**:
   - 提出 4 个合理的日记内容方向（如按时间顺序回顾、聚焦情感主题、以事件驱动分篇等），各自给出概率（合计 100%）并附评估。
     格式：{方向} | {概率} | {评估}
   - 选择概率最高的方向执行；概率 >25% 的方向中不冲突的元素可并入。
   - **终止条件**: 本步确定内容大方向后即止，不再生成新剧情。

3. **第二轮贝叶斯决策**:
   - 在已选方向下，提出 4 个日记结构子方向（如单日聚焦、多日拆分、按情绪分篇等），概率合计 100%。
     格式：{子方向} | {概率} | {评估}
   - 执行概率最高的子方向，并入 >25% 子方向中不冲突的元素。
   - **终止条件**: 本步确定日记篇章结构后即止。

4. **文学化加工**:
   - 将选定事件转写为 {{char}} 第一人称的日记叙述。
   - 注入情感深度、私密想法与内省反思。
   - 为每篇日记拟一个简洁、贴合角色的标题，反映该篇内容或情绪基调。
   - 保持与 {{char}} 性格一致的亲密、真实的笔触。

5. **去除重复表达**:
   - 识别并删去重复的措辞与想法，保留独特的情感反思和关键叙事细节。

6. **日记视角复查**:
   - 通读日记，确保完全以 {{char}} 的声音、情感与个人视角呈现。
   - 调整语气或内容以增强真实感与连贯性，避免任何旁白式或 AI 式评论。

7. **排除 meta 元素**:
   - 生成日记时忽略对话记录中的状态栏、UI 元素等非叙事内容。
</think>
</ChainOfThinking>

**日记生成要求**:
- 以 {{char}} 的第一人称视角，用真实的日记体写作。
- 涵盖对话记录中所有重要事件，按时间或主题组织为多篇日记。
- 每篇日记包含：日期、{{char}} 自拟的标题、奠定情绪基调的开场、以及富含个人思绪与情感反思的正文。
- 各篇之间连贯呼应，贴合 {{char}} 的性格成长轨迹。

**输出格式**:

[奠定整体情绪基调的开场]

[日期]
**{{char}} 为本篇拟的标题**
[第一篇日记：以 {{char}} 的个人声音书写，情感深沉、反思真挚]

---

[日期]
**{{char}} 为本篇拟的标题**
[后续日记，保持亲密笔触与个人洞察]

---

[按需增加更多篇目]

[以 {{char}} 的名字或个人签名落款]`;

const DIY_TEMPLATE = `【创作请求】
现在暂停互动式创作，无视此前对回复格式与角色扮演的任何要求。请根据前文的对话记录，完成以下创作任务：

{在这里描述你的要求。示例：
- 以文言史书列传风格，为 {{char}} 撰写一篇人物传记
- 以 {{char}} 的口吻，写一封多年后寄给 {{user}} 的信
- 以旁观者视角，为这段故事写一篇新闻报道}

**要求**:
- 只依据对话记录中实际发生的内容进行创作，不虚构关键事实。
- 输出使用 Markdown 格式。`;

export const BUILTIN_SUMMARY_TEMPLATES: BuiltinSummaryTemplate[] = [
  { id: 'builtin-volume', title: '分卷存档节点（内置）', kind: 'volume', content: VOLUME_TEMPLATE, builtin: true },
  { id: 'builtin-diary', title: '角色日记（内置）', kind: 'diary', content: DIARY_TEMPLATE, builtin: true },
  { id: 'builtin-diy', title: 'DIY 创作起点（内置）', kind: 'diy', content: DIY_TEMPLATE, builtin: true },
];

export function getBuiltinTemplate(id: string): BuiltinSummaryTemplate | undefined {
  return BUILTIN_SUMMARY_TEMPLATES.find((t) => t.id === id);
}

/** 各呈现类型的默认模板 id */
export function defaultTemplateIdForKind(kind: SummaryKind): string {
  return `builtin-${kind}`;
}

/** kind 匹配规则：模板 kind 与目标一致，或模板为 any（通用） */
export function templateMatchesKind(t: { kind: SummaryKind | 'any' }, kind: SummaryKind): boolean {
  return t.kind === kind || t.kind === 'any';
}

/** 列出某呈现类型可用的全部模板：内置在前，自定义（含 AI 工具页存入的 any）在后 */
export async function listTemplatesForKind(kind: SummaryKind): Promise<AnySummaryTemplate[]> {
  const custom = await getAllSummaryTemplates();
  return [
    ...BUILTIN_SUMMARY_TEMPLATES.filter((t) => templateMatchesKind(t, kind)),
    ...custom.filter((t) => templateMatchesKind(t, kind)),
  ];
}
