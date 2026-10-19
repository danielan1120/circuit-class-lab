export interface ImageSelection {
  id: number;
  file: File;
  url: string;
  loaded: boolean;
  attempt: number;
  phase: "preview" | "recovering" | "failed";
}

export type ImageSelectionAction =
  | { type: "select"; selection: ImageSelection }
  | { type: "loaded" | "recover" | "failed"; id: number; attempt: number }
  | { type: "recovered"; id: number; attempt: number; url: string }
  | { type: "clear" };

// Image events can finish after the user closes a group or selects a new file.
// Only the selection that owns that event may change the current preview.
export function imageSelectionReducer(
  state: ImageSelection | null,
  action: ImageSelectionAction,
): ImageSelection | null {
  if (action.type === "clear") return null;
  if (action.type === "select") return action.selection;
  if (!state || state.id !== action.id || state.attempt !== action.attempt) return state;
  if (action.type === "failed") return { ...state, url: "", loaded: false, phase: "failed" };
  if (action.type === "recover") {
    if (state.phase !== "preview") return state;
    return { ...state, url: "", loaded: false, attempt: state.attempt + 1, phase: "recovering" };
  }
  if (action.type === "recovered") {
    return state.phase === "recovering" ? { ...state, url: action.url, phase: "preview" } : state;
  }
  if (state.phase !== "preview") return state;
  return state.loaded ? state : { ...state, loaded: true };
}
