/**
 * 关联文件的只读预览（0830 反馈条目 6），嵌在关联资产抽屉里。
 *
 * 分档见 lib/attachment-store：
 * - image：读字节转 data: URL 显示；
 * - json / text：显示源码（json 顺手格式化）。**html 落在 text 档**——只看源码，
 *   不套 iframe 渲染：这些文件多半是从别处下载来的，一旦渲染就等于在客户端里
 *   执行陌生页面的脚本。要看效果就走「用外部程序打开」，由浏览器承担这件事。
 * - external：不读字节，只给说明和体积，交给系统默认程序。
 *
 * 与「其他资产」的 OtherAssetPreview 是两套：那个自带页头页脚和路径行，
 * 这里的页头已经由抽屉出了，塞进去会有两层标题。共用的是分档判断和字节格式化。
 */
import { useEffect, useState, type ReactNode } from 'react';
import { AlertTriangle, File, FileVideo, Loader2 } from 'lucide-react';
import type { AttachmentView } from '@/lib/attachment-store';
import { isMediaAttachment } from '@/lib/attachment-store';
import { getActiveVault } from '@/lib/vault/active';
import { formatArchiveBytes, imageMimeType } from '@/lib/vault/other-assets';
import { LOADING_LABEL } from '@/lib/ui-copy';
import { cn } from '@/lib/utils';

interface Loaded {
  text?: string;
  imageUrl?: string;
  jsonInvalid?: boolean;
}

export function AttachmentPreview({ file }: { file: AttachmentView }) {
  const [content, setContent] = useState<Loaded>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (file.missing || file.tier === 'external') return;
    const fs = getActiveVault()?.fs;
    if (!fs) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setContent({});

    void (async () => {
      try {
        if (file.tier === 'image') {
          const base64 = await fs.readBinary(file.path);
          if (!cancelled) setContent({ imageUrl: `data:${imageMimeType(file.path)};base64,${base64}` });
          return;
        }
        const raw = await fs.readText(file.path);
        if (cancelled) return;
        if (file.tier === 'json') {
          try {
            setContent({ text: JSON.stringify(JSON.parse(raw) as unknown, null, 2) });
          } catch {
            setContent({ text: raw, jsonInvalid: true });
          }
        } else {
          setContent({ text: raw });
        }
      } catch (reason) {
        if (!cancelled) setError(reason instanceof Error ? reason.message : String(reason));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [file]);

  if (file.missing) {
    return (
      <Notice tone="warn" icon={AlertTriangle} title="文件不在库里了">
        记录还留着。文件可能被挪走或改名了，放回 <span className="font-mono break-all">{file.path}</span> 就会恢复；
        也可以直接移除这条记录。
      </Notice>
    );
  }

  if (file.tier === 'external') {
    const media = isMediaAttachment(file.path);
    return (
      <div className="flex min-h-48 flex-col items-center justify-center gap-3 rounded-lg border border-border bg-card px-4 py-8 text-center">
        {media ? <FileVideo className="h-9 w-9 text-muted-foreground opacity-60" /> : <File className="h-9 w-9 text-muted-foreground opacity-60" />}
        <div>
          <p className="text-sm">{media ? '音视频交给系统播放器' : '这个格式不在客户端内预览'}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            文件已在库里（{formatArchiveBytes(file.actualSize)}），用下面的「用外部程序打开」交给系统默认程序。
          </p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex min-h-40 items-center justify-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />{LOADING_LABEL}
      </div>
    );
  }

  if (error) {
    return <Notice tone="danger" icon={AlertTriangle} title="读不出这个文件">{error}</Notice>;
  }

  if (content.imageUrl) {
    return (
      <div className="flex items-center justify-center rounded-lg border border-border bg-card p-2">
        <img src={content.imageUrl} alt={file.title} className="max-h-[60vh] max-w-full object-contain" />
      </div>
    );
  }

  if (content.text !== undefined) {
    return (
      <div className="space-y-2">
        {content.jsonInvalid && (
          <Notice tone="warn" icon={AlertTriangle} title="JSON 格式异常">以下按原始文本显示。</Notice>
        )}
        {/* html 也走这里：看的是源码，不渲染（见文件头注释） */}
        <pre className="whitespace-pre-wrap break-words rounded-lg border border-border bg-card p-3 font-mono text-[11px] leading-relaxed text-muted-foreground">
          {content.text}
        </pre>
      </div>
    );
  }

  // 客户端之外（网页版/未激活库）读不到字节，effect 直接没跑；说明清楚而不是空白
  return (
    <Notice tone="warn" icon={AlertTriangle} title="这里读不到文件">
      关联文件存在客户端文件库里，网页版打不开。
    </Notice>
  );
}

/** 抽屉里的一条提示条（警告/错误两种色，配色走 status 变量） */
function Notice({ tone, icon: Icon, title, children }: {
  tone: 'warn' | 'danger';
  icon: typeof AlertTriangle;
  title: string;
  children: ReactNode;
}) {
  return (
    <div
      role={tone === 'danger' ? 'alert' : undefined}
      className={cn(
        'flex items-start gap-2 rounded-lg px-3 py-2.5 text-xs',
        tone === 'danger'
          ? 'bg-[var(--status-danger-bg)] text-[color:var(--status-danger)]'
          : 'bg-[var(--status-warn-bg)] text-[color:var(--status-warn)]',
      )}
    >
      <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <span>
        <span className="font-medium">{title}</span>
        <span className="mt-0.5 block leading-relaxed opacity-90">{children}</span>
      </span>
    </div>
  );
}
