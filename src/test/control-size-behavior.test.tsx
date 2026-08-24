import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const render = (node: React.ReactNode) => act(() => root.render(node));

describe('Input 尺寸档', () => {
  it('默认渲染 md（32px）', () => {
    render(<Input aria-label="默认" />);
    expect(container.querySelector('input')!.className).toContain('h-8');
  });

  it.each([
    ['sm', 'h-7'],
    ['md', 'h-8'],
    ['lg', 'h-9'],
  ] as const)('size=%s 渲染 %s', (size, height) => {
    render(<Input size={size} aria-label={size} />);
    expect(container.querySelector('input')!.className).toContain(height);
  });

  /** size 被挪去表达高度档，不能再作为原生 size 属性落到 DOM 上。 */
  it('size 不落到 DOM 的原生 size 属性上', () => {
    render(<Input size="lg" aria-label="档位" />);
    expect(container.querySelector('input')!.hasAttribute('size')).toBe(false);
  });

  it('行内 className 仍然压得过档位默认值', () => {
    render(<Input size="md" className="px-1" aria-label="覆盖" />);
    const className = container.querySelector('input')!.className;
    expect(className).toContain('px-1');
    expect(className).not.toContain('px-3');
  });
});

describe('按钮高度', () => {
  it('带文字按钮是 32px', () => {
    render(<Button>导出</Button>);
    expect(container.querySelector('button')!.className).toContain('h-8');
  });

  it('紧凑的带文字按钮也是 32px，只是内边距更窄', () => {
    render(<Button size="sm">导出</Button>);
    const className = container.querySelector('button')!.className;
    expect(className).toContain('h-8');
    expect(className).toContain('px-2.5');
  });

  it('纯图标按钮是 28px 的正方形', () => {
    render(<Button size="icon" aria-label="关闭" />);
    const className = container.querySelector('button')!.className;
    expect(className).toContain('h-7');
    expect(className).toContain('w-7');
  });

  /** 28px 低于 32px 的最小点击区，靠 tap-target 的伪元素把热区补回去。 */
  it('纯图标按钮带着 tap-target 兜底热区', () => {
    render(<Button size="icon" aria-label="关闭" />);
    expect(container.querySelector('button')!.className).toContain('tap-target');
  });

  it('同一行的默认输入框与带文字按钮等高', () => {
    render(
      <div>
        <Input aria-label="同行输入框" />
        <Button>同行按钮</Button>
      </div>,
    );
    const inputHeight = container.querySelector('input')!.className.match(/h-\d+/)![0];
    const buttonHeight = container.querySelector('button')!.className.match(/h-\d+/)![0];
    expect(inputHeight).toBe(buttonHeight);
  });

  it('紧凑输入框与纯图标按钮等高', () => {
    render(
      <div>
        <Input size="sm" aria-label="紧凑输入框" />
        <Button size="icon" aria-label="紧凑按钮" />
      </div>,
    );
    const inputHeight = container.querySelector('input')!.className.match(/h-\d+/)![0];
    const buttonHeight = container.querySelector('button')!.className.match(/h-\d+/)![0];
    expect(inputHeight).toBe(buttonHeight);
  });
});
