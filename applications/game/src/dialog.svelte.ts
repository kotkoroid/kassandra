// UI-only NPC dialog state. NPCs call `openDialog({ speaker, body })`
// from their click handler; the renderer mounts in Hud.svelte and
// shows the modal whenever `dialog.open` is true.

export interface DialogContent {
  speaker: string;
  body: string;
}

export const dialog = $state<{
  open: boolean;
  content: DialogContent | null;
}>({
  open: false,
  content: null,
});

export function openDialog(content: DialogContent) {
  dialog.content = content;
  dialog.open = true;
}

export function closeDialog() {
  dialog.open = false;
  // Keep content around so the panel can fade out cleanly if needed
  // later; the open guard alone is enough to hide it today.
}

// Canonical greeting Azir gives the first time the player clicks
// him. Kept as a module constant so other entry points (tutorial
// systems, quest scripts) can reference the exact wording.
export const AZIR_GREETING: DialogContent = {
  speaker: 'City Guardian',
  body:
    "You must be new in town! I see they haven't made you a soldier yet. " +
    'Did you receive any training at all? Look at yourself! Do you have ' +
    'any idea how to use a weapon? Listen up! You have to be careful if ' +
    "you want to survive this war. I'm going to assist you until you " +
    "have gained enough experience or reach level 10. I'm a busy person " +
    'so do not waste my time! Move!',
};
