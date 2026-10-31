// Area & portal transitions ('hub' | 'end' | 'nether') + area music per docs/DESIGN.md §1, §5, §9 (owner: core).

const DEFAULT_POI = Object.freeze({
  spawn: { x: 48, y: 8, z: 66 },
  plaza: { x: 48, y: 8, z: 48 },
  runway: { x: 48, y: 8, z: 54 },
  stage: { x: 48, y: 8, z: 59 },
  endPortal: { x: 20, y: 8, z: 18 },
  netherPortal: { x: 12, y: 8, z: 30 },
  endArrive: { x: 140, y: 8, z: 40 },
  endExit: { x: 152.5, y: 8, z: 58.5 },
  netherArrive: { x: 202, y: 8, z: 40 },
  netherExit: { x: 216.5, y: 8, z: 58.5 },
});

export function musicForArea(area) {
  if (area === 'end') return 'end';
  if (area === 'nether') return 'nether';
  return 'overworld';
}

export function createAreas(ctx) {
  let portalCooldown = 0;

  function getPoi(key) {
    return ctx.world?.poi?.[key] || DEFAULT_POI[key] || null;
  }

  function defaultSpawnForArea(area, prevArea) {
    if (area === 'end') {
      return getPoi('endArrive') || DEFAULT_POI.endArrive;
    }
    if (area === 'nether') {
      return getPoi('netherArrive') || DEFAULT_POI.netherArrive;
    }
    if (prevArea === 'end') {
      const ep = getPoi('endPortal') || DEFAULT_POI.endPortal;
      return { x: ep.x, y: ep.y ?? 8, z: ep.z + 2.6 };
    }
    if (prevArea === 'nether') {
      const np = getPoi('netherPortal') || DEFAULT_POI.netherPortal;
      return { x: np.x, y: np.y ?? 8, z: np.z + 2.6 };
    }
    return getPoi('spawn') || DEFAULT_POI.spawn;
  }

  function setArea(area, spawnPos = null, { silent = false } = {}) {
    if (!['hub', 'end', 'nether'].includes(area)) return;
    const prevArea = ctx.state.area;
    ctx.state.area = area;
    portalCooldown = 1.6;

    ctx.world?.setArea?.(area);
    ctx.world?.portals?.setArea?.(area);

    const dest = spawnPos || defaultSpawnForArea(area, prevArea);
    if (dest && ctx.player) {
      let safeDest = dest;
      if (ctx.world?.nearestWalkable && ctx.world?.isWalkable) {
        const bx = Math.floor(dest.x);
        const bz = Math.floor(dest.z);
        const by = Math.round(dest.y ?? (ctx.world.surfaceY?.(bx, bz) ?? 8));
        if (!ctx.world.isWalkable(bx, by, bz)) {
          const near = ctx.world.nearestWalkable({ x: bx, y: by, z: bz }, 5);
          if (near) {
            safeDest = { x: near.x + 0.5, y: near.y, z: near.z + 0.5 };
          }
        }
      }
      ctx.player.setPosition(safeDest.x, safeDest.y, safeDest.z);
    }

    ctx.cam?.snap?.();

    if (!silent) {
      if (ctx.state.scene === 'world') {
        ctx.audio?.music?.(musicForArea(area));
      }
      if (prevArea !== area) {
        ctx.events.emit('sfx', { name: 'portal' });
      }
      ctx.events.emit('areaChange', { area });
    }
  }

  function update(dt) {
    if (portalCooldown > 0) {
      portalCooldown = Math.max(0, portalCooldown - dt);
      return;
    }
    if (ctx.state.scene !== 'world' || !ctx.player) return;

    const p = ctx.player.pos;

    // 1. Voxel-world portals.checkWalkIn(area, pos) -> { toArea, dest }
    const walkIn = ctx.world?.portals?.checkWalkIn?.(ctx.state.area, p);
    if (walkIn && walkIn.toArea) {
      setArea(walkIn.toArea, walkIn.dest || null);
      return;
    }

    // 2. Fallback POI proximity check
    if (ctx.state.area === 'hub') {
      const ep = getPoi('endPortal');
      if (ep && Math.hypot(p.x - ep.x, p.z - ep.z) <= 1.65) {
        setArea('end');
        return;
      }
      const np = getPoi('netherPortal');
      if (np && Math.hypot(p.x - np.x, p.z - np.z) <= 1.6) {
        setArea('nether');
        return;
      }
    } else if (ctx.state.area === 'end') {
      const ex = getPoi('endExit');
      if (ex && Math.hypot(p.x - ex.x, p.z - ex.z) <= 1.65) {
        setArea('hub');
      }
    } else if (ctx.state.area === 'nether') {
      const nx = getPoi('netherExit');
      if (nx && Math.hypot(p.x - nx.x, p.z - nx.z) <= 1.6) {
        setArea('hub');
      }
    }
  }

  return {
    setArea,
    enter: setArea,
    update,
    musicForArea,
    getPoi,
  };
}

export default createAreas;
