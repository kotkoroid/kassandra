// Shared MeshStandardMaterial instances for all entity components.
// One object per visual "slot" — Three.js can batch draw calls for
// meshes that share the exact same material reference.
//
// Keep inline only materials whose properties are reactive (e.g.
// Lamp glow with `emissiveIntensity={lit * 1.8}`) or whose opacity
// is driven by animation (Player level-up pillars, Healers circle).

import { MeshStandardMaterial } from 'three';

// ── Hitbox ───────────────────────────────────────────────────────────────
/** Invisible click-target material. opacity:0 + transparent keeps the
 *  mesh out of the colour buffer and depth buffer but Three.js still
 *  raycasts it (visible:true), giving every entity a uniform click area. */
export const HITBOX_MAT = new MeshStandardMaterial({ transparent: true, opacity: 0, depthWrite: false });

// ── Cross-entity ─────────────────────────────────────────────────────────
/** Dark mahogany wood: weapon grips, arrow shafts, lamp post */
export const DARK_WOOD_MAT = new MeshStandardMaterial({ color: '#3d2715', roughness: 0.9 });
/** Medium oak: boot cuffs, quivers, bow staves, dark hair */
export const OAK_MAT = new MeshStandardMaterial({ color: '#5a3018', roughness: 0.9 });
/** Gold metallic trim: buttons, staff caps, circlets */
export const GOLD_TRIM_MAT = new MeshStandardMaterial({ color: '#d4a23a', metalness: 0.65, roughness: 0.28 });
/** Steel sword/broadsword blades */
export const STEEL_BLADE_MAT = new MeshStandardMaterial({ color: '#d4d4dc', metalness: 0.8, roughness: 0.18 });
/** Arrow-tip steel */
export const ARROW_HEAD_MAT = new MeshStandardMaterial({ color: '#c0c0c8', metalness: 0.7, roughness: 0.28 });
/** Bronze pommel, weapon fittings */
export const BRONZE_POMMEL_MAT = new MeshStandardMaterial({ color: '#7a5a30', metalness: 0.6, roughness: 0.32 });
/** Tan skin: Bowmaiden, Warmaiden, Troller */
export const SKIN_TAN_MAT = new MeshStandardMaterial({ color: '#f0c8a8', roughness: 0.9 });
/** Fair/pale skin: Healer (Janna), Spellmaiden */
export const SKIN_FAIR_MAT = new MeshStandardMaterial({ color: '#f0d8c3', roughness: 0.9 });
/** Olive/dark skin: Shadowmaiden */
export const SKIN_DARK_MAT = new MeshStandardMaterial({ color: '#c89878', roughness: 0.9 });
/** Ashen skin: Enemy captain */
export const SKIN_ASHEN_MAT = new MeshStandardMaterial({ color: '#dcc7b8', roughness: 0.9 });
/** Near-black: eyes, dark hardware, lamp frame, boot soles */
export const NEAR_BLACK_MAT = new MeshStandardMaterial({ color: '#1a1a1a', roughness: 0.55 });
/** Deep crimson: capes, horns, trim */
export const CRIMSON_MAT = new MeshStandardMaterial({ color: '#9c2c2c', roughness: 0.85 });
/** Dark plate armor */
export const DARK_ARMOR_MAT = new MeshStandardMaterial({ color: '#1f2025', metalness: 0.4, roughness: 0.42 });
/** Red headband: Bowmaiden + Warmaiden (same colour) */
export const RED_HEADBAND_MAT = new MeshStandardMaterial({ color: '#c43a2a', roughness: 0.88 });
/** Very dark charcoal leather: bracers, dark leather details */
export const CHARCOAL_LEATHER_MAT = new MeshStandardMaterial({ color: '#2a1810', roughness: 0.9 });

