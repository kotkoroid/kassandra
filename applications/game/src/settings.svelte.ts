// User-facing preferences. $state proxy means a toggle in the
// settings dialog re-renders every character nameplate without
// any prop plumbing.

export const settings = $state({
  // When false, the "Level X | Name" row above every character is
  // hidden — hp bars remain visible.
  showNames: true,
  // Auto-attack mode: when true the player keeps slashing the
  // selected hostile until either dies. When false they swing once
  // and stop, requiring another click to attack again.
  autoAttack: true,
});
