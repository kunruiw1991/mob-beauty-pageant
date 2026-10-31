import { WX, WY, WZ } from './chunks.js';

// Pre-allocated typed buffers for ultra-fast (< 0.5 ms) zero-GC A* pathfinding on 256x96 areas
const GRID_2D = WX * WZ;
const gScore = new Float32Array(GRID_2D);
const fScore = new Float32Array(GRID_2D);
const parentIdx = new Int32Array(GRID_2D);
const nodeY = new Int8Array(GRID_2D);
const visitedTag = new Uint32Array(GRID_2D);
const closedTag = new Uint32Array(GRID_2D);
const heap = new Int32Array(GRID_2D);
let searchId = 1;

const DIRS = [
  [1, 0, 1.0],
  [-1, 0, 1.0],
  [0, 1, 1.0],
  [0, -1, 1.0],
  [1, 1, Math.SQRT2],
  [1, -1, Math.SQRT2],
  [-1, 1, Math.SQRT2],
  [-1, -1, Math.SQRT2],
];

function areaBounds(x, z) {
  if (x >= 192) return { x0: 192, x1: 240, z0: 16, z1: 64 };
  if (x >= 128) return { x0: 128, x1: 176, z0: 16, z1: 64 };
  return { x0: 0, x1: 96, z0: 0, z1: 96 };
}

