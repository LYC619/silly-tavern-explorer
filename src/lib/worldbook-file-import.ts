import { generateWorldBookId, parseWorldBook, type WorldBook, type WorldBookItem } from '@/types/worldbook';

export interface WorldBookFileLike {
  name: string;
  lastModified?: number;
  text: () => Promise<string>;
}

export interface WorldBookUpload {
  title: string;
  worldbook: WorldBook;
  sourceModifiedAt?: number;
}

/** 读取并校验一个 ST 世界书文件，供编辑器和附属库共用。 */
export async function readWorldBookUpload(file: WorldBookFileLike): Promise<WorldBookUpload> {
  const json = JSON.parse(await file.text()) as Record<string, unknown>;
  const worldbook = parseWorldBook(json);
  if (Object.keys(worldbook.entries).length === 0) throw new Error('世界书没有条目');
  const sourceModifiedAt = typeof file.lastModified === 'number' && file.lastModified > 0
    ? file.lastModified
    : undefined;
  return {
    title: file.name.replace(/\.json$/i, ''),
    worldbook,
    ...(sourceModifiedAt === undefined ? {} : { sourceModifiedAt }),
  };
}

/** 将上传内容构造成一个永久资产；导入时间只负责 STE 生命周期，不覆盖源文件时间。 */
export function worldBookItemFromUpload(upload: WorldBookUpload, now = Date.now()): WorldBookItem {
  return {
    id: generateWorldBookId(),
    title: upload.title,
    worldbook: upload.worldbook,
    createdAt: now,
    updatedAt: now,
    autoSaved: false,
    ...(upload.sourceModifiedAt === undefined ? {} : { sourceModifiedAt: upload.sourceModifiedAt }),
  };
}
