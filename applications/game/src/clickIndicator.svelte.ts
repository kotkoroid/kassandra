// UI-only state for the transient "you clicked here" ground marker.
// Spawned by the ground click handler in Scene.svelte and consumed
// by ClickIndicator.svelte, which renders a flat ring at the spot
// and fades it out over LIFETIME seconds.
//
// Lives outside the simulation: the indicator is a pure visual
// feedback hint and shouldn't appear in save state, replay, or
// network packets.

export const CLICK_INDICATOR_LIFETIME = 0.6;

// Initialised with spawnedAt = -Infinity so the renderer sees the
// indicator as "already expired" on world load — nothing draws
// until the first real click writes a fresh spawnedAt.
export const clickIndicator = $state({
  x: 0,
  z: 0,
  spawnedAt: -Infinity,
});

export function fireClickIndicator(x: number, z: number) {
  clickIndicator.x = x;
  clickIndicator.z = z;
  clickIndicator.spawnedAt = performance.now();
}
