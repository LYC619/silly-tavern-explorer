/**
 * 网页版批量下载降级（阶段 D5）。
 *
 * 原来是给每张卡排一个 `setTimeout(…, index * 200)`：1000 张就是 1000 个定时器、
 * 最后一张要等 200 秒，而浏览器在连续下载十来个之后就会开始拦截——
 * 用户看到的是「已请求下载 1000 张」的提示和实际只落地的一小半文件。
 *
 * 客户端走 exportCharactersToDirectory 选一个目录一次写完，不受这些限制；
 * 这里只管网页版：一次下载数量封顶（超出由调用方确认），串行发起，逐张记结果，
 * 最后据实报告成功与失败张数，不再报一个乐观的总数。
 */
import type { ArchiveCharacter } from '@/types/archive';
import { downloadCharacterFile } from '@/lib/character-file';
import { displayCharacterName } from '@/lib/library-query';

/**
 * 网页版单批上限。取 20 是个折中：足够一次导出一小组，
 * 又不至于让浏览器的「是否允许多个下载」拦截演变成静默丢文件。
 * ponytail: 上限是经验值不是浏览器规范；真要一次导出整库应该用客户端。
 */
export const WEB_BATCH_DOWNLOAD_LIMIT = 20;

export interface WebDownloadResult {
  downloaded: string[];
  failed: { name: string; error: string }[];
}

export interface WebDownloadOptions {
  /** 注入下载实现（测试用）；默认走真实的 a[download] 点击 */
  download?: (character: ArchiveCharacter) => void;
  /** 两次下载之间的间隔，避免被判成滥用；测试传 0 */
  gapMs?: number;
}

/** 串行发起下载，单张失败不影响后面的；返回据实的成功/失败清单 */
export async function downloadCharactersInBatch(
  targets: ArchiveCharacter[],
  options: WebDownloadOptions = {},
): Promise<WebDownloadResult> {
  const download = options.download ?? downloadCharacterFile;
  const gapMs = options.gapMs ?? 150;
  const result: WebDownloadResult = { downloaded: [], failed: [] };

  for (let i = 0; i < targets.length; i += 1) {
    const character = targets[i];
    const name = displayCharacterName(character);
    try {
      download(character);
      result.downloaded.push(name);
    } catch (error) {
      result.failed.push({ name, error: error instanceof Error ? error.message : String(error) });
    }
    // 最后一张后面不用再等
    if (gapMs > 0 && i < targets.length - 1) {
      await new Promise((resolve) => { setTimeout(resolve, gapMs); });
    }
  }
  return result;
}
