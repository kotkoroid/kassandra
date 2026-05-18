// UI-only "which loot bag is being inspected" state. Distinct from
// world.lootBags (the actual data) so opening/closing the inspect
// panel doesn't mutate the sim.
//
// `pendingArrival` is a deferred-open: when the player clicks a
// loot-bag's floating timer from far away, we don't pop the panel
// immediately — we route them to the bag and let an arrival watcher
// (see Hud.svelte) flip `value` once they're within pickup range.

export const lootBagOpen = $state<{
  value: string | null;
  pendingArrival: string | null;
}>({
  value: null,
  pendingArrival: null,
});
