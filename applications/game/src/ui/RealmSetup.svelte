<script lang="ts">
  interface Props {
    onReady: (realmId: string) => void;
  }
  const { onReady }: Props = $props();

  // If the URL already has ?realm=... skip the setup screen entirely.
  $effect(() => {
    const urlRealm = new URLSearchParams(window.location.search).get('realm');
    if (urlRealm) onReady(urlRealm);
  });

  let joinCode = $state('');
  let error = $state('');
  let creating = $state(false);

  async function createRealm() {
    creating = true;
    error = '';
    try {
      const apiBase = import.meta.env.DEV ? '/api' : import.meta.env.VITE_GATEWAY_URL;
      const res = await fetch(`${apiBase}/realms`, {
        method: 'POST',
      });
      if (!res.ok) throw new Error(`${res.status}`);
      const { id } = (await res.json()) as { id: string };
      applyRealm(id);
    } catch {
      error = 'Could not create realm. Is the server running?';
    } finally {
      creating = false;
    }
  }

  function joinRealm() {
    const id = joinCode.trim();
    if (!id) { error = 'Enter a realm ID.'; return; }
    applyRealm(id);
  }

  function applyRealm(id: string) {
    const url = new URL(window.location.href);
    url.searchParams.set('realm', id);
    window.history.replaceState(null, '', url.toString());
    onReady(id);
  }
</script>

<div class="setup">
  <h1>Kassandra</h1>

  <div class="card">
    <button onclick={createRealm} disabled={creating}>
      {creating ? 'Creating…' : 'Create Realm'}
    </button>
    <p class="divider">— or join one —</p>
    <input
      type="text"
      placeholder="Realm ID"
      bind:value={joinCode}
      onkeydown={(e) => e.key === 'Enter' && joinRealm()}
      spellcheck={false}
      autocomplete="off"
    />
    {#if error}<p class="error">{error}</p>{/if}
    <button onclick={joinRealm} disabled={!joinCode.trim()}>Join Realm</button>
  </div>
</div>

<style>
  .setup {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    background: #0a0a0f;
    color: #e8e0d0;
    font-family: serif;
    gap: 2rem;
  }

  h1 {
    font-size: 3rem;
    letter-spacing: 0.2em;
    text-transform: uppercase;
    color: #c9a84c;
    margin: 0;
  }

  .card {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.75rem;
    background: rgba(255 255 255 / 0.04);
    border: 1px solid rgba(255 255 255 / 0.1);
    padding: 2rem 2.5rem;
    min-width: 280px;
  }

  button {
    width: 100%;
    padding: 0.6rem 1.5rem;
    background: #c9a84c;
    color: #0a0a0f;
    border: none;
    font-size: 0.85rem;
    font-weight: 700;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    cursor: pointer;
  }

  button:disabled {
    opacity: 0.4;
    cursor: default;
  }

  input {
    width: 100%;
    box-sizing: border-box;
    padding: 0.5rem 0.75rem;
    background: rgba(255 255 255 / 0.07);
    border: 1px solid rgba(255 255 255 / 0.15);
    color: #e8e0d0;
    font-size: 0.85rem;
    text-align: center;
    letter-spacing: 0.05em;
  }

  .divider {
    margin: 0.25rem 0;
    font-size: 0.75rem;
    color: rgba(255 255 255 / 0.35);
  }

  .error {
    margin: 0;
    font-size: 0.75rem;
    color: #e07070;
  }
</style>
