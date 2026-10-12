/**
 * The colour of each phase. It means one thing everywhere it appears: blue
 * while the user lives as normal, red while they run the change. It marks the
 * phase and nothing else, never a result or a selection.
 */
export const PHASE_COLOR = { baseline: "var(--s2)", intervention: "var(--s1)" } as const;
