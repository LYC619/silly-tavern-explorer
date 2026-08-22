import { useEffect, useState } from 'react';
import { AlertTriangle, File, Loader2, ShieldCheck, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { VaultFs } from '@/lib/vault/fs';
import {
  formatArchiveBytes,
  imageMimeType,
  type ArchiveFileItem,
} from '@/lib/vault/other-assets';
import { LOADING_LABEL } from '@/lib/ui-copy';

interface OtherAssetPreviewProps {
  fs: VaultFs;
  file: ArchiveFileItem;
  onClose: () => void;
}

interface PreviewContent {
  text?: string;
  imageUrl?: string;
  jsonInvalid?: boolean;
}

export function OtherAssetPreview({ fs, file, onClose }: OtherAssetPreviewProps) {
  const [content, setContent] = useState<PreviewContent>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setContent({});

    void (async () => {
      try {
        if (file.preview === 'image') {
          const base64 = await fs.readBinary(file.path);
          if (!cancelled) setContent({ imageUrl: `data:${imageMimeType(file.name)};base64,${base64}` });
        } else if (file.preview === 'json' || file.preview === 'text') {
          const raw = await fs.readText(file.path);
          if (file.preview === 'json') {
            try {
              const formatted = JSON.stringify(JSON.parse(raw) as unknown, null, 2);
              if (!cancelled) setContent({ text: formatted });
            } catch {
              if (!cancelled) setContent({ text: raw, jsonInvalid: true });
            }
          } else if (!cancelled) {
            setContent({ text: raw });
          }
        }
      } catch (reason) {
        if (!cancelled) setError(reason instanceof Error ? reason.message : String(reason));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [file, fs]);

  return (
    <section className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-[color:var(--border-subtle)] bg-[var(--bg-elevated)]" aria-label={`${file.name} 只读预览`}>
      <header className="flex shrink-0 items-start gap-3 border-b border-[color:var(--hairline-inner)] px-4 py-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate font-serif text-sm font-semibold text-[color:var(--text-primary)]" title={file.name}>{file.name}</h3>
            <span className="shrink-0 rounded-full bg-[var(--status-ok-bg)] px-2 py-0.5 text-[10px] text-[color:var(--status-ok)]">只读预览</span>
          </div>
          <p className="mt-1 truncate text-[10px] text-[color:var(--text-muted)]" title={file.path}>{file.relativePath} · {formatArchiveBytes(file.size)}</p>
        </div>
        <Button type="button" variant="ghost" size="sm" className="h-7 w-7 shrink-0 p-0" onClick={onClose} aria-label="关闭预览">
          <X className="h-4 w-4" />
        </Button>
      </header>

      <div className="min-h-0 flex-1 overflow-auto p-4 scrollbar-thin">
        {loading ? (
          <div className="flex h-full min-h-40 items-center justify-center gap-2 text-sm text-[color:var(--text-muted)]">
            <Loader2 className="h-4 w-4 animate-spin" />{LOADING_LABEL}
          </div>
        ) : error ? (
          <div role="alert" className="flex items-start gap-2 rounded-lg bg-[var(--status-danger-bg)] p-3 text-sm text-[color:var(--status-danger)]">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>无法读取这个文件：{error}</span>
          </div>
        ) : content.imageUrl ? (
          <div className="flex min-h-48 items-center justify-center rounded-lg bg-[var(--bg-canvas)] p-2">
            <img src={content.imageUrl} alt={file.name} className="max-h-full max-w-full object-contain" />
          </div>
        ) : content.text !== undefined ? (
          <div className="space-y-2">
            {content.jsonInvalid && (
              <div className="flex items-center gap-2 rounded-md bg-[var(--status-warning-bg)] px-3 py-2 text-xs text-[color:var(--status-warning)]">
                <AlertTriangle className="h-3.5 w-3.5" />JSON 格式异常，以下按原始文本显示。
              </div>
            )}
            <pre className="whitespace-pre-wrap break-words rounded-lg bg-[var(--bg-canvas)] p-3 font-mono text-[11px] leading-relaxed text-[color:var(--text-body)]">{content.text}</pre>
          </div>
        ) : (
          <div className="flex min-h-48 flex-col items-center justify-center gap-3 text-center text-[color:var(--text-muted)]">
            <File className="h-9 w-9 opacity-50" />
            <div>
              <p className="text-sm text-[color:var(--text-body)]">这个格式暂不支持客户端内预览</p>
              <p className="mt-1 text-xs">文件仍已完整归档，可在上方核对名称、路径和大小。</p>
            </div>
          </div>
        )}
      </div>

      <footer className="flex shrink-0 items-center gap-2 border-t border-[color:var(--hairline-inner)] px-4 py-2 text-[10px] text-[color:var(--text-muted)]">
        <ShieldCheck className="h-3.5 w-3.5 text-[color:var(--status-ok)]" />
        仅从 STE 文件库读取；不会执行代码，也不会修改归档。
      </footer>
    </section>
  );
}

