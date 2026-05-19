// Which entity the cursor is currently over. Pure UI — no sim impact.
// Components set this on pointerenter/leave; Scene.svelte reads it to
// draw the hover ring.
export const hover = $state<{ entityId: string | null }>({ entityId: null });
