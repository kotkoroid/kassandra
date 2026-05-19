<script lang="ts">
  // Wolves and bears now ride a shared InstancedMesh renderer — one
  // draw call per body-part shape across the entire roster, instead
  // of 11+ draws per beast. See entityMeshDefs.ts for the part lists.
  import EntityInstances from './EntityInstances.svelte';
  import { BEAR_DEFS, WOLF_DEFS } from './entityMeshDefs';
</script>

<EntityInstances kinds={['wolf']} defs={WOLF_DEFS} nameplateY={1.2} />
<EntityInstances kinds={['bear']} defs={BEAR_DEFS} nameplateY={1.65} />