// ── Wolf ─────────────────────────────────────────────────────────────────
export const FUR_WOLF_MAT = new MeshStandardMaterial({ color: '#5b5552', roughness: 0.95 });
export const FUR_WOLF_DARK_MAT = new MeshStandardMaterial({ color: '#3a3633', roughness: 0.95 });
export const FUR_WOLF_BELLY_MAT = new MeshStandardMaterial({ color: '#7a7472', roughness: 0.95 });
export const WOLF_EYE_MAT = new MeshStandardMaterial({ color: '#f4d33a', emissive: '#f4d33a', emissiveIntensity: 0.6 });
export const FANG_MAT = new MeshStandardMaterial({ color: '#e8e6df', roughness: 0.42 });

// ── Bear ─────────────────────────────────────────────────────────────────
export const FUR_BEAR_MAT = new MeshStandardMaterial({ color: '#5a3a22', roughness: 0.95 });
export const FUR_BEAR_DARK_MAT = new MeshStandardMaterial({ color: '#3d2614', roughness: 0.95 });
export const BEAR_MUZZLE_MAT = new MeshStandardMaterial({ color: '#7a5436', roughness: 0.95 });
export const BEAR_CLAW_MAT = new MeshStandardMaterial({ color: '#dad6c8', roughness: 0.52 });

// ── Spider ────────────────────────────────────────────────────────────────
export const SPIDER_BODY_MAT = new MeshStandardMaterial({ color: '#15090f', roughness: 0.7, metalness: 0.05 });
export const SPIDER_LEG_MAT = new MeshStandardMaterial({ color: '#0a0408', roughness: 0.6 });
export const SPIDER_EYE_MAT = new MeshStandardMaterial({ color: '#ff2020', emissive: '#a01010', emissiveIntensity: 1.8 });

// ── Healer (Janna) ────────────────────────────────────────────────────────
export const HEALER_OUTFIT_MAT = new MeshStandardMaterial({ color: '#e8eaf0', roughness: 0.88 });
export const HEALER_HAIR_MAT = new MeshStandardMaterial({ color: '#e6c25a', roughness: 0.9 });
export const HEALER_BOOT_MAT = new MeshStandardMaterial({ color: '#c8cad0', roughness: 0.88 });
export const HEALER_BELT_MAT = new MeshStandardMaterial({ color: '#d0a838', metalness: 0.45, roughness: 0.38 });
export const HEALER_ORB_MAT = new MeshStandardMaterial({ color: '#a3d8ff', emissive: '#a3d8ff', emissiveIntensity: 1.5 });

// ── Enemy ─────────────────────────────────────────────────────────────────
export const ENEMY_HAIR_MAT = new MeshStandardMaterial({ color: '#bcbcbc', roughness: 0.9 });
export const ENEMY_LEATHER_MAT = new MeshStandardMaterial({ color: '#4a3020', roughness: 0.9 });

// ── Azir ─────────────────────────────────────────────────────────────────
export const AZIR_COAT_MAT = new MeshStandardMaterial({ color: '#4a2c7a', roughness: 0.85 });
export const AZIR_CAPE_MAT = new MeshStandardMaterial({ color: '#2c1850', roughness: 0.85 });
export const AZIR_FEATHER_DARK_MAT = new MeshStandardMaterial({ color: '#8a6618', roughness: 0.9 });
export const AZIR_BEAK_MAT = new MeshStandardMaterial({ color: '#e8b048', roughness: 0.5 });
export const AZIR_STAFF_ORB_MAT = new MeshStandardMaterial({ color: '#e8b048', emissive: '#e8b048', emissiveIntensity: 1.1 });
export const AZIR_BOOT_MAT = new MeshStandardMaterial({ color: '#1f1228', roughness: 0.85 });

