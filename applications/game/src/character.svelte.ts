// UI-only open/close state for the Character dialog. The data the
// dialog renders all lives on world.player.

export const characterOpen = $state<{ value: boolean }>({ value: false });
