export const NOTE_COLORS = ["yellow", "pink", "green", "blue", "purple", "orange"] as const;
export type NoteColor = (typeof NOTE_COLORS)[number];

export type Note = {
  id: string;
  title: string;
  body: string;
  color: NoteColor;
  pinned: boolean;
  created_at: string;
  updated_at: string;
};

/** Paper colours: the same in light and dark mode (it's paper). */
export const PAPER: Record<NoteColor, { paper: string; edge: string; label: string }> = {
  yellow: { paper: "#fff3a3", edge: "#f3dc5c", label: "Yellow" },
  pink: { paper: "#ffd3df", edge: "#f4a3b8", label: "Pink" },
  green: { paper: "#ccf2c8", edge: "#93d68d", label: "Green" },
  blue: { paper: "#d2e9ff", edge: "#94c6f5", label: "Blue" },
  purple: { paper: "#e6dbff", edge: "#bda6f5", label: "Purple" },
  orange: { paper: "#ffdcb0", edge: "#f4b26a", label: "Orange" },
};