// ── Bowmaiden ─────────────────────────────────────────────────────────────
export const BOWMAIDEN_BOOT_MAT = new MeshStandardMaterial({ color: '#3a2a18', roughness: 0.9 });
export const BOWMAIDEN_PANTS_MAT = new MeshStandardMaterial({ color: '#5a7a4a', roughness: 0.9 });
export const BOWMAIDEN_LEATHER_MAT = new MeshStandardMaterial({ color: '#a86a48', roughness: 0.88 });
export const BOWMAIDEN_SASH_MAT = new MeshStandardMaterial({ color: '#2a1a40', roughness: 0.9 });
export const BOWMAIDEN_BANDAGE_MAT = new MeshStandardMaterial({ color: '#dccab0', roughness: 0.88 });
export const BOWMAIDEN_HAIR_MAT = new MeshStandardMaterial({ color: '#8a3a14', roughness: 0.9 });
export const BOWMAIDEN_FLETCH_MAT = new MeshStandardMaterial({ color: '#d4b078', roughness: 0.9 });
export const BOWMAIDEN_BOWSTRING_MAT = new MeshStandardMaterial({ color: '#ddd5b5', roughness: 0.88 });

// ── Warmaiden ─────────────────────────────────────────────────────────────
export const WARMAIDEN_BOOT_MAT = new MeshStandardMaterial({ color: '#5a3a20', roughness: 0.9 });
export const WARMAIDEN_KNEE_PLATE_MAT = new MeshStandardMaterial({ color: '#a8884c', metalness: 0.45, roughness: 0.38 });
export const WARMAIDEN_KNEE_PLATE_DARK_MAT = new MeshStandardMaterial({ color: '#6a522c', roughness: 0.8 });
export const WARMAIDEN_PANTS_MAT = new MeshStandardMaterial({ color: '#b89a72', roughness: 0.9 });
export const WARMAIDEN_PANTS_TRIM_MAT = new MeshStandardMaterial({ color: '#7a5a36', roughness: 0.9 });
export const WARMAIDEN_BANDEAU_MAT = new MeshStandardMaterial({ color: '#7a4a2a', roughness: 0.88 });
export const WARMAIDEN_BANDEAU_TRIM_MAT = new MeshStandardMaterial({ color: '#3a1f10', roughness: 0.9 });
export const WARMAIDEN_SIGIL_MAT = new MeshStandardMaterial({ color: '#a85a28', metalness: 0.4, roughness: 0.5 });

// ── Shadowmaiden ─────────────────────────────────────────────────────────
export const SHADOWMAIDEN_BOOT_MAT = new MeshStandardMaterial({ color: '#8a6438', roughness: 0.88 });
export const SHADOWMAIDEN_WRAPS_MAT = new MeshStandardMaterial({ color: '#4a3018', roughness: 0.9 });
export const SHADOWMAIDEN_LINEN_MAT = new MeshStandardMaterial({ color: '#e0d4b0', roughness: 0.9 });
export const SHADOWMAIDEN_SASH_MAT = new MeshStandardMaterial({ color: '#9a2828', roughness: 0.88 });
export const SHADOWMAIDEN_GOLD_MAT = new MeshStandardMaterial({ color: '#c0a050', metalness: 0.6, roughness: 0.3 });
export const SHADOWMAIDEN_EMBROIDERY_MAT = new MeshStandardMaterial({ color: '#8a3a28', roughness: 0.9 });
export const SHADOWMAIDEN_SCALE_MAT = new MeshStandardMaterial({ color: '#4a5a3a', metalness: 0.35, roughness: 0.45 });
export const SHADOWMAIDEN_SCALE_DARK_MAT = new MeshStandardMaterial({ color: '#2a3624', roughness: 0.9 });
export const SHADOWMAIDEN_CIRCLET_DARK_MAT = new MeshStandardMaterial({ color: '#7a6428', roughness: 0.7 });
export const SHADOWMAIDEN_FEATHER_MAT = new MeshStandardMaterial({ color: '#f4e8c4', roughness: 0.9 });
export const SHADOWMAIDEN_FULLER_MAT = new MeshStandardMaterial({ color: '#8a8a92', metalness: 0.65, roughness: 0.28 });

