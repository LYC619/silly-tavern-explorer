/**
 * 分享图一期（2.0 阶段6，定稿 5.3「美化分享图」）：总结长图。
 * 组成：故事名 + 角色封面 + 记录正文，canvas 绘制导出 PNG。
 * mdToPlainLines 是纯函数（供单测）；renderShareImage 需要浏览器 canvas。
 */

// ---------- Markdown → 排版行（轻量，与 MarkdownLite 的支持面对齐） ----------

export type ShareLineKind = 'h1' | 'h2' | 'h3' | 'text' | 'quote' | 'li' | 'hr' | 'blank';

export interface ShareLine {
  kind: ShareLineKind;
  text: string;
}

/** 去行内标记：加粗/斜体/行内代码/链接留文字 */
function stripInline(s: string): string {
  return s
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .trim();
}

export function mdToPlainLines(md: string): ShareLine[] {
  const out: ShareLine[] = [];
  for (const raw of md.split('\n')) {
    const line = raw.trimEnd();
    const trimmed = line.trim();
    if (!trimmed) {
      if (out.length > 0 && out[out.length - 1].kind !== 'blank') out.push({ kind: 'blank', text: '' });
      continue;
    }
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      out.push({ kind: 'hr', text: '' });
      continue;
    }
    const heading = trimmed.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      const level = Math.min(heading[1].length, 3) as 1 | 2 | 3;
      out.push({ kind: `h${level}` as ShareLineKind, text: stripInline(heading[2]) });
      continue;
    }
    if (/^>\s?/.test(trimmed)) {
      out.push({ kind: 'quote', text: stripInline(trimmed.replace(/^>\s?/, '')) });
      continue;
    }
    if (/^([-*+]|\d+[.、])\s+/.test(trimmed)) {
      out.push({ kind: 'li', text: stripInline(trimmed.replace(/^([-*+]|\d+[.、])\s+/, '')) });
      continue;
    }
    out.push({ kind: 'text', text: stripInline(trimmed) });
  }
  // 去尾部空行
  while (out.length > 0 && out[out.length - 1].kind === 'blank') out.pop();
  return out;
}

// ---------- Canvas 绘制 ----------

export interface ShareImageInput {
  /** 记录标题（如「第一卷 - 初遇」） */
  recordTitle: string;
  storyTitle: string;
  characterName?: string;
  /** 类型标签（分卷总结/角色日记/DIY 创作） */
  kindLabel?: string;
  /** 正文 Markdown */
  contentMd: string;
  /** 角色封面 dataURL（可空） */
  coverDataUrl?: string;
}

export interface ShareImageOptions {
  width?: number;
  /** 正文最大绘制字符数，超出截断加注（防超长总结画出万像素长图） */
  maxChars?: number;
}

const PALETTE = {
  bg: '#f7f2e9',
  card: '#fffdf8',
  border: '#e5dcc9',
  ink: '#3d3226',
  sub: '#8a7d6a',
  accent: '#b0713c',
  quoteBar: '#d8c9ac',
};

/** 按像素宽度折行（逐字测量，中英混排安全） */
function wrapLine(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  let cur = '';
  for (const ch of text) {
    const test = cur + ch;
    if (ctx.measureText(test).width > maxWidth && cur) {
      lines.push(cur);
      cur = ch === ' ' ? '' : ch;
    } else {
      cur = test;
    }
  }
  if (cur) lines.push(cur);
  return lines.length > 0 ? lines : [''];
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('封面图片加载失败'));
    img.src = src;
  });
}

const FONT_BODY = '"Noto Serif SC", "Source Han Serif SC", "SimSun", serif';
const FONT_UI = '"Noto Sans SC", "Source Han Sans SC", "Microsoft YaHei", sans-serif';

/**
 * 渲染总结长图。两遍绘制：第一遍量高度，第二遍真画。
 * 返回 canvas（调用方转 dataURL 预览 / toBlob 下载）。
 */