export function createNav(worldAccess) {
  const { isWalkable, surfaceY } = worldAccess;

  // Resolve walkable standing Y near prefY at column (bx, bz), or -1 if none
  function columnWalkY(bx, bz, prefY) {
    if (bx < 0 || bx >= WX || bz < 0 || bz >= WZ) return -1;
    if (prefY !== undefined && prefY >= 1 && prefY < WY - 1) {
      const py = Math.round(prefY);
      if (isWalkable(bx, py, bz)) return py;
      if (py + 1 < WY - 1 && isWalkable(bx, py + 1, bz)) return py + 1;
      if (py - 1 >= 1 && isWalkable(bx, py - 1, bz)) return py - 1;
      if (py - 2 >= 1 && isWalkable(bx, py - 2, bz)) return py - 2;
    }
    const sy = surfaceY(bx, bz);
    if (
      sy >= 1 &&
      sy < WY - 1 &&
      (prefY === undefined || Math.abs(sy - prefY) <= 3) &&
      isWalkable(bx, sy, bz)
    ) {
      return sy;
    }
    // Scan downward if overhang / bridge / cave exists
    const top = Math.min(WY - 2, (prefY !== undefined ? Math.round(prefY) + 3 : WY - 2));
    const bot = Math.max(1, (prefY !== undefined ? Math.round(prefY) - 6 : 1));
    for (let y = top; y >= bot; y--) {
      if (isWalkable(bx, y, bz)) return y;
    }
    return -1;
  }

  function nearestWalkable(pos, maxR = 10) {
    if (!pos) return null;
    const bx0 = Math.floor(pos.x);
    const bz0 = Math.floor(pos.z);
    const prefY = typeof pos.y === 'number' ? pos.y : undefined;

    const y0 = columnWalkY(bx0, bz0, prefY);
    if (y0 !== -1) {
      return { x: bx0 + 0.5, y: y0, z: bz0 + 0.5 };
    }

    let best = null;
    let bestD2 = Infinity;
    for (let r = 1; r <= maxR; r++) {
      for (let dx = -r; dx <= r; dx++) {
        for (let dz = -r; dz <= r; dz++) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
          const bx = bx0 + dx;
          const bz = bz0 + dz;
          const y = columnWalkY(bx, bz, prefY);
          if (y !== -1) {
            const dy = prefY !== undefined ? (y - prefY) * 0.6 : 0;
            const d2 = dx * dx + dz * dz + dy * dy;
            if (d2 < bestD2) {
              bestD2 = d2;
              best = { x: bx + 0.5, y, z: bz + 0.5 };
            }
          }
        }
      }
      if (best) return best;
    }
    return null;
  }

  function hasLineOfSight(ax, ay, az, bx, by, bz) {
    if (ay !== by) return false; // Preserve exact stair/ledge transitions!
    const dx = bx - ax;
    const dz = bz - az;
    const steps = Math.max(Math.abs(dx), Math.abs(dz)) * 3;
    if (steps <= 1) return true;
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      const fx = ax + 0.5 + dx * t;
      const fz = az + 0.5 + dz * t;
      // Check sample footprint with slight radius padding (0.28) so string-pulling never clips corners
      for (const ox of [-0.26, 0.26]) {
        for (const oz of [-0.26, 0.26]) {
          const cx = Math.floor(fx + ox);
          const cz = Math.floor(fz + oz);
          if (!isWalkable(cx, ay, cz)) return false;
        }
      }
    }
    return true;
  }

  function stringPull(cells) {
    if (cells.length <= 2) return cells;
    const out = [cells[0]];
    let anchor = 0;
    while (anchor < cells.length - 1) {
      let next = anchor + 1;
      for (let probe = cells.length - 1; probe > anchor + 1; probe--) {
        const a = cells[anchor];
        const b = cells[probe];
        if (hasLineOfSight(a.bx, a.y, a.bz, b.bx, b.y, b.bz)) {
          next = probe;
          break;
        }
      }
      out.push(cells[next]);
      anchor = next;
    }
    return out;
  }

  function runAStar(startSnap, goalSnap) {
    const sx = Math.floor(startSnap.x);
    const sz = Math.floor(startSnap.z);
    const sy = startSnap.y;
    const gx = Math.floor(goalSnap.x);
    const gz = Math.floor(goalSnap.z);
    const gy = goalSnap.y;

    const bounds = areaBounds(sx, sz);
    if (gx < bounds.x0 || gx >= bounds.x1 || gz < bounds.z0 || gz >= bounds.z1) {
      return null; // Different area pocket (require portal transition)
    }

    if (sx === gx && sz === gz && Math.abs(sy - gy) <= 2) {
      return [{ x: goalSnap.x, y: gy, z: goalSnap.z }];
    }

    searchId = (searchId + 1) >>> 0;
    if (searchId === 0) {
      visitedTag.fill(0);
      closedTag.fill(0);
      searchId = 1;
    }
    const tag = searchId;

    let heapLen = 0;
    const heapPush = (idx) => {
      let i = heapLen++;
      heap[i] = idx;
      const f = fScore[idx];
      while (i > 0) {
        const p = (i - 1) >> 1;
        if (fScore[heap[p]] <= f) break;
        heap[i] = heap[p];
        i = p;
      }
      heap[i] = idx;
    };
    const heapPop = () => {
      const top = heap[0];
      const last = heap[--heapLen];
      if (heapLen > 0) {
        let i = 0;
        const f = fScore[last];
        const half = heapLen >> 1;
        while (i < half) {
          let l = (i << 1) + 1;
          const r = l + 1;
          if (r < heapLen && fScore[heap[r]] < fScore[heap[l]]) l = r;
          if (f <= fScore[heap[l]]) break;
          heap[i] = heap[l];
          i = l;
        }
        heap[i] = last;
      }
      return top;
    };

    const octile = (x, z) => {
      const dx = Math.abs(x - gx);
      const dz = Math.abs(z - gz);
      return dx > dz ? dx + 0.41421356 * dz : dz + 0.41421356 * dx;
    };

    const startIdx = sx * WZ + sz;
    const goalIdx = gx * WZ + gz;
    visitedTag[startIdx] = tag;
    gScore[startIdx] = 0;
    fScore[startIdx] = octile(sx, sz);
    parentIdx[startIdx] = -1;
    nodeY[startIdx] = sy;
    heapPush(startIdx);

    let expansions = 0;
    const MAX_EXPANSIONS = 4200;

    while (heapLen > 0 && expansions < MAX_EXPANSIONS) {
      const cur = heapPop();
      if (closedTag[cur] === tag) continue;
      closedTag[cur] = tag;
      expansions++;

      if (cur === goalIdx) {
        break;
      }

      const cx = (cur / WZ) | 0;
      const cz = cur - cx * WZ;
      const cy = nodeY[cur];
      const cg = gScore[cur];

      for (let d = 0; d < 8; d++) {
        const dir = DIRS[d];
        const nx = cx + dir[0];
        const nz = cz + dir[1];
        if (nx < bounds.x0 || nx >= bounds.x1 || nz < bounds.z0 || nz >= bounds.z1) continue;

        const nIdx = nx * WZ + nz;
        if (closedTag[nIdx] === tag) continue;

        // Find valid transition: step-up <= 1, drop <= 2
        let ny = -1;
        if (isWalkable(nx, cy, nz)) {
          ny = cy;
        } else if (cy + 1 < WY - 1 && isWalkable(nx, cy + 1, nz) && isWalkable(cx, cy, cz)) {
          // Ensure head clearance when stepping up 1 block
          ny = cy + 1;
        } else if (cy - 1 >= 1 && isWalkable(nx, cy - 1, nz)) {
          ny = cy - 1;
        } else if (cy - 2 >= 1 && isWalkable(nx, cy - 2, nz)) {
          ny = cy - 2;
        }
        if (ny === -1) continue;

        // Prevent diagonal corner-cutting and diagonal ledge jumps
        if (d >= 4) {
          if (ny !== cy) continue;
          if (!isWalkable(cx + dir[0], cy, cz) || !isWalkable(cx, cy, cz + dir[1])) continue;
        }

        const stepPenalty = ny > cy ? 0.35 : ny < cy ? 0.15 * (cy - ny) : 0;
        const ng = cg + dir[2] + stepPenalty;

        if (visitedTag[nIdx] !== tag || ng < gScore[nIdx]) {
          visitedTag[nIdx] = tag;
          gScore[nIdx] = ng;
          fScore[nIdx] = ng + octile(nx, nz);
          parentIdx[nIdx] = cur;
          nodeY[nIdx] = ny;
          heapPush(nIdx);
        }
      }
    }

    if (closedTag[goalIdx] !== tag) return null;

    const raw = [];
    let trace = goalIdx;
    while (trace !== -1) {
      const bx = (trace / WZ) | 0;
      const bz = trace - bx * WZ;
      raw.push({ bx, y: nodeY[trace], bz });
      trace = parentIdx[trace];
    }
    raw.reverse();

    const pulled = stringPull(raw);
    const waypoints = [];
    // Skip index 0 (current cell) if we have >= 2 points so actor moves immediately toward first target
    const startI = pulled.length > 1 ? 1 : 0;
    for (let i = startI; i < pulled.length; i++) {
      const c = pulled[i];
      waypoints.push({ x: c.bx + 0.5, y: c.y, z: c.bz + 0.5 });
    }
    return waypoints;
  }

  function findPath(from, to) {
    if (!from || !to) return null;
    const startSnap = nearestWalkable(from, 6);
    const goalSnap = nearestWalkable(to, 8);
    if (!startSnap || !goalSnap) return null;

    const direct = runAStar(startSnap, goalSnap);
    if (direct) return direct;

    // If goal snapped onto an unreachable rooftop/pillar above startY, retry near startSnap.y
    if (Math.abs(goalSnap.y - startSnap.y) > 2) {
      const groundGoal = nearestWalkable({ x: to.x, y: startSnap.y, z: to.z }, 8);
      if (groundGoal && (groundGoal.x !== goalSnap.x || groundGoal.y !== goalSnap.y || groundGoal.z !== goalSnap.z)) {
        return runAStar(startSnap, groundGoal);
      }
    }
    return null;
  }

  return {
    nearestWalkable,
    findPath,
  };
}
