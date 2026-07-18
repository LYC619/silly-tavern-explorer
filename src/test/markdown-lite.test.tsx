import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MarkdownLite } from '@/components/MarkdownLite';

const html = (text: string) => renderToStaticMarkup(<MarkdownLite text={text} />);

describe('MarkdownLite（轻量 MD 渲染，面向 AI 总结产出）', () => {
  it('标题 #~#### 渲染为 h1~h4', () => {
    const out = html('# 一\n## 二\n### 三\n#### 四');
    expect(out).toContain('<h1');
    expect(out).toContain('<h2');
    expect(out).toContain('<h3');
    expect(out).toContain('<h4');
  });

  it('粗体/斜体/行内代码', () => {
    const out = html('**加粗** 与 *斜体* 与 `代码`');
    expect(out).toContain('<strong');
    expect(out).toContain('<em>斜体</em>');
    expect(out).toContain('<code');
    expect(out).not.toContain('**');
  });

  it('无序(-,*)与有序(1.)列表', () => {
    const out = html('- 甲\n- 乙\n\n1. 子\n2. 丑');
    expect(out).toContain('<ul');
    expect((out.match(/<li/g) ?? []).length).toBe(4);
    expect(out).toContain('<ol');
  });

  it('*** 与 --- 是分隔线而非列表/斜体', () => {
    const out = html('上\n***\n下\n---\n尾');
    expect((out.match(/<hr/g) ?? []).length).toBe(2);
    expect(out).not.toContain('<ul');
  });

  it('引用块与普通段落', () => {
    const out = html('> 引用的话\n正文一行');
    expect(out).toContain('<blockquote');
    expect(out).toContain('<p');
  });

  it('列表项内的 **粗体**（分卷模板常见样式）', () => {
    const out = html('*   **身份**: 见习骑士');
    expect(out).toContain('<li');
    expect(out).toContain('<strong');
    expect(out).toContain('身份');
  });

  it('HTML 字符不注入（React 转义）', () => {
    const out = html('<script>alert(1)</script>');
    expect(out).not.toContain('<script>');
    expect(out).toContain('&lt;script&gt;');
  });
});
