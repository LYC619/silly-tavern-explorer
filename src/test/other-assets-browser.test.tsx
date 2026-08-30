import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { OtherAssetsBrowser } from '@/components/assets/OtherAssetsBrowser';
import { createMemFs } from '@/lib/vault/fs';
import { createVault } from '@/lib/vault/vault-backend';
import { setActiveVault } from '@/lib/vault/active';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

async function flushUi() {
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
}

async function prepareVault() {
  const fs = createMemFs();
  await fs.writeText('资产/其他/SillyTavern/extensions/demo/manifest.json', JSON.stringify({
    display_name: '演示扩展', version: '2.0.0', author: '测试者', description: '扩展简介',
  }));
  await fs.writeText('资产/其他/SillyTavern/extensions/demo/index.js', 'window.neverExecute = true;');
  await fs.writeText('资产/其他/SillyTavern/quick-replies/日常.json', JSON.stringify({
    name: '日常系统', qrList: [{ id: 1, label: '开始', message: '/start' }],
  }));
  await fs.writeText('资产/其他/SillyTavern/personas/personas.json', JSON.stringify({
    personas: { 'user.png': '林劫' },
    personaDescriptions: { 'user.png': { description: '旅行者', lorebook: '旅途设定' } },
  }));
  await fs.writeBinary('资产/其他/SillyTavern/personas/avatars/user.png', 'aGk=');
  await fs.writeBinary('资产/其他/SillyTavern/backgrounds/room.jpg', 'aGk=');
  await fs.writeText('资产/其他/SillyTavern/appearance/themes/cream.json', '{"theme":"cream"}');
  await fs.writeBinary('资产/其他/SillyTavern/user-media/images/upload.png', 'aGk=');
  setActiveVault(createVault(fs));
}

async function renderBrowser(entry = '/assets') {
  await act(async () => {
    root.render(<MemoryRouter initialEntries={[entry]}><OtherAssetsBrowser /></MemoryRouter>);
    await flushUi();
  });
}

function button(label: string): HTMLButtonElement {
  const found = [...container.querySelectorAll('button')]
    .find((item) => item.textContent?.includes(label));
  if (!found) throw new Error(`button not found: ${label}`);
  return found;
}

async function click(label: string) {
  await act(async () => {
    button(label).click();
    await flushUi();
  });
}

beforeEach(async () => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await prepareVault();
});

afterEach(() => {
  act(() => root.unmount());
  setActiveVault(null);
  container.remove();
});

describe('附属库其他资产浏览器', () => {
  it('概览展示六类真实归档，不再重复世界书、预设和正则入口', async () => {
    await renderBrowser();

    for (const label of ['扩展', '快速回复', '用户人设', '背景', '主题与布局', '用户媒体']) {
      expect(container.textContent).toContain(label);
    }
    expect(container.textContent).not.toContain('选择一个资产库开始处理');
    expect(container.querySelector('[data-other-assets-overview]')).toBeInTheDocument();
  });

  it('自己不再渲染页头和分类侧栏，这两样归附属库页面统一出', async () => {
    await renderBrowser();

    // 0830 反馈条目 12：这里以前自带页头 + w-44 侧栏，和页面那套筛选栏凑成两条竖导航。
    expect(container.querySelector('aside')).toBeNull();
    expect(container.textContent).not.toContain('已归档的 SillyTavern 其他资产');
    expect(container.textContent).not.toContain('安全只读');
  });

  it('快速回复直接列出选项与正文，而不是复刻 ST 设置表单', async () => {
    await renderBrowser('/assets?section=quick-replies');

    expect(container.textContent).toContain('日常系统');
    expect(container.textContent).toContain('开始');
    expect(container.textContent).toContain('/start');
    expect(container.querySelector('[data-quick-reply-message]')?.textContent).toBe('/start');
  });

  it('用户人设展示语义字段与头像', async () => {
    await renderBrowser('/assets?section=personas');
    expect(container.textContent).toContain('林劫');
    expect(container.textContent).toContain('旅行者');
    expect(container.textContent).toContain('旅途设定');
    expect(container.querySelector('img[alt="林劫"]')).toBeInTheDocument();
  });

  it('扩展展示清单字段及来源路径', async () => {
    // 原来这条接在人设后面靠点侧栏「扩展」切过去；侧栏归页面管了，这里直接按 section 进。
    await renderBrowser('/assets?section=extensions');
    expect(container.textContent).toContain('演示扩展');
    expect(container.textContent).toContain('2.0.0');
    expect(container.textContent).toContain('测试者');
    expect(container.textContent).toContain('扩展简介');
  });

  it('概览点分类卡写 `?section=`，页面侧栏和正文都跟着走', async () => {
    await renderBrowser();
    await click('快速回复');

    expect(container.textContent).toContain('日常系统');
  });

  it('主题目录可以逐级打开并以只读文本预览 JSON', async () => {
    await renderBrowser('/assets?section=appearance');
    await click('themes');
    await click('cream.json');

    expect(container.textContent).toContain('只读预览');
    expect(container.textContent).toContain('"theme": "cream"');
    expect(container.querySelector('iframe')).not.toBeInTheDocument();
  });

  it('没有活动文件库时显示可恢复说明', async () => {
    setActiveVault(null);
    await renderBrowser();

    expect(container.textContent).toContain('其他资产只在客户端文件库中显示');
  });
});
