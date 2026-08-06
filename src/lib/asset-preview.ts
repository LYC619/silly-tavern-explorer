export interface QuotePreviewEntry {
  body: string;
}

export function buildQuotePreview(body: string): { entries: QuotePreviewEntry[]; count: number } {
  const entries = body
    .split(/\n\s*\n+/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .map((paragraph) => ({ body: paragraph }));
  return { entries, count: entries.length };
}
