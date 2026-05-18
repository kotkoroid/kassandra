// UI-only open/close state for the Social panel. No backing data
// in the sim yet — the panel is a visual scaffold for friends /
// guild / blocked lists that will land later.

export const socialOpen = $state<{ value: boolean }>({ value: false });
