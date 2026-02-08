import type { APIConfig } from './APIConfigCard';

export async function callOpenAI(
  config: APIConfig,
  prompt: string,
  systemPrompt: string
): Promise<string> {
  if (!config.apiKey) {
    throw new Error('请先配置 API Key');
  }

  const response = await fetch(config.apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt },
      ],
      temperature: 0.7,
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error?.message || 'API 请求失败');
  }

  const data = await response.json();
  return data.choices[0]?.message?.content || '';
}
