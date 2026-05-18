<script lang="ts">
  // Stone curtain wall ring + flanking gate towers + arched gate.
  // The ring is pure decoration (no animation, no collision) so the
  // three repeated pieces — wall block, lighter top trim cap, and
  // crenellation merlon — are packed into instanced meshes. That
  // drops the ring from ~130 draw calls to 3 without changing the
  // visual.

  import { T } from '@threlte/core';
  import {
    BoxGeometry,
    Matrix4,
    MeshStandardMaterial,
    Quaternion,
    Vector3,
    type InstancedMesh,
  } from 'three';
  import {
    CITY_GATE_ANGLE,
    CITY_GATE_HALF_WIDTH,
    CITY_RADIUS,
    CITY_WALL_HEIGHT,
    CITY_WALL_THICKNESS,
    CITY_X,
    CITY_Z,
    isGateAngle,
  } from '../city';

  const stone = '#9a9a9a';
  const stoneDark = '#6a6a6a';
  const stoneTop = '#bcbcbc';
  const roof = '#5a2c1c';
  const wood = '#3d2715';
  const torch = '#f0b040';

  // Wall ring resolution. Higher = smoother curve at the cost of
  // more instances. 48 segments produces ~1.6m segments at R=12.
  const SEGMENTS = 48;

  // Crenellation pitch — one tall merlon every `MERLON_STRIDE`
  // segments. Distinct from `SEGMENTS` so the merlons don't crowd.
  const MERLON_STRIDE = 2;

  // Outer ring radius the boxes sit on (pulls slightly outward so
  // the wall hugs the city border without clipping the ground disc).
  const RING_R = CITY_RADIUS + CITY_WALL_THICKNESS / 2;
  const SEG_LEN = (2 * Math.PI * RING_R) / SEGMENTS;

  // Tower placement: just past either side of the gate opening so
  // they "frame" the entrance.
  const TOWER_RADIUS = 0.7;
  const TOWER_HEIGHT = 2.8;
  const TOWER_CONE_HEIGHT = 1.1;

  // Resolve which segments make it past the gate gap up-front so the
  // three instanced meshes share one list.
  interface Seg { theta: number; cx: number; cz: number; merlon: boolean; }
  const segments: Seg[] = [];
  for (let i = 0; i < SEGMENTS; i++) {
    const theta = (i / SEGMENTS) * Math.PI * 2;
    if (isGateAngle(theta)) continue;
    segments.push({
      theta,
      cx: CITY_X + Math.cos(theta) * RING_R,
      cz: CITY_Z + Math.sin(theta) * RING_R,
      merlon: i % MERLON_STRIDE === 0,
    });
  }
  const merlonSegments = segments.filter((s) => s.merlon);

  // Constructor args for the three instanced meshes. Geometry +
  // material are shared per instance, only the per-instance matrix
  // differs.
  const wallGeo = new BoxGeometry(
    SEG_LEN * 1.04,
    CITY_WALL_HEIGHT,
    CITY_WALL_THICKNESS,
  );
  const wallMat = new MeshStandardMaterial({ color: stone });
  const capGeo = new BoxGeometry(
    SEG_LEN * 1.04,
    0.08,
    CITY_WALL_THICKNESS + 0.04,
  );
  const capMat = new MeshStandardMaterial({ color: stoneTop });
  const merlonGeo = new BoxGeometry(
    SEG_LEN * 0.55,
    0.36,
    CITY_WALL_THICKNESS,
  );
  const merlonMat = new MeshStandardMaterial({ color: stone });

  // Reusable scratch transforms — building each instance allocates
  // would otherwise spam GC every mount.
  const TMP_POS = new Vector3();
  const TMP_QUAT = new Quaternion();
  const TMP_SCALE = new Vector3(1, 1, 1);
  const TMP_AXIS = new Vector3(0, 1, 0);
  const TMP_MAT = new Matrix4();

  function fillRing(mesh: InstancedMesh, list: Seg[], localY: number) {
    for (let i = 0; i < list.length; i++) {
      const s = list[i]!;
      TMP_POS.set(s.cx, localY, s.cz);
      TMP_QUAT.setFromAxisAngle(TMP_AXIS, -s.theta);
      TMP_MAT.compose(TMP_POS, TMP_QUAT, TMP_SCALE);
      mesh.setMatrixAt(i, TMP_MAT);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }

  // Gate-arch placement. Top-level {@const} isn't legal in Svelte
  // (must sit inside an `{#if}` / `{#each}` / etc.), so the values
  // live up here as plain script constants.
  const gx = CITY_X + Math.cos(CITY_GATE_ANGLE) * RING_R;
  const gz = CITY_Z + Math.sin(CITY_GATE_ANGLE) * RING_R;
  const gateSpan = 2 * RING_R * Math.sin(CITY_GATE_HALF_WIDTH) + 0.4;
</script>

<!-- The three instanced meshes that make up the wall ring. Each is
     exactly one draw call; the per-segment transforms are baked into
     the InstancedMesh's instanceMatrix on mount. -->
<T.InstancedMesh
  args={[wallGeo, wallMat, segments.length]}
  castShadow
  receiveShadow
  oncreate={(m: InstancedMesh) => fillRing(m, segments, CITY_WALL_HEIGHT / 2)}
/>
<T.InstancedMesh
  args={[capGeo, capMat, segments.length]}
  castShadow
  oncreate={(m: InstancedMesh) => fillRing(m, segments, CITY_WALL_HEIGHT + 0.04)}
/>
<T.InstancedMesh
  args={[merlonGeo, merlonMat, merlonSegments.length]}
  castShadow
  oncreate={(m: InstancedMesh) => fillRing(m, merlonSegments, CITY_WALL_HEIGHT + 0.25)}
/>

<!-- Gate towers: two cylinders flanking the opening, each capped by
     a conical roof. Positioned at the edges of the gate gap. -->
{#each [-1, 1] as side (side)}
  {@const theta = CITY_GATE_ANGLE + side * (CITY_GATE_HALF_WIDTH + 0.05)}
  {@const tx = CITY_X + Math.cos(theta) * RING_R}
  {@const tz = CITY_Z + Math.sin(theta) * RING_R}
  <T.Group position={[tx, 0, tz]}>
    <T.Mesh position={[0, TOWER_HEIGHT / 2, 0]} castShadow receiveShadow>
      <T.CylinderGeometry args={[TOWER_RADIUS, TOWER_RADIUS, TOWER_HEIGHT, 14]} />
      <T.MeshStandardMaterial color={stone} />
    </T.Mesh>
    <!-- Crenellated rim at the top of each tower. -->
    <T.Mesh position={[0, TOWER_HEIGHT + 0.06, 0]} castShadow>
      <T.CylinderGeometry args={[TOWER_RADIUS + 0.07, TOWER_RADIUS + 0.07, 0.12, 14]} />
      <T.MeshStandardMaterial color={stoneTop} />
    </T.Mesh>
    <T.Mesh position={[0, TOWER_HEIGHT + TOWER_CONE_HEIGHT / 2 + 0.12, 0]} castShadow>
      <T.ConeGeometry args={[TOWER_RADIUS + 0.05, TOWER_CONE_HEIGHT, 14]} />
      <T.MeshStandardMaterial color={roof} />
    </T.Mesh>
    <!-- Tiny torch sconce against the tower facing into town. -->
    <T.Mesh
      position={[
        -Math.cos(CITY_GATE_ANGLE) * (TOWER_RADIUS + 0.05),
        1.4,
        -Math.sin(CITY_GATE_ANGLE) * (TOWER_RADIUS + 0.05),
      ]}
    >
      <T.SphereGeometry args={[0.08, 8, 8]} />
      <T.MeshStandardMaterial color={torch} emissive={torch} emissiveIntensity={1.4} />
    </T.Mesh>
  </T.Group>
{/each}

<!-- Gate arch: a single horizontal stone lintel spanning the gap
     above the opening, with two vertical jambs hanging below it so
     the gate reads as a proper opening rather than a wall gap. -->
<T.Group position={[gx, 0, gz]} rotation.y={-CITY_GATE_ANGLE}>
  <!-- Lintel: stone block above the gateway. -->
  <T.Mesh
    position={[0, CITY_WALL_HEIGHT - 0.25, 0]}
    castShadow
    receiveShadow
  >
    <T.BoxGeometry args={[gateSpan, 0.45, CITY_WALL_THICKNESS + 0.1]} />
    <T.MeshStandardMaterial color={stoneDark} />
  </T.Mesh>
  <!-- Battlement on top of the lintel so the wall walk continues. -->
  <T.Mesh position={[0, CITY_WALL_HEIGHT + 0.1, 0]} castShadow>
    <T.BoxGeometry args={[gateSpan, 0.3, CITY_WALL_THICKNESS + 0.05]} />
    <T.MeshStandardMaterial color={stone} />
  </T.Mesh>
  <!-- Wooden double-leaf doors recessed into the archway. Set just
       inside the wall plane so they read as open from outside. -->
  <T.Mesh position={[-gateSpan / 4, CITY_WALL_HEIGHT / 2 - 0.2, -0.05]} castShadow>
    <T.BoxGeometry args={[gateSpan / 2 - 0.05, CITY_WALL_HEIGHT - 0.7, 0.08]} />
    <T.MeshStandardMaterial color={wood} />
  </T.Mesh>
  <T.Mesh position={[gateSpan / 4, CITY_WALL_HEIGHT / 2 - 0.2, -0.05]} castShadow>
    <T.BoxGeometry args={[gateSpan / 2 - 0.05, CITY_WALL_HEIGHT - 0.7, 0.08]} />
    <T.MeshStandardMaterial color={wood} />
  </T.Mesh>
</T.Group>
