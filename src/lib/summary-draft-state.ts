import type { SummaryItem } from '@/types/summary';

interface SummaryDraftState {
  record: SummaryItem | null;
  title: string;
  content: string;
  streaming: boolean;
}

export function hasUnsavedSummaryDraft(state: SummaryDraftState): boolean {
  if (state.streaming) return true;
  if (!state.record) return state.title.trim().length > 0 || state.content.trim().length > 0;
  return state.title !== state.record.title || state.content !== state.record.content;
}