export async function renderShareImage(
  input: ShareImageInput,
  options: ShareImageOptions = {},
): Promise<HTMLCanvasElement> {
  const width = options.width ?? 750;
  const maxChars = options.maxChars ?? 6000;
  const pad = 48;
  const contentW = width - pad * 2;

  let md = input.contentMd;
  let truncated = false;
  if (md.length > maxChars) {
    md = md.slice(0, maxChars);
    truncated = true;
  }
  const lines = mdToPlainLines(md);

  const cover = input.coverDataUrl ? await loadImage(input.coverDataUrl).catch(() => null) : null;

  // 头部布局：封面 132×198（2:3）+ 右侧标题区；无封面则纯文字头
  const coverW = 132;
  const coverH = 198;
  const headerH = cover ? coverH + pad * 2 : 150 + pad;

  type Op = { y: number; draw: (ctx: CanvasRenderingContext2D) => void };
  const measureCanvas = document.createElement('canvas');
  const mctx = measureCanvas.getContext('2d')!;

  const styleFor = (kind: ShareLineKind): { font: string; size: number; gapBefore: number; gapAfter: number; color: string } => {
    switch (kind) {
      case 'h1': return { font: `600 26px ${FONT_UI}`, size: 26, gapBefore: 22, gapAfter: 14, color: PALETTE.ink };
      case 'h2': return { font: `600 22px ${FONT_UI}`, size: 22, gapBefore: 20, gapAfter: 12, color: PALETTE.ink };
      case 'h3': return { font: `600 19px ${FONT_UI}`, size: 19, gapBefore: 16, gapAfter: 10, color: PALETTE.ink };
      case 'quote': return { font: `16px ${FONT_BODY}`, size: 16, gapBefore: 8, gapAfter: 8, color: PALETTE.sub };
      case 'li': return { font: `17px ${FONT_BODY}`, size: 17, gapBefore: 5, gapAfter: 5, color: PALETTE.ink };
      default: return { font: `17px ${FONT_BODY}`, size: 17, gapBefore: 6, gapAfter: 6, color: PALETTE.ink };
    }
  };

  // 第一遍：计算正文总高
  let bodyH = 0;
  const wrapped: { line: ShareLine; rows: string[] }[] = [];
  for (const line of lines) {
    if (line.kind === 'blank') { bodyH += 12; wrapped.push({ line, rows: [] }); continue; }
    if (line.kind === 'hr') { bodyH += 36; wrapped.push({ line, rows: [] }); continue; }
    const st = styleFor(line.kind);
    mctx.font = st.font;
    const indent = line.kind === 'li' ? 22 : line.kind === 'quote' ? 20 : 0;
    const rows = wrapLine(mctx, line.text, contentW - indent);
    const lineH = Math.round(st.size * 1.75);
    bodyH += st.gapBefore + rows.length * lineH + st.gapAfter;
    wrapped.push({ line, rows });
  }
  if (truncated) bodyH += 48;

  const footerH = 76;
  const height = Math.ceil(headerH + 24 + bodyH + footerH);

  const canvas = document.createElement('canvas');
  const scale = 2; // 高清导出
  canvas.width = width * scale;
  canvas.height = height * scale;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(scale, scale);

  // 背景
  ctx.fillStyle = PALETTE.bg;
  ctx.fillRect(0, 0, width, height);
  // 内容卡底（留边）
  ctx.fillStyle = PALETTE.card;
  ctx.strokeStyle = PALETTE.border;
  ctx.lineWidth = 1;
  const inset = 16;
  ctx.beginPath();
  ctx.roundRect(inset, inset, width - inset * 2, height - inset * 2, 14);
  ctx.fill();
  ctx.stroke();

  // ---- 头部 ----
  let cursorY = pad;
  const headTextX = cover ? pad + coverW + 24 : pad;
  const headTextW = width - headTextX - pad;
  if (cover) {
    // 封面圆角裁切，2:3 cover 顶部焦点
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(pad, cursorY, coverW, coverH, 10);
    ctx.clip();
    const ratio = Math.max(coverW / cover.width, coverH / cover.height);
    const dw = cover.width * ratio;
    const dh = cover.height * ratio;
    ctx.drawImage(cover, pad + (coverW - dw) / 2, cursorY, dw, dh);
    ctx.restore();
    ctx.strokeStyle = PALETTE.border;
    ctx.beginPath();
    ctx.roundRect(pad, cursorY, coverW, coverH, 10);
    ctx.stroke();
  }

  let ty = cursorY + 10;
  if (input.kindLabel) {
    ctx.font = `13px ${FONT_UI}`;
    ctx.fillStyle = PALETTE.accent;
    ctx.fillText(input.kindLabel, headTextX, ty + 13);
    ty += 30;
  }
  ctx.font = `600 28px ${FONT_UI}`;
  ctx.fillStyle = PALETTE.ink;
  for (const row of wrapLine(ctx, input.recordTitle, headTextW).slice(0, 3)) {
    ctx.fillText(row, headTextX, ty + 28);
    ty += 40;
  }
  ty += 6;
  ctx.font = `15px ${FONT_UI}`;
  ctx.fillStyle = PALETTE.sub;
  const subParts = [input.storyTitle, input.characterName].filter(Boolean);
  for (const row of wrapLine(ctx, subParts.join(' · '), headTextW).slice(0, 2)) {
    ctx.fillText(row, headTextX, ty + 15);
    ty += 24;
  }

  cursorY = headerH;
  // 头部分隔线
  ctx.strokeStyle = PALETTE.border;
  ctx.beginPath();
  ctx.moveTo(pad, cursorY);
  ctx.lineTo(width - pad, cursorY);
  ctx.stroke();
  cursorY += 24;

  // ---- 正文 ----
  for (const { line, rows } of wrapped) {
    if (line.kind === 'blank') { cursorY += 12; continue; }
    if (line.kind === 'hr') {
      ctx.fillStyle = PALETTE.sub;
      ctx.font = `14px ${FONT_UI}`;
      const mark = '❦';
      const w = ctx.measureText(mark).width;
      ctx.fillText(mark, (width - w) / 2, cursorY + 22);
      cursorY += 36;
      continue;
    }
    const st = styleFor(line.kind);
    const lineH = Math.round(st.size * 1.75);
    cursorY += st.gapBefore;
    ctx.font = st.font;
    ctx.fillStyle = st.color;
    const indent = line.kind === 'li' ? 22 : line.kind === 'quote' ? 20 : 0;
    if (line.kind === 'quote' && rows.length > 0) {
      ctx.fillStyle = PALETTE.quoteBar;
      ctx.fillRect(pad, cursorY + 4, 3, rows.length * lineH - 8);
      ctx.fillStyle = st.color;
    }
    rows.forEach((row, i) => {
      if (line.kind === 'li' && i === 0) {
        ctx.fillText('·', pad + 6, cursorY + st.size + (lineH - st.size) / 2 + i * lineH - 2);
      }
      ctx.fillText(row, pad + indent, cursorY + st.size + (lineH - st.size) / 2 + i * lineH - 2);
    });
    cursorY += rows.length * lineH + st.gapAfter;
  }
  if (truncated) {
    ctx.font = `14px ${FONT_UI}`;
    ctx.fillStyle = PALETTE.sub;
    ctx.fillText('……（正文过长已截断，完整内容见 STE 归档）', pad, cursorY + 24);
    cursorY += 48;
  }

  // ---- 页脚 ----
  const fy = height - footerH + 16;
  ctx.strokeStyle = PALETTE.border;
  ctx.beginPath();
  ctx.moveTo(pad, fy);
  ctx.lineTo(width - pad, fy);
  ctx.stroke();
  ctx.font = `13px ${FONT_UI}`;
  ctx.fillStyle = PALETTE.sub;
  ctx.fillText('SillyTavern Explorer · 故事归档分享', pad, fy + 28);
  const dateStr = new Date().toLocaleDateString('zh-CN');
  const dw = ctx.measureText(dateStr).width;
  ctx.fillText(dateStr, width - pad - dw, fy + 28);

  return canvas;
}

/** 触发 PNG 下载 */
export function downloadCanvasPng(canvas: HTMLCanvasElement, filename: string): void {
  canvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename.endsWith('.png') ? filename : `${filename}.png`;
    a.click();
    URL.revokeObjectURL(url);
  }, 'image/png');
}
