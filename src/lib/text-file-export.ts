export type TextFileExportResult = 'saved' | 'cancelled' | 'downloaded' | 'failed';

export interface TextFileExportAdapters {
  tauri?: boolean;
  selectPath?: (suggestedName: string) => Promise<string | null>;
  writeText?: (path: string, content: string) => Promise<void>;
  download?: (name: string, content: string) => void;
}

interface TextFileExportResultHandlers {
  onComplete: () => void;
  onFailure: () => void;
}

interface TextFileExportInput {
  suggestedName: string;
  content: string;
}

function safeMarkdownName(value: string): string {
  const safe = value.trim().replace(/[/:*?"<>|]/g, '_') || '导出内容';
  return safe.toLocaleLowerCase().endsWith('.md') ? safe : `${safe}.md`;
}

/**
 * 浏览器下载：造个 <a download> 点一下。
 *
 * TODO(capacitor): Android 客户端上这条走不通——WebView 里的 <a download> 要么被
 * 无声吞掉，要么落到应用私有目录里，用户在文件管理器里找不到。等实现移动端导出时
 * 换成 @capacitor/filesystem 写 Documents + @capacitor/share 唤起分享面板
 * （手机上「导出」的真实语义是「发给别人/存到网盘」，不是「保存到某个路径」）。
 * 现在先让它落到这条：拿不到文件比崩掉好，而移动端第一优先级是读不是导。
 */
function browserDownload(name: string, content: string): void {
  const url = URL.createObjectURL(new Blob([content], { type: 'text/markdown;charset=utf-8' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

async function selectTauriPath(suggestedName: string): Promise<string | null> {
  const { save } = await import('@tauri-apps/plugin-dialog');
  return save({
    defaultPath: suggestedName,
    filters: [{ name: 'Markdown', extensions: ['md'] }],
  });
}

async function writeTauriText(path: string, content: string): Promise<void> {
  const { writeAbsText } = await import('@/lib/vault/tauri-fs');
  await writeAbsText(path, content);
}

export async function exportTextFile(
  input: TextFileExportInput,
  adapters: TextFileExportAdapters = {},
): Promise<TextFileExportResult> {
  const name = safeMarkdownName(input.suggestedName);
  const tauri = adapters.tauri ?? (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window);

  try {
    if (!tauri) {
      (adapters.download ?? browserDownload)(name, input.content);
      return 'downloaded';
    }

    const path = await (adapters.selectPath ?? selectTauriPath)(name);
    if (!path) return 'cancelled';
    await (adapters.writeText ?? writeTauriText)(path, input.content);
    return 'saved';
  } catch {
    return 'failed';
  }
}

export function routeTextFileExportResult(
  result: TextFileExportResult,
  handlers: TextFileExportResultHandlers,
): void {
  if (result === 'failed') handlers.onFailure();
  else if (result !== 'cancelled') handlers.onComplete();
}
