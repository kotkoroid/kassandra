// UI-only open/close state for the player's inventory panel.
// The actual bag contents live on world.player.bag.

export const bagOpen = $state<{ value: boolean }>({ value: false });
