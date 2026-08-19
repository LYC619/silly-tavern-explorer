import { useCallback, useReducer, type Dispatch, type SetStateAction } from 'react';
import type { WorldBook } from '@/types/worldbook';

interface WorldBookDraftState {
  worldbook: WorldBook | null;
  baseline: WorldBook | null;
}

type WorldBookDraftAction =
  | { type: 'edit'; update: SetStateAction<WorldBook | null> }
  | { type: 'hydrate'; worldbook: WorldBook | null }
  | { type: 'mark-clean'; worldbook: WorldBook | null };

function reduceWorldBookDraft(
  state: WorldBookDraftState,
  action: WorldBookDraftAction,
): WorldBookDraftState {
  if (action.type === 'hydrate') {
    return {
      worldbook: action.worldbook,
      baseline: action.worldbook,
    };
  }

  if (action.type === 'mark-clean') {
    return state.baseline === action.worldbook
      ? state
      : { ...state, baseline: action.worldbook };
  }

  const worldbook = typeof action.update === 'function'
    ? action.update(state.worldbook)
    : action.update;
  return worldbook === state.worldbook ? state : { ...state, worldbook };
}

export function useWorldBookDraftState(initialWorldbook: WorldBook | null) {
  const [state, dispatch] = useReducer(reduceWorldBookDraft, {
    worldbook: initialWorldbook,
    baseline: initialWorldbook,
  });

  const setWorldbook = useCallback<Dispatch<SetStateAction<WorldBook | null>>>((update) => {
    dispatch({ type: 'edit', update });
  }, []);

  const hydrateWorldbook = useCallback((worldbook: WorldBook | null) => {
    dispatch({ type: 'hydrate', worldbook });
  }, []);

  const markWorldbookClean = useCallback((worldbook: WorldBook | null) => {
    dispatch({ type: 'mark-clean', worldbook });
  }, []);

  return {
    worldbook: state.worldbook,
    setWorldbook,
    hydrateWorldbook,
    markWorldbookClean,
    isDirty: state.worldbook !== state.baseline,
  };
}
