/**
 * The v1 sprite roster — T049, resolving plan.md open question 3.
 *
 * Kenney "RTS Pack: Sci-Fi" (CC0) ships 48 unit sprites in four colour families
 * of twelve, laid out identically within each family. Two families are used:
 * BLUE for player 0 and ORANGE for player 1. That pairing is not decorative —
 * blue/orange is the one high-contrast pair that survives every common form of
 * colour vision deficiency, where the conventional red/green does not. It is
 * still only a *support* for FR-018: the underglow ring (T051) is the actual
 * WCAG 1.4.1 mitigation, because colour alone may never be the sole carrier.
 *
 * Within a family the offset layout is: +1 armoured soldier, +2 hard-hat worker,
 * +3 radio soldier, +4 soldier, +5 light scout, +6..8 trucks, +9..11 armour,
 * +12 civilian. Roster picks are made on SILHOUETTE, not on lore: at 64 px with
 * up to 30 units a side, the shape has to carry the read.
 *
 * Structures are colour-neutral in the source art and are deliberately left that
 * way — a shared silhouette per structure kind means "what is it" and the ring
 * means "whose is it", rather than both signals competing in one sprite.
 */

import { KIND, type Kind, type Owner } from '../sim/state';

/**
 * Resolved against Vite's base rather than left page-relative.
 *
 * A bare `images/...` resolves against whatever page did the loading, so it
 * worked from `/index.html` and 404'd from any page in a subdirectory — found by
 * the T081 spike, which lives in `/scripts/`. `BASE_URL` is `/` in dev and `./`
 * in the build, so the bundle stays deployable from a subdirectory (vite.config
 * sets `base: './'` deliberately) while every page resolves the same textures.
 */
const BASE_PATH = `${import.meta.env.BASE_URL}images/PNG/Default size`;

/** Family offsets into the 48-sprite unit sheet. */
const FAMILY: Record<Owner, number> = { 0: 0, 1: 12 };

/** Position within a family, chosen for silhouette separation at tile scale. */
const UNIT_OFFSET: Partial<Record<Kind, number>> = {
  [KIND.TROOPER]: 1, //  armoured, bulkiest infantry outline
  [KIND.WORKER]: 2, //   hard hat — reads as non-combatant at a glance
  [KIND.SCOUT]: 5, //    smallest infantry outline; smallest reads as fastest
  [KIND.TANK]: 9, //     the only tracked silhouette with a barrel
};

/** Structures are shared between players; the ring carries ownership. */
const STRUCTURE_FILE: Partial<Record<Kind, string>> = {
  [KIND.BASE]: 'scifiStructure_01', //   wide command centre with a landing pad
  [KIND.FACTORY]: 'scifiStructure_02', // hangar with bay doors — things emerge
};

/** Plain ground. Two variants so a 20x11 field of one tile does not band. */
export const TILE_KEYS = ['tile-ground-a', 'tile-ground-b'] as const;
/**
 * The ONLY two plain tiles in the pack.
 *
 * 39 and 40 were tried and reverted: they sit beside 41/42 in the listing but
 * carry a large grey path shape AND transparent regions, so a map built from
 * them rendered as chaotic blobs punched through to the page background. They
 * would also have lied about the map — a path shape on terrain with no
 * impassable cells reads as a wall that units then walk straight through.
 * Variety comes from the scenery layer instead, which is additive and cannot
 * put a hole in the ground.
 */
const TILE_FILES = ['scifiTile_42', 'scifiTile_41'];

/** Ore. Orange rock shot with gold — the only sprite that reads as "resource". */
export const ORE_KEY = 'ore-node';
const ORE_FILE = 'scifiEnvironment_02';

/**
 * Scenery — playtest round 1: "the terrain is bland, would be nice to see some
 * trees and rivers".
 *
 * Purely decorative and drawn beneath everything that matters. Deliberately
 * excludes every ORANGE ROCK in the pack — `_01`, `_02` (the ore sprite itself)
 * and `_20`. Ore is the one piece of scenery a player must be able to pick out
 * instantly, and the first version of this list let `_20` through: a smaller,
 * gold-less orange rock scattered thirty times across the map, competing with
 * the sprite the whole economy depends on finding. The scatter is now grey
 * crystal, grey rock, green cactus and purple tree — nothing that could be
 * mistaken for ore at a glance.
 *
 * No river. The pack has water tiles, but the passability grid is derived from
 * structures alone — water would LOOK impassable and units would walk straight
 * over it, teaching the player something false about a map they have to read at
 * a glance. A believable river needs blocked cells, which is a simulation change
 * with a corpus regeneration and a balance question attached, not scenery.
 */
export const SCENERY_KEYS = [
  'scenery-crystal-a',
  'scenery-crystal-b',
  'scenery-crystal-c',
  'scenery-cactus-a',
  'scenery-cactus-b',
  'scenery-tree-a',
  'scenery-tree-b',
  'scenery-rock-a',
  'scenery-crystal-d',
] as const;
const SCENERY_FILES = [
  'scifiEnvironment_04',
  'scifiEnvironment_05',
  'scifiEnvironment_06',
  'scifiEnvironment_09',
  'scifiEnvironment_10',
  'scifiEnvironment_13',
  'scifiEnvironment_14',
  'scifiEnvironment_17',
  'scifiEnvironment_07',
];

/** The Phaser texture key for one entity kind and owner. */
export function spriteKey(kind: Kind, owner: Owner): string {
  return STRUCTURE_FILE[kind] !== undefined ? `s-${kind}` : `u-${kind}-${owner}`;
}

interface SpriteAsset {
  key: string;
  path: string;
}

/**
 * Every texture the match scene needs, as (key, path) pairs.
 *
 * Built rather than hand-listed so that a kind added to `KIND` without a roster
 * entry fails here, at load, instead of drawing nothing at run time.
 */
export function spriteManifest(): SpriteAsset[] {
  const assets: SpriteAsset[] = [];

  for (let i = 0; i < TILE_KEYS.length; i += 1) {
    assets.push({ key: TILE_KEYS[i]!, path: `${BASE_PATH}/Tile/${TILE_FILES[i]!}.png` });
  }
  assets.push({ key: ORE_KEY, path: `${BASE_PATH}/Environment/${ORE_FILE}.png` });
  for (let i = 0; i < SCENERY_KEYS.length; i += 1) {
    assets.push({
      key: SCENERY_KEYS[i]!,
      path: `${BASE_PATH}/Environment/${SCENERY_FILES[i]!}.png`,
    });
  }

  for (const kind of Object.values(KIND)) {
    const structure = STRUCTURE_FILE[kind];
    if (structure !== undefined) {
      assets.push({ key: spriteKey(kind, 0), path: `${BASE_PATH}/Structure/${structure}.png` });
      continue;
    }

    const offset = UNIT_OFFSET[kind];
    if (offset === undefined) {
      throw new Error(`sprite roster has no entry for kind ${kind}`);
    }
    for (const owner of [0, 1] as const) {
      const n = String(FAMILY[owner] + offset).padStart(2, '0');
      assets.push({ key: spriteKey(kind, owner), path: `${BASE_PATH}/Unit/scifiUnit_${n}.png` });
    }
  }

  return assets;
}

/** FR-018: the ownership colours the ring is drawn in. */
export const OWNER_TINT: Record<Owner, number> = {
  0: 0x38bdf8, // blue  — the human player, always on the left
  1: 0xf97316, // orange — the AI opponent
};
