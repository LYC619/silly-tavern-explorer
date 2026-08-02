/**
 * 角色卡文件导出（10.2 从 Library 抽出，10.3a 角色页操作抽屉复用）。
 * 有 PNG 存原字节（无损原件），JSON 卡导出卡数据。
 */
import type { ArchiveCharacter } from '@/types/archive';
import { exportCardJson } from '@/lib/card-export';

export function downloadCharacterFile(c: ArchiveCharacter) {
  let blob: Blob;
  let filename: string;
  if (c.pngBase64) {
    const bytes = Uint8Array.from(atob(c.pngBase64), (ch) => ch.charCodeAt(0));
    blob = new Blob([bytes], { type: 'image/png' });
    filename = `${c.name}.png`;
  } else {
    blob = new Blob([exportCardJson(c.card)], { type: 'application/json' });
    filename = `${c.name}.json`;
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
