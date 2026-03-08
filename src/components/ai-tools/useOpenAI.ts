import type { APIConfig } from './APIConfigCard';

export async function callOpenAI(
  config: APIConfig,
  prompt: string,
  systemPrompt: string,
  onChunk?: (text: string) => void
): Promise<string> {
  if (!config.apiKey) {
    throw new Error('请先配置 API Key');
  }

  const body: any = {
    model: config.model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: prompt },
    ],
    temperature: 0.7,
  };

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

    while (true) {
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
        if (jsonStr === '[DONE]') break;

        try {
          const parsed = JSON.parse(jsonStr);
          const content = parsed.choices?.[0]?.delta?.content;
          if (content) {
            fullText += content;
            onChunk(content);
          }
        } catch {
          // partial JSON, put back
          buffer = line + '\n' + buffer;
          break;
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
  return data.choices[0]?.message?.content || '';
}

/** Fetch available models from the API */
export async function fetchModels(baseUrl: string, apiKey: string): Promise<string[]> {
  // Derive models endpoint from chat completions URL
  const modelsUrl = baseUrl.replace(/\/chat\/completions\/?$/, '/models').replace(/\/v1\/models$/, '/v1/models');
  const finalUrl = modelsUrl.endsWith('/models') ? modelsUrl : baseUrl.replace(/\/chat\/completions\/?$/, '') + '/../models'.replace('/../', '/').replace(/\/v1\/\.\.\//, '/');
  
  // Simple approach: replace /v1/chat/completions with /v1/models
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
    return data.data.map((m: any) => m.id).sort();
  }
  throw new Error('无法解析模型列表');
}
