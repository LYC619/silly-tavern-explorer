/**
 * 立绘区（2.0 阶段7.2 遗留项，仅客户端文件库激活时渲染）。
 * 定稿第八章：图片直接丢进 角色/<名>/立绘/ 就算数——这里只读展示，不做上传管理。
 */
import { useEffect, useState } from 'react';
import { Images } from 'lucide-react';
import { getActiveVault } from '@/lib/vault/active';

const IMAGE_MIME: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
};

interface Illustration {
  name: string;
  url: string;
}

export function IllustrationSection({ characterId }: { characterId: string }) {
  const [images, setImages] = useState<Illustration[] | null>(null);

  useEffect(() => {
    const vault = getActiveVault();
    if (!vault) return; // 网页版/库未激活：整区不渲染
    let cancelled = false;
    (async () => {
      try {
        const dir = await vault.pathOf('characters', characterId);
        if (!dir) return;
        const out: Illustration[] = [];
        for (const e of await vault.fs.list(`${dir}/立绘`)) {
          const ext = e.name.split('.').pop()?.toLowerCase() ?? '';
          const mime = IMAGE_MIME[ext];
          if (e.isDir || !mime) continue;
          const b64 = await vault.fs.readBinary(`${dir}/立绘/${e.name}`);
          out.push({ name: e.name, url: `data:${mime};base64,${b64}` });
        }
        if (!cancelled) setImages(out);
      } catch {
        // 读图失败不打扰（文件夹可能不存在）
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [characterId]);

  if (!images?.length) return null;

  return (
    <div className="space-y-2">
      <h3 className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
        <Images className="h-4 w-4" />
        立绘（库文件夹 立绘/，共 {images.length} 张）
      </h3>
      <div className="flex flex-wrap gap-3">
        {images.map((img) => (
          <img
            key={img.name}
            src={img.url}
            alt={img.name}
            title={img.name}
            loading="lazy"
            className="h-40 rounded-md border object-contain"
          />
        ))}
      </div>
    </div>
  );
}
