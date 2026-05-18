// UI-only "which loot bag is being inspected" state. Distinct from
// world.lootBags (the actual data) so opening/closing the inspect
// panel doesn't mutate the sim.

export const lootBagOpen = $state<{ value: string | null }>({
  value: null,
});
