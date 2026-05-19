// Pre-baked InstancedMesh part lists for Wolf, Bear, and Spider.
// Each PartDef is rendered as a single InstancedMesh covering every
// entity of the matching kind set — collapsing what used to be
// 11-17 draw calls per beast into one per part shape across the
// whole roster.
//
// A PartDef with N entries in `locals` produces N×entityCount
// instances (symmetric parts like legs/eyes share a single
// InstancedMesh — the per-entity world matrix is multiplied by
// each local matrix to place the slots in body space).

import {
  BoxGeometry,
  ConeGeometry,
  CylinderGeometry,
  Euler,
  Matrix4,
  Quaternion,
  SphereGeometry,
  Vector3,
  type BufferGeometry,
  type MeshStandardMaterial,
} from 'three';
import {
  BEAR_CLAW_MAT,
  BEAR_MUZZLE_MAT,
  FANG_MAT,
  FUR_BEAR_DARK_MAT,
  FUR_BEAR_MAT,
  FUR_WOLF_BELLY_MAT,
  FUR_WOLF_DARK_MAT,
  FUR_WOLF_MAT,
  NEAR_BLACK_MAT,
  SPIDER_BODY_MAT,
  SPIDER_EYE_MAT,
  SPIDER_LEG_MAT,
  WOLF_EYE_MAT,
} from './materials';

export interface PartDef {
  geo: BufferGeometry;
  mat: MeshStandardMaterial;
  castShadow: boolean;
  /** Body-space matrices. One entry → asymmetric part; multiple →
   *  symmetric set (e.g. eyes×2, legs×4) packed into one draw call. */
  locals: Matrix4[];
}

// Local-matrix factory: position + Euler rotation, scale 1.
function local(
  px: number,
  py: number,
  pz: number,
  rx = 0,
  ry = 0,
  rz = 0,
): Matrix4 {
  return new Matrix4().compose(
    new Vector3(px, py, pz),
    new Quaternion().setFromEuler(new Euler(rx, ry, rz)),
    new Vector3(1, 1, 1),
  );
}

// ── Wolf ─────────────────────────────────────────────────────────────────
const WOLF_BODY_GEO = new BoxGeometry(0.42, 0.4, 0.85);
const WOLF_BELLY_GEO = new BoxGeometry(0.38, 0.12, 0.78);
const WOLF_NECK_GEO = new BoxGeometry(0.26, 0.24, 0.22);
const WOLF_HEAD_GEO = new BoxGeometry(0.3, 0.28, 0.3);
const WOLF_SNOUT_GEO = new BoxGeometry(0.18, 0.16, 0.18);
const WOLF_NOSE_GEO = new BoxGeometry(0.07, 0.06, 0.05);
const WOLF_EYE_GEO = new SphereGeometry(0.025, 6, 6);
const WOLF_EAR_GEO = new ConeGeometry(0.06, 0.14, 4);
const WOLF_FANG_GEO = new ConeGeometry(0.012, 0.05, 4);
const WOLF_LEG_GEO = new CylinderGeometry(0.06, 0.06, 0.36, 6);
const WOLF_TAIL_GEO = new CylinderGeometry(0.04, 0.07, 0.36, 6);

export const WOLF_DEFS: PartDef[] = [
  { geo: WOLF_BODY_GEO, mat: FUR_WOLF_MAT, castShadow: true, locals: [local(0, 0.5, 0)] },
  { geo: WOLF_BELLY_GEO, mat: FUR_WOLF_BELLY_MAT, castShadow: true, locals: [local(0, 0.32, 0)] },
  { geo: WOLF_NECK_GEO, mat: FUR_WOLF_MAT, castShadow: true, locals: [local(0, 0.62, 0.38, 0.3, 0, 0)] },
  { geo: WOLF_HEAD_GEO, mat: FUR_WOLF_MAT, castShadow: true, locals: [local(0, 0.72, 0.55)] },
  { geo: WOLF_SNOUT_GEO, mat: FUR_WOLF_DARK_MAT, castShadow: true, locals: [local(0, 0.66, 0.74)] },
  { geo: WOLF_NOSE_GEO, mat: NEAR_BLACK_MAT, castShadow: false, locals: [local(0, 0.7, 0.84)] },
  {
    geo: WOLF_EYE_GEO,
    mat: WOLF_EYE_MAT,
    castShadow: false,
    locals: [local(-0.08, 0.8, 0.66), local(0.08, 0.8, 0.66)],
  },
  {
    geo: WOLF_EAR_GEO,
    mat: FUR_WOLF_MAT,
    castShadow: true,
    locals: [local(-0.1, 0.92, 0.5), local(0.1, 0.92, 0.5)],
  },
  {
    geo: WOLF_FANG_GEO,
    mat: FANG_MAT,
    castShadow: false,
    locals: [local(-0.04, 0.6, 0.82), local(0.04, 0.6, 0.82)],
  },
  {
    geo: WOLF_LEG_GEO,
    mat: FUR_WOLF_DARK_MAT,
    castShadow: true,
    locals: [
      local(-0.15, 0.18, -0.3),
      local(-0.15, 0.18, 0.3),
      local(0.15, 0.18, -0.3),
      local(0.15, 0.18, 0.3),
    ],
  },
  { geo: WOLF_TAIL_GEO, mat: FUR_WOLF_MAT, castShadow: true, locals: [local(0, 0.62, -0.5, -0.5, 0, 0)] },
];

