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
