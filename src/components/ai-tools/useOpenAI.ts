import type { APIConfig } from './APIConfigCard';

export interface ChatCompletionMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/** 可透传的 OpenAI 采样参数（挂预设时从 preset.originalData 读取；缺省沿用旧默认 temperature 0.7） */
export interface SamplingParams {
  temperature?: number;
  top_p?: number;
  frequency_penalty?: number;
  presence_penalty?: number;
  max_tokens?: number;
}

export interface CallOptions {
  onChunk?: (text: string) => void;
  signal?: AbortSignal;
  params?: SamplingParams;
}

/**
 * 通用 chat/completions 调用：接受完整 messages 数组，供总结引擎组装的多段上下文使用。
 * 传 onChunk 即启用流式（SSE）。旧的单 prompt 版 callOpenAI 是它的 wrapper。
 */
export async function callOpenAIMessages(
  config: APIConfig,
  messages: ChatCompletionMessage[],
  opts: CallOptions = {}
): Promise<string> {
  if (!config.apiKey) {
    throw new Error('请先配置 API Key');
  }

  const { onChunk, signal, params } = opts;

  const body: {
    model: string;
    messages: ChatCompletionMessage[];
    temperature: number;
    top_p?: number;
    frequency_penalty?: number;
    presence_penalty?: number;
    max_tokens?: number;
    stream?: boolean;
  } = {
    model: config.model,
    messages,
    temperature: params?.temperature ?? 0.7,
  };
  if (params?.top_p !== undefined) body.top_p = params.top_p;
  if (params?.frequency_penalty !== undefined) body.frequency_penalty = params.frequency_penalty;
  if (params?.presence_penalty !== undefined) body.presence_penalty = params.presence_penalty;
  if (params?.max_tokens !== undefined) body.max_tokens = params.max_tokens;

  if (onChunk) {
    body.stream = true;
  }

  const response = await fetch(config.apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify(body),
    signal,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error?.message || 'API 请求失败');
  }

  if (onChunk && response.body) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let fullText = '';
    let buffer = '';
    let streamDone = false;

    while (!streamDone) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let newlineIndex: number;
      while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
        let line = buffer.slice(0, newlineIndex);
        buffer = buffer.slice(newlineIndex + 1);

        if (line.endsWith('\r')) line = line.slice(0, -1);
        if (!line.startsWith('data: ')) continue;

        const jsonStr = line.slice(6).trim();
        if (jsonStr === '[DONE]') {
          streamDone = true;
          break;
        }

        try {
          const parsed = JSON.parse(jsonStr);
          const content = parsed.choices?.[0]?.delta?.content;
          if (content) {
            fullText += content;
            onChunk(content);
          }
        } catch {
          // Malformed JSON line — discard to avoid infinite re-parse
        }
      }
    }

    // Flush remaining buffer
    if (buffer.trim()) {
      for (let raw of buffer.split('\n')) {
        if (!raw) continue;
        if (raw.endsWith('\r')) raw = raw.slice(0, -1);
        if (!raw.startsWith('data: ')) continue;
        const jsonStr = raw.slice(6).trim();
        if (jsonStr === '[DONE]') continue;
        try {
          const parsed = JSON.parse(jsonStr);
          const content = parsed.choices?.[0]?.delta?.content;
          if (content) {
            fullText += content;
            onChunk(content);
          }
        } catch { /* ignore */ }
      }
    }

    return fullText;
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || '';
}

/**
 * 单 prompt 便捷版（system + user 两条）。历史调用点沿用此签名，内部转调 callOpenAIMessages。
 */
export async function callOpenAI(
  config: APIConfig,
  prompt: string,
  systemPrompt: string,
  onChunk?: (text: string) => void,
  signal?: AbortSignal
): Promise<string> {
  return callOpenAIMessages(
    config,
    [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: prompt },
    ],
    { onChunk, signal }
  );
}

/** Fetch available models from the API */
export async function fetchModels(baseUrl: string, apiKey: string): Promise<string[]> {
  const url = baseUrl.replace(/\/v1\/chat\/completions\/?$/, '/v1/models');

  const response = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${apiKey}`,
    },
  });

  if (!response.ok) {
    throw new Error('获取模型列表失败');
  }

  const data = await response.json();
  if (data.data && Array.isArray(data.data)) {
    return data.data.map((m: { id: string }) => m.id).sort();
  }
  throw new Error('无法解析模型列表');
}
