import * as THREE from '../../vendor/three.module.min.js';
import { getOrCreateSkinMaterial, buildBoxUV, mergeGeometries } from './skins.js';
import { drawMobIconCanvas } from './faces.js';

const MAIN_IDS = ['sheep', 'slime', 'cat', 'golem', 'snow', 'creeper', 'bee', 'ender', 'wither', 'villager'];

// Matches exact gold-block podium positions flanking the Tier Wall in src/world/layout.js!
const DEFAULT_PODIUMS = [
  { x: 36.2, y: 8, z: 39.6 },
  { x: 55.2, y: 8, z: 39.6 },
  { x: 37.35, y: 8, z: 39.6 },
  { x: 56.35, y: 8, z: 39.6 },
  { x: 38.5, y: 8, z: 39.6 },
  { x: 57.5, y: 8, z: 39.6 },
  { x: 39.65, y: 8, z: 39.6 },
  { x: 58.65, y: 8, z: 39.6 },
  { x: 40.8, y: 8, z: 39.6 },
  { x: 59.8, y: 8, z: 39.6 },
];

/**
 * Red-caped "?" mystery figures on the plaza podium row (video 0:10).
 * Each unmet mystery figure is 1 merged mesh (red billowing cloak + bold '?' + mob face teaser head above cloak!).
 * `capes.reveal(id)` spins & flips the mystery cloak into the full revealed contestant!
 */
