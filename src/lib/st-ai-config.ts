/**
 * ST 侧 AI 配置快照（2.0 阶段9.9 余项，用户定义：「其他资产」区放的是
 * 用户在 SillyTavern 里使用的 AI 配置，而非本应用自身的 AI 配置）。
 * 从 ST 的 settings.json 只读提取连接概况——主后端/来源/模型/接口地址/采样参数。
 * 铁律：绝不读取任何密钥字段（key/password/secret 类；ST 的密钥在 secrets.json，根本不碰）。
 */

export interface STAIConfigRow {
  label: string;
  value: string;
}

const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** main_api 的人话标签（认不出的原样显示） */
const MAIN_API_LABELS: Record<string, string> = {
  openai: '聊天补全 (Chat Completion)',
  textgenerationwebui: '文本补全 (Text Completion)',
  novel: 'NovelAI',
  koboldhorde: 'AI Horde',
  kobold: 'KoboldAI',
};

/** 从 settings.json 解析出的对象提取只读概况；无法识别返回空数组 */
export function extractSTAIConfig(json: unknown): STAIConfigRow[] {
  if (!json || typeof json !== 'object') return [];
  const s = json as Record<string, unknown>;
  const rows: STAIConfigRow[] = [];

  const mainApi = str(s.main_api);
  if (mainApi) rows.push({ label: '主后端', value: MAIN_API_LABELS[mainApi] ?? mainApi });

  const oai = s.oai_settings;
  if (oai && typeof oai === 'object') {
    const o = oai as Record<string, unknown>;
    const source = str(o.chat_completion_source);
    if (source) rows.push({ label: '补全来源', value: source });
    // 模型字段按来源命名（openai_model/claude_model/custom_model…），按来源优先猜，兜底常见键
    const modelKeys = [
      source ? `${source}_model` : '',
      'custom_model', 'openai_model', 'claude_model', 'google_model', 'openrouter_model', 'deepseek_model',
    ].filter(Boolean);
    for (const k of modelKeys) {
      const m = str(o[k]);
      if (m) {
        rows.push({ label: '模型', value: m });
        break;
      }
    }
    const customUrl = str(o.custom_url);
    if (customUrl) rows.push({ label: '自定义接口地址', value: customUrl });
    const proxy = str(o.reverse_proxy);
    if (proxy) rows.push({ label: '反向代理', value: proxy });
    const maxContext = num(o.openai_max_context);
    if (maxContext !== null) rows.push({ label: '上下文上限', value: `${maxContext} tokens` });
    const maxTokens = num(o.openai_max_tokens);
    if (maxTokens !== null) rows.push({ label: '回复上限', value: `${maxTokens} tokens` });
    const temp = num(o.temp_openai);
    if (temp !== null) rows.push({ label: '温度', value: String(temp) });
  }

  return rows;
}