// ── Spellmaiden ───────────────────────────────────────────────────────────
export const SPELLMAIDEN_ROBE_MAT = new MeshStandardMaterial({ color: '#3a1f5a', roughness: 0.88 });
export const SPELLMAIDEN_ROBE_INNER_MAT = new MeshStandardMaterial({ color: '#1a0a30', roughness: 0.9 });
export const SPELLMAIDEN_ROBE_DARK_MAT = new MeshStandardMaterial({ color: '#1f0e36', roughness: 0.9 });
export const SPELLMAIDEN_HAIR_MAT = new MeshStandardMaterial({ color: '#dcd0c0', roughness: 0.9 });
export const SPELLMAIDEN_STAFF_MAT = new MeshStandardMaterial({ color: '#1a1418', roughness: 0.9 });
export const SPELLMAIDEN_GEM_MAT = new MeshStandardMaterial({ color: '#b04ad8', emissive: '#b04ad8', emissiveIntensity: 0.9 });
export const SPELLMAIDEN_CRYSTAL_MAT = new MeshStandardMaterial({ color: '#c050ff', emissive: '#e090ff', emissiveIntensity: 1.6 });
export const SPELLMAIDEN_CRYSTAL_HALO_MAT = new MeshStandardMaterial({ color: '#e090ff', emissive: '#e090ff', emissiveIntensity: 0.4, transparent: true, opacity: 0.18, depthWrite: false });

// ── Troller ────────────────────────────────────────────────────────────────
export const TROLLER_LEGS_MAT = new MeshStandardMaterial({ color: '#3a2614', roughness: 0.9 });
export const TROLLER_BODY_MAT = new MeshStandardMaterial({ color: '#2c5fa0', roughness: 0.85 });
export const TROLLER_BEARD_MAT = new MeshStandardMaterial({ color: '#e8e3d4', roughness: 0.9 });
export const TROLLER_HAT_MAT = new MeshStandardMaterial({ color: '#a82424', roughness: 0.88 });
export const TROLLER_SACK_MAT = new MeshStandardMaterial({ color: '#6b4625', roughness: 0.9 });

// ── Lamp ──────────────────────────────────────────────────────────────────
/** Dark banding / trim on the lamp post */
export const LAMP_WOOD_TRIM_MAT = new MeshStandardMaterial({ color: '#2a1810', roughness: 0.9 });
// DARK_WOOD_MAT (#3d2715) → lamp post cylinder
// NEAR_BLACK_MAT (#1a1a1a) → lantern frame bars and cap
// Lamp glowing core keeps an inline material because emissiveIntensity is reactive.

// ── Projectiles ───────────────────────────────────────────────────────────
export const SPELL_PROJ_CORE_MAT = new MeshStandardMaterial({ color: '#c050ff', emissive: '#e090ff', emissiveIntensity: 2.2 });
export const SPELL_PROJ_HALO_MAT = new MeshStandardMaterial({ color: '#e090ff', emissive: '#e090ff', emissiveIntensity: 0.5, transparent: true, opacity: 0.25, depthWrite: false });
export const SWAIN_ORB_MAT = new MeshStandardMaterial({ color: '#ff3a3a', emissive: '#c41a1a', emissiveIntensity: 1.8 });

// ── Player (static colours only — cosmetic slots stay inline) ─────────────
export const PLAYER_SKIN_MAT = new MeshStandardMaterial({ color: '#f0907e', roughness: 0.9 });
export const PLAYER_LEATHER_MAT = new MeshStandardMaterial({ color: '#5a3a28', roughness: 0.9 });
export const PLAYER_BLADE_MAT = new MeshStandardMaterial({ color: '#c0c0c8', metalness: 0.75, roughness: 0.22 });
export const PLAYER_CROSSGUARD_MAT = new MeshStandardMaterial({ color: '#a8a8b0', metalness: 0.6, roughness: 0.32 });
export const PLAYER_GRIP_MAT = new MeshStandardMaterial({ color: '#3a2a1a', roughness: 0.9 });
