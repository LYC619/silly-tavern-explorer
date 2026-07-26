/** ST 侧 AI 配置快照（阶段9.9 余项）：settings.json → 只读概况行，绝不带密钥 */
import { describe, expect, it } from 'vitest';
import { extractSTAIConfig } from '@/lib/st-ai-config';

describe('extractSTAIConfig', () => {
  it('典型 custom 来源：主后端/来源/模型/地址/参数齐全，密钥字段不出现', () => {
    const rows = extractSTAIConfig({
      main_api: 'openai',
      oai_settings: {
        chat_completion_source: 'custom',
        custom_model: 'deepseek-chat',
        openai_model: 'gpt-4o',
        custom_url: 'https://api.example.com/v1',
        reverse_proxy: '',
        openai_max_context: 65536,
        openai_max_tokens: 2048,
        temp_openai: 0.8,
        api_key_openai: '绝不能出现',
        proxy_password: '绝不能出现',
      },
    });
    const byLabel = Object.fromEntries(rows.map((r) => [r.label, r.value]));
    expect(byLabel['主后端']).toContain('Chat Completion');
    expect(byLabel['补全来源']).toBe('custom');
    expect(byLabel['模型']).toBe('deepseek-chat'); // custom 来源优先 custom_model
    expect(byLabel['自定义接口地址']).toBe('https://api.example.com/v1');
    expect(byLabel['上下文上限']).toBe('65536 tokens');
    expect(byLabel['温度']).toBe('0.8');
    expect(byLabel['反向代理']).toBeUndefined(); // 空串不出行
    expect(JSON.stringify(rows)).not.toContain('绝不能出现');
  });

  it('openai 来源回退 openai_model；未知 main_api 原样显示', () => {
    const rows = extractSTAIConfig({
      main_api: 'somefuture',
      oai_settings: { chat_completion_source: 'openai', openai_model: 'gpt-4o' },
    });
    const byLabel = Object.fromEntries(rows.map((r) => [r.label, r.value]));
    expect(byLabel['主后端']).toBe('somefuture');
    expect(byLabel['模型']).toBe('gpt-4o');
  });

  it('非对象/空对象返回空数组', () => {
    expect(extractSTAIConfig(null)).toEqual([]);
    expect(extractSTAIConfig('x')).toEqual([]);
    expect(extractSTAIConfig({})).toEqual([]);
  });
});
