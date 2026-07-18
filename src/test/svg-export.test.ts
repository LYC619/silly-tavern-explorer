import { describe, it, expect } from 'vitest';
import { svgToString } from '@/lib/svg-export';

describe('svgToString（导图导出的序列化前提）', () => {
  it('补 xmlns 与内联字体，保留内容', () => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg') as SVGSVGElement;
    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('fill', '#fff');
    svg.appendChild(rect);
    const out = svgToString(svg);
    expect(out).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(out).toContain('font-family');
    expect(out).toContain('<rect');
    expect(out).toContain('#fff');
  });
});