export function createCapes(ctx, createActorFn) {
  const group = new THREE.Group();
  group.name = 'plaza_mystery_capes';
  const entries = new Map();
  let sharedCapeGeo = null;

  function getCapeMeshForId(id) {
    const mat = getOrCreateSkinMaterial(`cape_mystery_${id}`, (g) => {
      // Top [0..32, 0..16]: Mob teaser face head (8x8x8 unfolded box, front at 8,8) — just like video 0:10!
      g.fillStyle = '#1f1b24';
      g.fillRect(0, 0, 64, 64);
      const mobIcon = drawMobIconCanvas(id, 8);
      g.drawImage(mobIcon, 8, 8, 8, 8);

      // Lower [0..64, 16..64]: Bright crimson billowing '?' mystery cape!
      g.fillStyle = '#dc1e28';
      g.fillRect(0, 16, 64, 48);
      g.fillStyle = '#b0121b';
      g.fillRect(0, 16, 8, 48);
      g.fillRect(24, 16, 40, 48);
      g.fillStyle = '#f03e3e';
      g.fillRect(9, 24, 14, 2);
      // Crisp pixel '?' on front of cloak (front UV region for cloak w=1.08,h=1.45,d=0.62 -> u0=0,v0=16, pd=5,pw=9,ph=12 -> front at x=5..14, y=21..33)
      g.fillStyle = '#dc1e28';
      g.fillRect(5, 21, 9, 12);
      g.fillStyle = '#ffffff';
      g.fillRect(7, 23, 5, 1);
      g.fillRect(7, 24, 2, 1);
      g.fillRect(10, 24, 2, 3);
      g.fillRect(9, 26, 2, 2);
      g.fillRect(9, 29, 2, 2);
    });

    if (!sharedCapeGeo) {
      const headBox = buildBoxUV(0.84, 0.84, 0.84, 0, 0, 64, 64, 0, 1.92, 0, 0, 0, 0, { pw: 8, ph: 8, pd: 8 });
      const collarBox = buildBoxUV(1.02, 0.20, 0.66, 0, 16, 64, 64, 0, 1.42, 0, 0, 0, 0, { pw: 9, ph: 2, pd: 5 });
      const cloakBox = buildBoxUV(1.12, 1.42, 0.62, 0, 16, 64, 64, 0, 0.71, 0, 0, 0, 0, { pw: 9, ph: 12, pd: 5 });
      const flareBox = buildBoxUV(1.26, 0.24, 0.72, 0, 16, 64, 64, 0, 0.12, 0, 0, 0, 0, { pw: 9, ph: 2, pd: 5 });
      sharedCapeGeo = mergeGeometries([headBox, collarBox, cloakBox, flareBox]);
    }
    return new THREE.Mesh(sharedCapeGeo, mat);
  }

  let hasCustomPositions = false;

  function init(parentScene, positions) {
    const targetScene = parentScene || ctx?.scene;
    hasCustomPositions = Array.isArray(positions) && positions.length > 0;
    while (group.children.length) group.remove(group.children[0]);
    entries.clear();

    const spots = positions || ctx?.world?.landmarks?.capeSpots || DEFAULT_PODIUMS;
    MAIN_IDS.forEach((id, i) => {
      const p = spots[i] || DEFAULT_PODIUMS[i];
      const slot = new THREE.Group();
      slot.position.set(p.x, p.y ?? 8, p.z);
      // Face south (+Z) toward plaza & spawn!
      slot.rotation.y = 0;

      const mysteryMesh = getCapeMeshForId(id);
      slot.add(mysteryMesh);
      group.add(slot);

      entries.set(id, {
        id,
        index: i,
        slot,
        mysteryMesh,
        actor: null,
        revealed: false,
        flipT: 0,
      });
    });

    if (targetScene && !group.parent) {
      targetScene.add(group);
    }
  }

  function reveal(id) {
    if (!entries.size && ctx?.scene) init(ctx.scene);
    const e = entries.get(id);
    if (!e || e.revealed) return;
    e.revealed = true;
    e.flipT = 0.001;
    if (!e.actor && createActorFn) {
      e.actor = createActorFn(id, { id: `cape_revealed_${id}`, autoCull: false });
      e.actor.setAnim('wave');
      e.actor.group.visible = false;
      e.slot.add(e.actor.group);
    }
  }

  function reset() {
    for (const e of entries.values()) {
      e.revealed = false;
      e.flipT = 0;
      e.slot.rotation.y = 0;
      e.slot.scale.set(1, 1, 1);
      e.mysteryMesh.visible = true;
      if (e.actor) e.actor.group.visible = false;
    }
  }

  function update(dt) {
    if (ctx?.state?.area && ctx.state.area !== 'hub') {
      group.visible = false;
      return;
    }
    group.visible = true;

    let idx = 0;
    const worldSpots = !hasCustomPositions ? ctx?.world?.landmarks?.capeSpots : null;
    for (const e of entries.values()) {
      if (worldSpots && worldSpots[idx]) {
        e.slot.position.x = worldSpots[idx].x;
        e.slot.position.z = worldSpots[idx].z;
      }
      const surf = ctx?.world?.surfaceY?.(Math.floor(e.slot.position.x), Math.floor(e.slot.position.z));
      if (Number.isFinite(surf) && surf > 0) {
        e.slot.position.y = surf;
      }

      if (e.flipT > 0 && e.flipT < 1) {
        e.flipT = Math.min(1, e.flipT + dt * 2.2);
        e.slot.rotation.y = e.flipT * Math.PI * 2;
        const pop = 1 + Math.sin(e.flipT * Math.PI) * 0.25;
        e.slot.scale.set(pop, pop, pop);
        if (e.flipT >= 0.5 && e.mysteryMesh.visible) {
          e.mysteryMesh.visible = false;
          if (e.actor) {
            e.actor.group.visible = true;
            e.actor.setAnim('cheer');
          }
        }
        if (e.flipT >= 1) {
          e.slot.rotation.y = 0;
          e.slot.scale.set(1, 1, 1);
          if (e.actor) e.actor.setAnim('wave');
        }
      } else if (!e.revealed) {
        // Gentle mysterious idle sway on red '?' capes
        e.mysteryMesh.rotation.y = Math.sin((ctx?.time ?? 0) * 1.6 + idx * 0.7) * 0.08;
      }

      if (e.actor && e.actor.group.visible) {
        e.actor.update(dt);
      }
      idx++;
    }
  }

  // Auto-initialize into ctx.scene if present so Title & Plaza immediately display the 10 red '?' capes!
  if (ctx?.scene) {
    init(ctx.scene);
  }

  return { group, entries, init, reveal, reset, update };
}
