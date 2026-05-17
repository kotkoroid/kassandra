<script lang="ts">
  let fps = $state(0);
  let frames = 0;
  let last = performance.now();

  function tick() {
    frames += 1;
    const now = performance.now();
    const elapsed = now - last;
    if (elapsed >= 500) {
      fps = Math.round((frames * 1000) / elapsed);
      frames = 0;
      last = now;
    }
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
</script>

<div class="hud">
  <span class="title">Kassandra</span>
  <span class="fps">{fps} fps</span>
</div>

<style>
  .hud {
    position: absolute;
    top: 1rem;
    left: 1rem;
    display: flex;
    gap: 1rem;
    align-items: baseline;
    pointer-events: none;
    font-size: 0.875rem;
    color: rgba(255, 255, 255, 0.85);
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.6);
  }

  .title {
    font-weight: 600;
    letter-spacing: 0.05em;
    text-transform: uppercase;
  }

  .fps {
    opacity: 0.7;
  }
</style>
