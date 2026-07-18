/**
 * SVG 序列化与图片导出（无依赖）：
 * 前提是目标 <svg> 为自包含绘制——样式全部内联 attr、无外部资源/foreignObject，
 * 这样 blob URL 加载不污染 canvas，可直接 toBlob 出 PNG。
 */

function triggerDownload(url: string, filename: string) {
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

export function svgToString(svg: SVGSVGElement): string {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  // 字体内联到根：导出后脱离页面样式仍可读（CJK 交给系统字体）
  clone.setAttribute('font-family', "'Segoe UI', 'Microsoft YaHei', 'PingFang SC', system-ui, sans-serif");
  return new XMLSerializer().serializeToString(clone);
}

export function downloadSvg(svg: SVGSVGElement, filename: string) {
  const blob = new Blob([svgToString(svg)], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  triggerDownload(url, filename);
  URL.revokeObjectURL(url);
}

export async function downloadSvgAsPng(svg: SVGSVGElement, filename: string, scale = 2): Promise<void> {
  const blob = new Blob([svgToString(svg)], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('SVG 图像加载失败'));
      img.src = url;
    });
    const w = svg.width.baseVal.value || img.naturalWidth;
    const h = svg.height.baseVal.value || img.naturalHeight;
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(w * scale));
    canvas.height = Math.max(1, Math.round(h * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('无法创建画布');
    ctx.scale(scale, scale);
    ctx.drawImage(img, 0, 0, w, h);
    const png = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('PNG 编码失败'))), 'image/png')
    );
    const pngUrl = URL.createObjectURL(png);
    triggerDownload(pngUrl, filename);
    URL.revokeObjectURL(pngUrl);
  } finally {
    URL.revokeObjectURL(url);
  }
}
