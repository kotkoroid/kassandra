<script lang="ts">
  // Generic InstancedMesh renderer for a set of entity kinds that
  // share a PartDef list (see entityMeshDefs.ts). One InstancedMesh
  // is allocated per PartDef; each entity contributes one slot per
  // local matrix on that def. Per-frame, every visible instance's
  // matrix is recomposed from the entity's current x/z/rotation/
  // scale and the def's pre-baked local transform.
  //
  // Click handling rides on every PartDef's InstancedMesh so any
  // visible body part will engage the underlying entity (instance
  // slot → entity index by dividing by locals.length).

  import { T, useTask } from '@threlte/core';
  import { InstancedMesh, Matrix4, Quaternion, Vector3 } from 'three';
  import { hover } from '../hover.svelte';
  import { getMonster } from '../monsters';
  import { selection } from '../selection.svelte';
  import { dispatch } from '../simulation/input';
  import type { Entity, EntityKind } from '../simulation/types';
  import { world } from '../simulation/world.svelte';
  import EntityNameplate from './EntityNameplate.svelte';
  import type { PartDef } from './entityMeshDefs';

  interface Props {
    /** Which entity kinds this batch covers. Filtering is done by
     *  this Set so the kind list can stay sparse. */
    kinds: EntityKind[];
    defs: PartDef[];
    /** Absolute world-space Y for the nameplate above each entity.
     *  Per-tier scale (spider) does NOT shift this — the original
     *  components compensated with `0.6 / scale` inside a scaled
     *  group to land at a constant world height. */
    nameplateY: number;
    /** Optional per-kind uniform scale. Used for spider tiers. */
    scaleByKind?: Partial<Record<EntityKind, number>>;
    /** Nameplate bar width override (defaults to 64 inside the comp). */
    barWidthPx?: number;
    /** Allocation ceiling per PartDef (entity slots; multiplied by
     *  the def's locals length for the actual instance buffer). Real
     *  draw count is clamped via `mesh.count` every frame, AND the
     *  per-tick loop refuses to write past the buffer so an under-
     *  sized cap merely hides the overflow entities instead of
     *  corrupting the GPU upload. Bumped from 128 → 512 after 150
     *  wolves caused the bodies to vanish entirely (writes past the
     *  buffer were silently dropped by typed-array assignment, and
     *  `mesh.count` past `instanceMatrix.count` killed the draw). */
    maxEntities?: number;
  }

  let {
    kinds,
    defs,
    nameplateY,
    scaleByKind,
    barWidthPx = 64,
    maxEntities = 512,
  }: Props = $props();

  // `kinds` and `defs` are logically const for the component's
  // lifetime; the caller never swaps them, so capturing the initial
  // value is correct. Suppress the per-line "state captured at init"
  // warning rather than wrapping these in $derived (which would
  // re-build the Set / array on every read).
  // svelte-ignore state_referenced_locally
  const kindSet = new Set(kinds);
  // svelte-ignore state_referenced_locally
  const meshes: (InstancedMesh | undefined)[] = defs.map(() => undefined);

  // Reusable scratch transforms. compose() writes into TMP_ENT each
  // frame; multiplyMatrices() folds in each local. Allocating fresh
  // Matrix4s per slot would churn the GC under 50+ entities.
  const TMP_POS = new Vector3();
  const TMP_SCALE = new Vector3(1, 1, 1);
  const TMP_Y_QUAT = new Quaternion();
  const TMP_ENT = new Matrix4();
  const TMP_SLOT = new Matrix4();

  // Reactive entity list for nameplates. The per-frame matrix update
  // reads world.entities directly inside useTask to avoid funneling
  // every entity-field tick through Svelte's reactivity layer.
  const visible = $derived.by(() =>
    world.entities.filter((e) => kindSet.has(e.kind)),
  );

  function entityMatrix(e: Entity, scale: number): Matrix4 {
    TMP_POS.set(e.x, 0, e.z);
    // Y-axis quaternion built inline — cheaper than setFromAxisAngle
    // for a single-axis rotation, no Vector3 needed.
    const h = e.rotation * 0.5;
    TMP_Y_QUAT.set(0, Math.sin(h), 0, Math.cos(h));
    TMP_SCALE.set(scale, scale, scale);
    TMP_ENT.compose(TMP_POS, TMP_Y_QUAT, TMP_SCALE);
    return TMP_ENT;
  }

  useTask(() => {
    const list: Entity[] = [];
    for (const e of world.entities) if (kindSet.has(e.kind)) list.push(e);
    const n = list.length;

    for (let d = 0; d < defs.length; d++) {
      const mesh = meshes[d];
      const def = defs[d];
      if (!mesh || !def) continue;
      const L = def.locals.length;
      // Hard cap the per-entity write loop to the buffer size so
      // overflow entities never produce out-of-bounds setMatrixAt
      // calls (silently dropped by typed-array assignment) nor a
      // bogus `mesh.count` past `instanceMatrix.count` (corrupts the
      // whole draw). Excess entities lose only their body mesh —
      // their nameplate still renders.
      const cap = Math.min(n, Math.floor(mesh.instanceMatrix.count / L));
      for (let i = 0; i < cap; i++) {
        const e = list[i]!;
        const s = scaleByKind?.[e.kind] ?? 1;
        const ent = entityMatrix(e, s);
        for (let k = 0; k < L; k++) {
          TMP_SLOT.multiplyMatrices(ent, def.locals[k]!);
          mesh.setMatrixAt(i * L + k, TMP_SLOT);
        }
      }
      mesh.count = cap * L;
      mesh.instanceMatrix.needsUpdate = true;
    }
  });

  function entityFromEvent(event: any, def: PartDef) {
    const instanceId = event.instanceId;
    if (typeof instanceId !== 'number') return null;
    const i = Math.floor(instanceId / def.locals.length);
    const list = world.entities.filter((e) => kindSet.has(e.kind));
    return list[i] ?? null;
  }

  function handleClick(event: any, def: PartDef) {
    event.stopPropagation();
    const ent = entityFromEvent(event, def);
    if (!ent) return;
    selection.value = ent.id;
    dispatch(world, { kind: 'engage', targetId: ent.id });
  }

  function handlePointerEnter(event: any, def: PartDef) {
    event.stopPropagation();
    const ent = entityFromEvent(event, def);
    if (ent) hover.entityId = ent.id;
  }

  function handlePointerLeave(event: any, def: PartDef) {
    const ent = entityFromEvent(event, def);
    if (ent && hover.entityId === ent.id) hover.entityId = null;
  }
</script>

{#each defs as def, di (di)}
  <T.InstancedMesh
    args={[def.geo, def.mat, maxEntities * def.locals.length]}
    castShadow={def.castShadow}
    count={0}
    frustumCulled={false}
    oncreate={(m: InstancedMesh) => {
      meshes[di] = m;
    }}
    onclick={(e: any) => handleClick(e, def)}
    onpointerenter={(e: any) => handlePointerEnter(e, def)}
    onpointerleave={(e: any) => handlePointerLeave(e, def)}
  />
{/each}

{#each visible as entity (entity.id)}
  {@const monster = getMonster(entity.monsterId)}
  <EntityNameplate
    position={[entity.x, nameplateY, entity.z]}
    name={monster.name}
    level={monster.level}
    hpPercent={entity.hp / entity.maxHp}
    barWidthPx={barWidthPx}
    entityX={entity.x}
    entityZ={entity.z}
  />
{/each}
