/**
 * 阅读包落盘：三档环境各走各的。
 *
 * - tauri      原生保存对话框 → 写绝对路径
 * - capacitor  写进应用缓存目录 → 唤起系统分享面板。手机上「导出」的真实语义是
 *              「发给别人 / 存到网盘」，不是「选一个路径」——见
 *              .planning/mobile-client-design/mobile-priorities.md
 * - web        浏览器下载
 */
import { isCapacitor, isTauri } from '@/lib/runtime';
import { bytesToBase64 } from '@/lib/utils';

export type SavePackOutcome = 'saved' | 'shared' | 'downloaded' | 'cancelled';

function browserDownload(bytes: Uint8Array, fileName: string): void {
  // 复制成独立 ArrayBuffer：bytes 可能是某个更大 buffer 的视图，
  // 直接塞给 Blob 会把整个 buffer 都写进去。
  const copy = new Uint8Array(bytes.length);
  copy.set(bytes);
  const url = URL.createObjectURL(new Blob([copy], { type: 'application/zip' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export async function savePackBytes(bytes: Uint8Array, fileName: string): Promise<SavePackOutcome> {
  if (isTauri()) {
    const { save } = await import('@tauri-apps/plugin-dialog');
    const path = await save({
      defaultPath: fileName,
      filters: [{ name: '阅读包', extensions: ['ste-reading'] }],
    });
    if (!path) return 'cancelled';
    const { writeAbsBytes } = await import('@/lib/vault/tauri-fs');
    await writeAbsBytes(path, bytes);
    return 'saved';
  }

  if (isCapacitor()) {
    // 先落到缓存目录再分享：Android 的分享面板要的是一个 content:// URI，
    // 拿不到内存里的字节。缓存目录会被系统回收，不用我们清。
    const { Filesystem, Directory } = await import('@capacitor/filesystem');
    const { Share } = await import('@capacitor/share');
    const { uri } = await Filesystem.writeFile({
      path: fileName,
      data: bytesToBase64(bytes),
      directory: Directory.Cache,
    });
    await Share.share({ title: fileName, url: uri, dialogTitle: '发送阅读包' });
    return 'shared';
  }

  browserDownload(bytes, fileName);
  return 'downloaded';
}