// ── Bear ─────────────────────────────────────────────────────────────────
const BEAR_BODY_GEO = new BoxGeometry(0.7, 0.62, 1.1);
const BEAR_HUMP_GEO = new BoxGeometry(0.6, 0.18, 0.36);
const BEAR_HEAD_GEO = new BoxGeometry(0.46, 0.42, 0.42);
const BEAR_MUZZLE_GEO = new BoxGeometry(0.26, 0.24, 0.22);
const BEAR_NOSE_GEO = new BoxGeometry(0.09, 0.07, 0.06);
const BEAR_EYE_GEO = new SphereGeometry(0.03, 6, 6);
const BEAR_EAR_GEO = new SphereGeometry(0.09, 8, 8);
const BEAR_LEG_GEO = new CylinderGeometry(0.12, 0.12, 0.5, 8);
const BEAR_CLAW_GEO = new BoxGeometry(0.22, 0.04, 0.1);
const BEAR_TAIL_GEO = new SphereGeometry(0.1, 6, 6);

export const BEAR_DEFS: PartDef[] = [
  { geo: BEAR_BODY_GEO, mat: FUR_BEAR_MAT, castShadow: true, locals: [local(0, 0.72, 0)] },
  { geo: BEAR_HUMP_GEO, mat: FUR_BEAR_MAT, castShadow: true, locals: [local(0, 1.05, 0.2)] },
  { geo: BEAR_HEAD_GEO, mat: FUR_BEAR_MAT, castShadow: true, locals: [local(0, 1.0, 0.62)] },
  { geo: BEAR_MUZZLE_GEO, mat: BEAR_MUZZLE_MAT, castShadow: true, locals: [local(0, 0.92, 0.88)] },
  { geo: BEAR_NOSE_GEO, mat: NEAR_BLACK_MAT, castShadow: false, locals: [local(0, 0.98, 1.0)] },
  {
    geo: BEAR_EYE_GEO,
    mat: NEAR_BLACK_MAT,
    castShadow: false,
    locals: [local(-0.12, 1.1, 0.82), local(0.12, 1.1, 0.82)],
  },
  {
    geo: BEAR_EAR_GEO,
    mat: FUR_BEAR_MAT,
    castShadow: true,
    locals: [local(-0.18, 1.28, 0.55), local(0.18, 1.28, 0.55)],
  },
  {
    geo: BEAR_LEG_GEO,
    mat: FUR_BEAR_DARK_MAT,
    castShadow: true,
    locals: [
      local(-0.24, 0.26, -0.4),
      local(-0.24, 0.26, 0.4),
      local(0.24, 0.26, -0.4),
      local(0.24, 0.26, 0.4),
    ],
  },
  {
    geo: BEAR_CLAW_GEO,
    mat: BEAR_CLAW_MAT,
    castShadow: true,
    locals: [
      local(-0.24, 0.02, -0.34),
      local(-0.24, 0.02, 0.46),
      local(0.24, 0.02, -0.34),
      local(0.24, 0.02, 0.46),
    ],
  },
  { geo: BEAR_TAIL_GEO, mat: FUR_BEAR_MAT, castShadow: true, locals: [local(0, 0.78, -0.62)] },
];

// ── Spider ────────────────────────────────────────────────────────────────
const SPIDER_BODY_GEO = new SphereGeometry(0.16, 10, 10);
const SPIDER_EYE_GEO = new SphereGeometry(0.025, 6, 6);
const SPIDER_LEG_GEO = new CylinderGeometry(0.016, 0.016, 0.32, 4);

// Each leg lives in a Y-rotated group; inside, the cylinder is
// pushed out along +X with a Z-tilt so it angles outward + down.
// Composed = outer Y-rotation × inner translate+tilt.
const SPIDER_LEG_LOCALS = (() => {
  const out: Matrix4[] = [];
  const angles = [
    0,
    Math.PI / 4,
    Math.PI / 2,
    (3 * Math.PI) / 4,
    Math.PI,
    (5 * Math.PI) / 4,
    (3 * Math.PI) / 2,
    (7 * Math.PI) / 4,
  ];
  for (const a of angles) {
    const outer = local(0, 0.15, 0, 0, a, 0);
    const inner = local(0.18, -0.06, 0, 0, 0, -1.0);
    out.push(new Matrix4().multiplyMatrices(outer, inner));
  }
  return out;
})();

export const SPIDER_DEFS: PartDef[] = [
  { geo: SPIDER_BODY_GEO, mat: SPIDER_BODY_MAT, castShadow: true, locals: [local(0, 0.15, 0)] },
  {
    geo: SPIDER_EYE_GEO,
    mat: SPIDER_EYE_MAT,
    castShadow: false,
    locals: [local(-0.05, 0.19, 0.13), local(0.05, 0.19, 0.13)],
  },
  { geo: SPIDER_LEG_GEO, mat: SPIDER_LEG_MAT, castShadow: true, locals: SPIDER_LEG_LOCALS },
];
