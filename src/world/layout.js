import { B } from './blocks.js';
import { WX, WY, WZ } from './chunks.js';

function hash2(x, z) {
  let h = (x * 374761393 + z * 668265263) ^ 0x5bd1e995;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export function buildWorldLayout(voxels) {
  voxels.fill(0);

  const set = (x, y, z, id) => {
    if (x < 0 || x >= WX || y < 0 || y >= WY || z < 0 || z >= WZ) return;
    voxels[(x * WZ + z) * WY + y] = id;
  };
  const get = (x, y, z) => {
    if (x < 0 || x >= WX || y < 0 || y >= WY || z < 0 || z >= WZ) return 0;
    return voxels[(x * WZ + z) * WY + y];
  };
  const fill = (x0, y0, z0, x1, y1, z1, id) => {
    for (let x = x0; x <= x1; x++) {
      for (let z = z0; z <= z1; z++) {
        for (let y = y0; y <= y1; y++) {
          set(x, y, z, id);
        }
      }
    }
  };
  const clearAir = (x0, y0, z0, x1, y1, z1) => fill(x0, y0, z0, x1, y1, z1, B.AIR);

  // Keep ocean corner/margin chunks clear so worst-case Hub draw calls stay <= 38!
  const inCornerChunk = (x, z) =>
    (x < 16 && z < 16) ||
    (x >= 80 && z < 16) ||
    (x < 16 && z >= 80) ||
    (x >= 80 && z >= 64);

  // ============================================================================
  // 1. HUB ISLAND BASE (x in [0,96), z in [0,96), ground top y = 8 -> block y = 7)
  // ============================================================================
  for (let x = 6; x < 90; x++) {
    for (let z = 5; z < 89; z++) {
      if (inCornerChunk(x, z)) continue;
      const dx = (x - 48) / 41.5;
      const dz = (z - 47) / 41.5;
      const wob = Math.sin(x * 0.16) * 0.05 + Math.cos(z * 0.15) * 0.05;
      const d = Math.hypot(dx, dz) + wob;
      if (d > 1.02) continue;

      fill(x, 4, z, x, 6, z, B.DIRT);
      if (d > 0.94) {
        set(x, 6, z, B.SAND);
        if (d < 0.98) set(x, 7, z, B.SAND);
      } else {
        set(x, 7, z, B.GRASS);
      }
    }
  }

  // Helper trees
  function placeTree(tx, ty, tz, logId, leafId, height = 5, vines = false) {
    for (let y = ty; y < ty + height; y++) set(tx, y, tz, logId);
    for (let dy = height - 2; dy <= height + 1; dy++) {
      const r = dy >= height ? 1 : 2;
      for (let dx = -r; dx <= r; dx++) {
        for (let dz = -r; dz <= r; dz++) {
          if (Math.abs(dx) === r && Math.abs(dz) === r && dy > height - 2) continue;
          const lx = tx + dx, ly = ty + dy, lz = tz + dz;
          if (get(lx, ly, lz) === B.AIR) set(lx, ly, lz, leafId);
          if (vines && dy === height - 2 && (Math.abs(dx) === r || Math.abs(dz) === r) && hash2(lx, lz) < 0.45) {
            for (let vy = 1; vy <= 2; vy++) {
              if (get(lx, ly - vy, lz) === B.AIR) set(lx, ly - vy, lz, B.VINES);
            }
          }
        }
      }
    }
  }

  function placeSpruce(tx, ty, tz) {
    for (let y = ty; y < ty + 6; y++) set(tx, y, tz, B.SPRUCE_LOG);
    const radii = [
      [2, 2], [3, 1], [4, 2], [5, 1], [6, 0],
    ];
    for (const [dy, r] of radii) {
      for (let dx = -r; dx <= r; dx++) {
        for (let dz = -r; dz <= r; dz++) {
          if (r === 2 && Math.abs(dx) === 2 && Math.abs(dz) === 2) continue;
          if (get(tx + dx, ty + dy, tz + dz) === B.AIR) {
            set(tx + dx, ty + dy, tz + dz, B.SPRUCE_LEAVES);
          }
        }
      }
    }
  }

  // ============================================================================
  // 2. PLAZA, TIER WALL, RUNWAY, BLEACHERS, STAGE & CAPES PODIUM (Centre 48, 48)
  // ============================================================================
  // Plaza quartz & smooth stone floor
  for (let x = 34; x <= 62; x++) {
    for (let z = 36; z <= 63; z++) {
      const dist = Math.hypot((x - 48) * 0.84, (z - 49) * 0.8);
      if (dist <= 13.0) {
        set(x, 7, z, (x + z) % 5 === 0 ? B.SMOOTH_STONE : B.QUARTZ);
      }
    }
  }

  // Tier Wall on north edge: x 41..55, z 38, 10 blocks high (by = 8..17), facing south (+z)
  const tierBlockPairs = [
    [8, B.CONCRETE_TRYHARD, B.LABEL_TRYHARD],
    [10, B.CONCRETE_OKAY, B.LABEL_OKAY],
    [12, B.CONCRETE_PRETTY, B.LABEL_PRETTY],
    [14, B.CONCRETE_GORGEOUS, B.LABEL_GORGEOUS],
    [16, B.CONCRETE_PERFECT, B.LABEL_PERFECT],
  ];
  for (const [y0, concId, lblId] of tierBlockPairs) {
    for (let y = y0; y <= y0 + 1; y++) {
      for (let x = 41; x <= 55; x++) {
        set(x, y, 38, x <= 42 ? lblId : concId);
      }
    }
  }
  // Quartz framing pillars behind wall at z = 37 so z = 39..40 stays wide open for capes!
  fill(40, 8, 37, 40, 17, 37, B.QUARTZ);
  fill(56, 8, 37, 56, 17, 37, B.QUARTZ);

  // Red-caped "?" mystery figure podium strips flanking the wall (matches chars/capes.js x=36.2..40.8 & 55.2..59.8, z=39.6)
  const capeSpots = [];
  for (let i = 0; i < 5; i++) {
    const lx = 36 + i;
    const rx = 55 + i;
    set(lx, 7, 39, B.GOLD_BLOCK);
    set(lx, 7, 40, B.GOLD_BLOCK);
    set(rx, 7, 39, B.GOLD_BLOCK);
    set(rx, 7, 40, B.GOLD_BLOCK);
    capeSpots.push({ x: 36.2 + i * 1.15, y: 8, z: 39.6 }, { x: 55.2 + i * 1.15, y: 8, z: 39.6 });
  }

  // Runway: pink/white wool from (48,50) to (48,58)
  for (let z = 49; z <= 58; z++) {
    set(46, 7, z, B.GOLD_BLOCK);
    set(50, 7, z, B.GOLD_BLOCK);
    for (let x = 47; x <= 49; x++) {
      set(x, 7, z, (x + z) % 2 === 0 ? B.WOOL_PINK : B.WOOL_WHITE);
    }
  }

  // Crowd bleachers both sides matching core/main.js buildBleacherSeats() (x=43.6/42.4 and 52.4/53.6, y=8.6/9.4, z=50..58)!
  const bleacherSeats = [];
  for (let z = 50; z <= 58; z++) {
    // West bleachers: bx=43 top=8.6, bx=42 top=9.4
    set(43, 8, z, B.BLEACHER_LOW);
    set(42, 8, z, B.PLANKS);
    set(42, 9, z, B.BLEACHER_HIGH);
    // East bleachers: bx=52 top=8.6, bx=53 top=9.4
    set(52, 8, z, B.BLEACHER_LOW);
    set(53, 8, z, B.PLANKS);
    set(53, 9, z, B.BLEACHER_HIGH);
  }
  for (let z = 50; z <= 58; z += 1.6) {
    bleacherSeats.push(
      { x: 43.6, y: 8.6, z, yaw: Math.PI / 2 },
      { x: 42.4, y: 9.4, z, yaw: Math.PI / 2 },
      { x: 52.4, y: 8.6, z, yaw: -Math.PI / 2 },
      { x: 53.6, y: 9.4, z, yaw: -Math.PI / 2 },
    );
  }

  // Photo stage + festive flower pillars at (48, 59) — wide open center so spawn sightline to Tier Wall is crystal clear!
  fill(45, 7, 58, 51, 7, 61, B.QUARTZ);
  set(47, 7, 59, B.WOOL_PINK);
  set(48, 7, 59, B.GOLD_BLOCK);
  set(49, 7, 59, B.WOOL_PINK);
  // Twin floral arch pillars on outer edges of stage (x=44 and x=52)
  for (const ax of [44, 52]) {
    fill(ax, 8, 59, ax, 10, 59, B.QUARTZ);
    set(ax, 11, 59, B.OAK_LEAVES);
    set(ax, 12, 59, B.POPPY);
    set(ax, 8, 60, B.GLOWSTONE);
  }

  // Cobblestone / sand radial garden paths connecting plaza to all hub biomes
  const paveRoad = (x0, z0, x1, z1, blockId = B.SAND) => {
    const steps = Math.max(Math.abs(x1 - x0), Math.abs(z1 - z0)) * 2;
    for (let i = 0; i <= steps; i++) {
      const cx = Math.round(x0 + ((x1 - x0) * i) / steps);
      const cz = Math.round(z0 + ((z1 - z0) * i) / steps);
      for (let dx = -1; dx <= 1; dx++) {
        for (let dz = -1; dz <= 1; dz++) {
          const px = cx + dx, pz = cz + dz;
          if (!inCornerChunk(px, pz) && get(px, 7, pz) === B.GRASS) {
            set(px, 7, pz, blockId);
          }
        }
      }
    }
  };
  paveRoad(48, 62, 48, 74, B.SAND);       // South ->Spawn & Meadow
  paveRoad(57, 44, 70, 25, B.COBBLE);     // NE -> Village Square
  paveRoad(58, 48, 78, 46, B.COBBLE);     // East -> Cave
  paveRoad(56, 56, 68, 66, B.SAND);       // SE -> Swamp
  paveRoad(48, 36, 48, 22, B.STONE_BRICKS); // North -> Snow
  paveRoad(39, 41, 22, 25, B.STONE_BRICKS); // NW -> Portal Shrine
  paveRoad(38, 46, 24, 45, B.SAND);       // West -> Kai House
  paveRoad(38, 54, 26, 64, B.COBBLE);     // SW -> Clearing & Prison & Jungle

  // ============================================================================
  // 3. S FLOWER MEADOW & BEEHIVE (34..62, 68..86)
  // ============================================================================
  const meadowFlowers = [B.POPPY, B.DANDELION, B.CORNFLOWER, B.ALLIUM, B.WHITE_TULIP];
  for (let x = 35; x <= 61; x++) {
    for (let z = 69; z <= 85; z++) {
      // Leave clear zone around spawn (48,66) and hive ring (40,76)
      if (Math.hypot(x - 48, z - 66) < 4.5) continue;
      if (Math.hypot(x - 40, z - 76) < 5.5) continue;
      if (get(x, 7, z) === B.GRASS && get(x, 8, z) === B.AIR && hash2(x, z) < 0.14) {
        set(x, 8, z, meadowFlowers[(Math.floor(hash2(x + 11, z + 7) * meadowFlowers.length))]);
      }
    }
  }
  // Oak tree at (40, 8, 80) with Beehive hanging on south/north accessible face!
  placeTree(40, 8, 80, B.OAK_LOG, B.OAK_LEAVES, 5, false);
  set(40, 9, 79, B.BEEHIVE); // Facing south/north next to trunk at (40, 80)
  set(41, 8, 80, B.BEEHIVE); // Ground-accessible beehive block too!
  // Honey-block patch near hive where 小凯 gets stuck (video 4:45)
  fill(44, 7, 78, 46, 7, 80, B.HONEY_BLOCK);
  // 6 colored flower clumps in a ring around (40, 75) for Quest 7 Simon-says
  const beeRing = [
    [40, 72, B.POPPY],
    [43, 73, B.DANDELION],
    [43, 76, B.CORNFLOWER],
    [40, 77, B.ALLIUM],
    [37, 76, B.PINK_TULIP],
    [37, 73, B.WHITE_TULIP],
  ];
  for (const [fx, fz, fid] of beeRing) {
    set(fx, 7, fz, B.GRASS);
    set(fx, 8, fz, fid);
  }
  placeTree(57, 8, 78, B.OAK_LOG, B.OAK_LEAVES, 5, false);

  // ============================================================================
  // 4. SE SWAMP (62..82, 58..78) — dark water, lily pads, vines
  // ============================================================================
  for (let x = 64; x <= 79; x++) {
    for (let z = 60; z <= 77; z++) {
      if (inCornerChunk(x, z)) continue;
      const d1 = Math.hypot(x - 73, z - 66);
      const d2 = Math.hypot(x - 68, z - 73);
      // Leave walkable arena around poi.swamp (69..71, 68..70) and bridges
      const onWalkway = Math.hypot(x - 69, z - 68) <= 3.2 || z === 68 || x === 69;
      if (!onWalkway && (d1 < 4.5 || d2 < 3.8)) {
        set(x, 6, z, B.DIRT);
        set(x, 7, z, B.SWAMP_WATER);
        clearAir(x, 8, z, x, 10, z);
        if (hash2(x * 3, z * 5) < 0.32) {
          set(x, 8, z, B.LILY_PAD);
        }
      }
    }
  }
  placeTree(77, 8, 62, B.OAK_LOG, B.OAK_LEAVES, 5, true);
  placeTree(65, 8, 76, B.OAK_LOG, B.OAK_LEAVES, 5, true);
  placeTree(78, 8, 74, B.OAK_LOG, B.OAK_LEAVES, 5, true);

  // ============================================================================
  // 5. E STONE HILL + CAVE (75..88, 41..52) — lit cave room with iron ore
  // ============================================================================
  for (let x = 76; x <= 88; x++) {
    for (let z = 41; z <= 51; z++) {
      const h = Math.min(14, Math.floor(8 + (x - 75) * 0.7 - Math.abs(z - 46) * 0.45));
      if (h >= 8) {
        fill(x, 7, z, x, h, z, (x + z) % 4 === 0 ? B.COBBLE : B.STONE);
      }
    }
  }
  // Carve wide, bright cave mouth at x=76..85, z=44..48, y=8..11
  clearAir(76, 8, 44, 84, 11, 48);
  fill(76, 7, 44, 85, 7, 48, B.STONE);
  // Iron ore veins clearly visible & reachable inside cave!
  const ironOreSpots = [
    { x: 83, y: 8, z: 44 },
    { x: 84, y: 8, z: 46 },
    { x: 83, y: 8, z: 48 },
    { x: 85, y: 9, z: 45 },
    { x: 85, y: 9, z: 47 },
  ];
  for (const p of ironOreSpots) {
    set(p.x, p.y, p.z, B.IRON_ORE);
  }
  set(80, 11, 46, B.GLOWSTONE);
  set(84, 11, 46, B.GLOWSTONE);
  set(78, 8, 44, B.TORCH);
  set(78, 8, 48, B.TORCH);

  // ============================================================================
  // 6. NE VILLAGE (60..88, 16..36): Houses, Farm, Bela's Statue, Bank, Stall, Altar, Pumpkins
  // ============================================================================
  // Village central cobblestone square
  fill(66, 7, 22, 79, 7, 33, B.COBBLE);

  // Cozy Village House Builder
  function buildCottage(x0, z0, w, d, roofBlock = B.PLANKS, doorSide = 'south') {
    fill(x0, 7, z0, x0 + w - 1, 7, z0 + d - 1, B.PLANKS);
    for (let x = x0; x < x0 + w; x++) {
      for (let z = z0; z < z0 + d; z++) {
        const edgeX = x === x0 || x === x0 + w - 1;
        const edgeZ = z === z0 || z === z0 + d - 1;
        if (!edgeX && !edgeZ) continue;
        const corner = edgeX && edgeZ;
        for (let y = 8; y <= 10; y++) {
          set(x, y, z, corner ? B.OAK_LOG : B.PLANKS);
        }
      }
    }
    // Windows
    set(x0, 9, z0 + Math.floor(d / 2), B.GLASS);
    set(x0 + w - 1, 9, z0 + Math.floor(d / 2), B.GLASS);
    // Pitched roof
    fill(x0 - 1, 11, z0 - 1, x0 + w, 11, z0 + d, roofBlock);
    fill(x0, 12, z0, x0 + w - 1, 12, z0 + d - 1, roofBlock);
    // Doorway (2 blocks tall air)
    const mx = x0 + Math.floor(w / 2);
    const mz = z0 + Math.floor(d / 2);
    if (doorSide === 'south') clearAir(mx, 8, z0 + d - 1, mx, 9, z0 + d - 1);
    else if (doorSide === 'west') clearAir(x0, 8, mz, x0, 9, mz);
    else if (doorSide === 'north') clearAir(mx, 8, z0, mx, 9, z0);
    // Interior bookshelf + glowstone lamp
    set(x0 + 1, 8, z0 + 1, B.BOOKSHELF);
    set(mx, 10, mz, B.GLOWSTONE);
  }

  // House 1 (NW of village square)
  buildCottage(61, 17, 5, 5, B.PLANKS, 'south');
  // House 2 (North of village square)
  buildCottage(68, 16, 5, 5, B.PLANKS, 'south');
  // House 3: Bela's orange-roofed cottage (video 1:20) near her iron statue!
  buildCottage(62, 29, 5, 5, B.TERRACOTTA_ORANGE, 'north');

  // Farm plot with wheat & hay bales (x: 61..65, z: 23..27)
  fill(61, 7, 23, 64, 7, 26, B.FARMLAND);
  fill(62, 7, 24, 63, 7, 24, B.WATER);
  for (let x = 61; x <= 64; x++) {
    for (let z = 23; z <= 26; z++) {
      if (get(x, 7, z) === B.FARMLAND) set(x, 8, z, B.WHEAT);
    }
  }
  set(60, 8, 25, B.HAY);
  set(60, 8, 26, B.HAY);
  set(60, 9, 25, B.HAY);

  // Bela's Iron Statue at (70, 8, 30) — cute giant blocky iron fox/golem like video 1:20!
  fill(69, 7, 29, 71, 7, 31, B.STONE_BRICKS);
  fill(69, 8, 30, 71, 12, 30, B.IRON_BLOCK);
  // Cute ears on top
  set(69, 13, 30, B.IRON_BLOCK);
  set(71, 13, 30, B.IRON_BLOCK);
  // Obsidian eyes + protruding iron nose on south face (z=31)
  set(69, 11, 30, B.OBSIDIAN);
  set(71, 11, 30, B.OBSIDIAN);
  set(70, 10, 31, B.IRON_BLOCK); // Protruding nose that falls off in quest 4!

  // Iron Altar at (66, 8, 26)
  fill(65, 7, 25, 67, 7, 27, B.STONE_BRICKS);
  set(66, 7, 26, B.QUARTZ);

  // Market Stall at (74, 8, 23)
  fill(73, 8, 22, 75, 8, 22, B.PLANKS);
  set(73, 9, 22, B.OAK_LOG); set(73, 10, 22, B.OAK_LOG);
  set(75, 9, 22, B.OAK_LOG); set(75, 10, 22, B.OAK_LOG);
  for (let x = 73; x <= 75; x++) {
    for (let z = 21; z <= 23; z++) {
      set(x, 11, z, (x + z) % 2 === 0 ? B.WOOL_PINK : B.WOOL_WHITE);
    }
  }

  // Pumpkin Patch at (77..80, 8, 17..21) — stays x < 80 where z < 16!
  for (const [px, pz, id] of [
    [77, 19, B.PUMPKIN],
    [79, 19, B.CARVED_PUMPKIN],
    [78, 21, B.PUMPKIN],
    [80, 20, B.PUMPKIN],
    [77, 21, B.PUMPKIN],
  ]) {
    set(px, 7, pz, B.GRASS);
    set(px, 8, pz, id);
  }

  // 小凯 Bank at (81..88, 8..13, 26..34) — Quartz facade, giant GOLD_BLOCK '$' sign (video 9:35), Emerald blocks, Passcode Chest!
  fill(81, 7, 26, 88, 7, 34, B.QUARTZ);
  for (let x = 81; x <= 88; x++) {
    for (let z = 26; z <= 34; z++) {
      const edge = x === 81 || x === 88 || z === 26 || z === 34;
      if (!edge) continue;
      for (let y = 8; y <= 12; y++) {
        set(x, y, z, (y === 12) ? B.STONE_BRICKS : B.QUARTZ);
      }
    }
  }
  fill(81, 13, 26, 88, 13, 34, B.STONE_BRICKS);
  // Wide open Bank entrance facing west (x=81, z=28..32, y=8..10) with Emerald columns!
  clearAir(81, 8, 28, 81, 10, 32);
  fill(81, 8, 28, 81, 11, 28, B.EMERALD_BLOCK);
  fill(81, 8, 32, 81, 11, 32, B.EMERALD_BLOCK);
  // Giant golden '$' emblem above west facade (x=81, y=13..19, z=29..31) + south roof sign!
  fill(81, 13, 28, 81, 19, 32, B.OBSIDIAN);
  const dollarCoords = [
    [19, 30],
    [18, 29], [18, 30], [18, 31],
    [17, 29], [17, 30],
    [16, 29], [16, 30], [16, 31],
    [15, 30], [15, 31],
    [14, 29], [14, 30], [14, 31],
    [13, 30],
  ];
  for (const [dy, dz] of dollarCoords) {
    set(81, dy, dz, B.GOLD_BLOCK);
  }
  fill(83, 13, 34, 87, 19, 34, B.OBSIDIAN);
  for (const [dy, dz] of dollarCoords) {
    const sx = 85 + (dz - 30);
    set(sx, dy, 34, B.GOLD_BLOCK);
  }
  // Inside Bank: Emerald block stacks visible right through entrance, Glowstone chandeliers, Passcode Chest, and Corner 3-color clue!
  set(84, 12, 30, B.GLOWSTONE);
  set(86, 12, 30, B.GLOWSTONE);
  fill(84, 8, 32, 87, 9, 33, B.EMERALD_BLOCK);
  set(85, 10, 33, B.EMERALD_BLOCK);
  set(87, 10, 33, B.EMERALD_BLOCK);
  fill(84, 8, 27, 85, 9, 27, B.EMERALD_BLOCK);
  // Passcode Chest at (86, 8, 30) facing south/west
  set(86, 8, 30, B.CHEST);
  // Hidden passcode clue in NE corner of Bank (x=87, z=27, y=8..10): 3 colored concrete blocks!
  set(87, 10, 27, B.CONCRETE_PERFECT);
  set(87, 9, 27, B.CONCRETE_PRETTY);
  set(87, 8, 27, B.CONCRETE_TRYHARD);

  // ============================================================================
  // 7. N SNOWY POCKET & SNOWBALL ARENA (36..60, 6..25)
  // ============================================================================
  for (let x = 35; x <= 61; x++) {
    for (let z = 6; z <= 25; z++) {
      if (get(x, 7, z) !== B.AIR) {
        set(x, 7, z, B.SNOW);
      }
    }
  }
  // Frozen Ice Pond (38..43, 14..19)
  for (let x = 38; x <= 43; x++) {
    for (let z = 14; z <= 19; z++) {
      if (Math.hypot(x - 40.5, z - 16.5) <= 2.9) {
        set(x, 7, z, B.ICE);
      }
    }
  }
  // Ice backdrop ridges like video 2:55!
  for (let x = 44; x <= 56; x++) {
    const ih = 10 + ((x * 3) % 4);
    fill(x, 8, 7, x, ih, 7, x % 2 === 0 ? B.ICE : B.SNOW);
  }
  // Snowball Arena: 小凯's snow wall at z = 12, x = 47..53, y = 8..9
  for (let x = 47; x <= 53; x++) {
    set(x, 8, 12, B.SNOW);
    if (x % 2 === 1) set(x, 9, 12, B.SNOW);
  }
  // Decorative block snowmen (2 snow + carved pumpkin head, video 3:00)
  set(44, 8, 19, B.SNOW); set(44, 9, 19, B.SNOW); set(44, 10, 19, B.CARVED_PUMPKIN);
  set(56, 8, 18, B.SNOW); set(56, 9, 18, B.SNOW); set(56, 10, 18, B.CARVED_PUMPKIN);
  placeSpruce(37, 8, 11);
  placeSpruce(58, 8, 12);
  placeSpruce(57, 8, 22);

  // ============================================================================
  // 8. NW PORTAL SHRINE (10..30, 16..34): End Portal (20,18) & Nether Portal (12,30)
  // ============================================================================
  fill(16, 7, 16, 26, 7, 26, B.STONE_BRICKS);
  fill(10, 7, 27, 16, 7, 33, B.STONE_BRICKS);
  paveRoad(20, 24, 13, 30, B.STONE_BRICKS);

  // End Portal Frame at (20, 18) — 5x5 ring flush at y=7 so player walks straight onto (20.5, 8, 18.5)!
  for (let dx = -2; dx <= 2; dx++) {
    for (let dz = -2; dz <= 2; dz++) {
      if (Math.abs(dx) === 2 && Math.abs(dz) === 2) continue;
      if (Math.abs(dx) === 2 || Math.abs(dz) === 2) {
        set(20 + dx, 7, 18 + dz, B.END_PORTAL_FRAME);
      } else {
        set(20 + dx, 7, 18 + dz, B.OBSIDIAN);
      }
    }
  }
  // Shrine corner lanterns
  set(17, 8, 16, B.QUARTZ); set(17, 9, 16, B.GLOWSTONE);
  set(23, 8, 16, B.QUARTZ); set(23, 9, 16, B.GLOWSTONE);

  // Nether Portal Obsidian Arch at (12.5, 8, 30.5) — 4 wide x 6 tall, walkable 2x4 inner opening (x=12..13, y=8..11)
  fill(11, 7, 30, 14, 7, 30, B.OBSIDIAN);
  fill(11, 8, 30, 11, 12, 30, B.OBSIDIAN);
  fill(14, 8, 30, 14, 12, 30, B.OBSIDIAN);
  fill(11, 12, 30, 14, 12, 30, B.OBSIDIAN);
  clearAir(12, 8, 30, 13, 11, 30);

  // ============================================================================
  // 9. W KAI'S PRISMARINE HOUSE (12..22, 40..49) & LAVA-RING PRISON (centre 16, 66)
  // ============================================================================
  fill(12, 7, 40, 21, 7, 49, B.PLANKS);
  // Sticky honey-block floor inside Kai's house (video 4:45)
  fill(14, 7, 43, 18, 7, 46, B.HONEY_BLOCK);
  for (let x = 12; x <= 21; x++) {
    for (let z = 40; z <= 49; z++) {
      const edgeX = x === 12 || x === 21;
      const edgeZ = z === 40 || z === 49;
      if (!edgeX && !edgeZ) continue;
      const corner = edgeX && edgeZ;
      for (let y = 8; y <= 11; y++) {
        set(x, y, z, corner ? B.OAK_LOG : B.PRISMARINE);
      }
    }
  }
  fill(12, 12, 40, 21, 12, 49, B.PRISMARINE);
  fill(14, 13, 42, 19, 13, 47, B.PRISMARINE);
  // Glass windows + east doorway (x=21, z=44..45) + vines like video 4:20
  clearAir(21, 8, 44, 21, 10, 45);
  fill(15, 9, 40, 18, 10, 40, B.GLASS);
  fill(15, 9, 49, 18, 10, 49, B.GLASS);
  set(22, 9, 42, B.VINES); set(22, 10, 42, B.VINES);
  set(22, 9, 47, B.VINES); set(22, 10, 47, B.VINES);
  set(16, 11, 44, B.GLOWSTONE);

  // Lava-Ring Prison centered at (16, 66), r ~= 8 (video 5:15)
  for (let x = 7; x <= 25; x++) {
    for (let z = 57; z <= 75; z++) {
      const r = Math.hypot(x - 16, z - 66);
      if (r <= 8.6) {
        clearAir(x, 8, z, x, 14, z);
        if (r > 7.3) {
          set(x, 7, z, B.OBSIDIAN);
          // Low outer obsidian parapet except east entrance gap (x >= 23, |z - 66| <= 1)
          if (!(x >= 22 && Math.abs(z - 66) <= 1)) {
            set(x, 8, z, B.OBSIDIAN);
          }
        } else if (r > 4.6) {
          set(x, 6, z, B.OBSIDIAN);
          set(x, 7, z, B.LAVA);
        } else {
          set(x, 7, z, B.OBSIDIAN);
        }
      }
    }
  }
  // 3 stepping stone sockets across east lava moat (x = 23, 22, 21 at z = 66)
  const prisonStones = [
    { x: 23, y: 7, z: 66 },
    { x: 22, y: 7, z: 66 },
    { x: 21, y: 7, z: 66 },
  ];
  for (const s of prisonStones) {
    set(s.x, s.y, s.z, B.OBSIDIAN);
  }
  // Obsidian gate arch + 2 cobwebs at the inner gate (x = 20, z = 65..66)
  set(20, 8, 64, B.OBSIDIAN); set(20, 9, 64, B.OBSIDIAN); set(20, 10, 64, B.OBSIDIAN);
  set(20, 8, 67, B.OBSIDIAN); set(20, 9, 67, B.OBSIDIAN); set(20, 10, 67, B.OBSIDIAN);
  fill(20, 10, 64, 20, 10, 67, B.OBSIDIAN);
  set(20, 8, 66, B.COBWEB);
  set(20, 8, 65, B.COBWEB);

  // Central Obsidian + Iron Bars Cell inside prison courtyard (x = 13..15, z = 65..67)
  // Courtyard ring around cell (r ~ 3..4.5) stays wide open so Kai can patrol!
  for (let x = 13; x <= 15; x++) {
    for (let z = 65; z <= 67; z++) {
      set(x, 11, z, B.OBSIDIAN);
      const edge = x === 13 || x === 15 || z === 65 || z === 67;
      if (!edge) continue;
      const corner = (x === 13 || x === 15) && (z === 65 || z === 67);
      for (let y = 8; y <= 10; y++) {
        if (x === 15 && z === 66 && y <= 9) {
          // East cell door (iron bars, 3 taps in q_ender!)
          set(x, y, z, B.IRON_BARS);
        } else {
          set(x, y, z, corner ? B.OBSIDIAN : B.IRON_BARS);
        }
      }
    }
  }
  set(14, 10, 66, B.GLOWSTONE);

  // ============================================================================
  // 10. SW JUNGLE (16..35, 69..87), CREEPER CLEARING (26, 58) & PINK TULIP (W3)
  // ============================================================================
  const segDist2D = (px, pz, ax, az, bx, bz) => {
    const vx = bx - ax, vz = bz - az;
    const len2 = vx * vx + vz * vz;
    const t = len2 > 0 ? Math.max(0, Math.min(1, ((px - ax) * vx + (pz - az) * vz) / len2)) : 0;
    return Math.hypot(px - (ax + vx * t), pz - (az + vz * t));
  };

  // Bulge SW peninsula lobe so entire SW Jungle sits on lush solid ground (staying x >= 16 so chunk (0,5) stays empty!)
  for (let x = 16; x <= 35; x++) {
    for (let z = 69; z <= 88; z++) {
      if (inCornerChunk(x, z)) continue;
      if (Math.hypot(x - 16, z - 66) <= 8.9) continue; // preserve lava-ring prison
      const nd = Math.hypot((x - 25.8) / 10.6, (z - 78.2) / 10.2) + Math.sin(x * 0.45 + z * 0.35) * 0.04;
      if (nd <= 1.04 && get(x, 7, z) === B.AIR) {
        fill(x, 4, z, x, 6, z, B.DIRT);
        set(x, 7, z, nd > 0.96 ? B.SAND : B.GRASS);
      } else if (nd <= 0.94 && get(x, 7, z) === B.SAND) {
        set(x, 7, z, B.GRASS);
      }
    }
  }

  // Creeper clearing around (27.5, 58.5) — keeps all backoff, shuffle & chicken orbit spots open
  for (let x = 22; x <= 32; x++) {
    for (let z = 54; z <= 63; z++) {
      if (get(x, 7, z) !== B.AIR && Math.hypot(x - 27.2, z - 58.5) < 5.3) {
        set(x, 7, z, B.GRASS);
        clearAir(x, 8, z, x, 12, z);
      }
    }
  }

  // Protected walkable SW Jungle clearings + connected jungle trails (#172 W3 & #176 Q1 exact sync)
  const jungleClearings = [
    [27.2, 58.5, 5.4], // Creeper clearing
    [28.5, 66.5, 2.8], // Cat trailhead & prison east approach
    [25.5, 66.5, 2.4], // poi.prison
    [21.5, 77.5, 2.3], // Q1 cat perch 3
    [20.5, 81.5, 2.3], // Q1 cat perch 1
    [22.0, 74.0, 2.4], // NW jungle clearing
    [24.5, 76.0, 2.2], // Central poi.jungle clearing (north of log 23..25,77)
    [26.5, 78.5, 1.8], // Companion cat 2 clearing between logs
    [29.5, 81.5, 2.3], // Q1 cat perch 4
    [31.5, 80.5, 2.2], // Q1 cat perch 2
    [31.5, 82.5, 2.3], // Q1 cat perch 0
    [33.5, 72.5, 2.5], // H2 pinkTulip & Kai cameo edge
    [40.0, 75.0, 4.6], // Quest 7 bee flower ring guard
  ];
  const jungleTrails = [
    [28.5, 66.5, 22.5, 74.0, 1.6],
    [22.5, 74.0, 24.5, 76.0, 1.6],
    [22.5, 74.0, 21.5, 77.5, 1.6],
    [21.5, 77.5, 20.5, 81.5, 1.6],
    [20.5, 81.5, 29.5, 81.8, 1.55],
    [26.5, 78.5, 31.5, 80.5, 1.55],
    [31.5, 80.5, 33.5, 72.5, 1.6],
    [33.5, 72.5, 28.5, 66.5, 1.55],
  ];
  const isJungleWalkZone = (px, pz) => {
    if (Math.hypot(px - 16, pz - 66) <= 9.1) return true; // never intrude on prison
    for (const [cx, cz, cr] of jungleClearings) {
      if (Math.hypot(px + 0.5 - cx, pz + 0.5 - cz) <= cr) return true;
    }
    for (const [ax, az, bx, bz, hw] of jungleTrails) {
      if (segDist2D(px + 0.5, pz + 0.5, ax, az, bx, bz) <= hw) return true;
    }
    return false;
  };

  // Subtle mossy cobblestone stepping stones along the SW Jungle trails
  for (let x = 18; x <= 34; x++) {
    for (let z = 67; z <= 84; z++) {
      if (inCornerChunk(x, z) || Math.hypot(x - 16, z - 66) <= 9.1) continue;
      for (const [ax, az, bx, bz] of jungleTrails) {
        if (segDist2D(x + 0.5, z + 0.5, ax, az, bx, bz) <= 0.72 && get(x, 7, z) === B.GRASS) {
          if ((x * 5 + z * 3) % 4 === 0) set(x, 7, z, B.COBBLE);
        }
      }
    }
  }

  // Towering 2x2-trunk MC Giant Jungle Trees with multi-tier canopies, hanging vines & South/side cocoa pods!
  function placeGiantJungleTree(tx, ty, tz, height = 10, canopyScale = 1.0) {
    // 2x2 thick JUNGLE_LOG trunk
    for (let dx = 0; dx <= 1; dx++) {
      for (let dz = 0; dz <= 1; dz++) {
        const lx = tx + dx, lz = tz + dz;
        if (inCornerChunk(lx, lz) || isJungleWalkZone(lx, lz)) continue;
        set(lx, 7, lz, B.DIRT);
        for (let y = ty; y < ty + height; y++) {
          set(lx, y, lz, B.JUNGLE_LOG);
        }
      }
    }
    // Hanging orange MC Cocoa pods at eye/camera level (y = ty+2..ty+3) on South (+Z) & side bark faces!
    const cocoaSpots = [
      [tx, ty + 2, tz + 2],
      [tx + 1, ty + 3, tz + 2],
      [tx - 1, ty + 2, tz + 1],
      [tx + 2, ty + 3, tz],
      [tx + 1, ty + 2, tz - 1],
    ];
    for (const [cx, cy, cz] of cocoaSpots) {
      if (!inCornerChunk(cx, cz) && get(cx, cy, cz) === B.AIR && hash2(cx * 3 + 1, cz * 7 + 2) < 0.85) {
        set(cx, cy, cz, B.COCOA);
      }
    }
    // Trunk vines clinging to bark below canopy
    const trunkVines = [
      [tx - 1, tz], [tx + 2, tz + 1], [tx, tz - 1], [tx + 1, tz + 2],
    ];
    for (const [vx, vz] of trunkVines) {
      if (inCornerChunk(vx, vz)) continue;
      for (let y = ty + 3; y < ty + height - 2; y++) {
        if (get(vx, y, vz) === B.AIR) set(vx, y, vz, B.VINES);
      }
    }
    // High multi-tier jungle canopy (y >= 13 -> 5 full blocks of trunk, cocoa & vines clearly visible below!)
    const cxMid = tx + 0.5, czMid = tz + 0.5;
    const tiers = [
      [height - 3, 2.2 * canopyScale],
      [height - 2, 3.3 * canopyScale],
      [height - 1, 2.9 * canopyScale],
      [height, 2.1 * canopyScale],
      [height + 1, 1.3 * canopyScale],
    ];
    for (const [dy, rad] of tiers) {
      const ly = ty + dy;
      if (ly < 13) continue;
      const rCeil = Math.ceil(rad + 0.5);
      for (let ox = -rCeil; ox <= rCeil; ox++) {
        for (let oz = -rCeil; oz <= rCeil; oz++) {
          const lx = Math.round(cxMid + ox);
          const lz = Math.round(czMid + oz);
          if (inCornerChunk(lx, lz)) continue;
          const dist = Math.hypot(lx - cxMid, lz - czMid);
          if (dist <= rad + Math.sin(lx * 1.1 + lz * 0.9) * 0.25) {
            if (get(lx, ly, lz) === B.AIR) set(lx, ly, lz, B.JUNGLE_LEAVES);
            // Curtain of hanging jungle vines along outer canopy rim (y >= 10, non-blocking & non-pickable)
            if (dy === height - 2 && dist >= rad - 0.75 && hash2(lx * 11, lz * 13) < 0.56) {
              const vLen = 2 + (hash2(lx, lz) > 0.45 ? 1 : 0);
              for (let vy = 1; vy <= vLen; vy++) {
                if (ly - vy >= 10 && get(lx, ly - vy, lz) === B.AIR) {
                  set(lx, ly - vy, lz, B.VINES);
                }
              }
            }
          }
        }
      }
    }
  }

  // 7 Giant 2x2 Jungle Trees staged around the North, West, Center, East & SW/SE clearing flanks
  placeGiantJungleTree(27, 8, 72, 10, 1.0);  // Central hero 2x2 tree directly north of lounging cat logs!
  placeGiantJungleTree(16, 8, 76, 10, 1.0);  // West flank 2x2 giant tree
  placeGiantJungleTree(29, 8, 75, 10, 0.95); // East-central 2x2 giant tree
  placeGiantJungleTree(17, 8, 84, 9, 0.88);  // SW corner 2x2 giant tree
  placeGiantJungleTree(34, 8, 83, 9, 0.88);  // SE corner 2x2 giant tree
  placeGiantJungleTree(33, 8, 63, 9, 0.95);  // NE jungle gate 2x2 giant tree
  placeGiantJungleTree(19, 8, 55, 9, 0.92);  // NW clearing flank 2x2 giant tree
  placeTree(35, 8, 76, B.JUNGLE_LOG, B.JUNGLE_LEAVES, 7, true);

  // Fallen mossy jungle logs matching #176 companion lounging cats ((24.5,9,77.5) & (27.5,9,80.5)) + clearing border logs
  fill(23, 8, 77, 25, 8, 77, B.JUNGLE_LOG);
  fill(26, 8, 80, 28, 8, 80, B.JUNGLE_LOG);
  const fallenJungleLogs = [
    [23, 8, 84], [24, 8, 84],
    [20, 8, 71], [21, 8, 71],
  ];
  for (const [lx, ly, lz] of fallenJungleLogs) {
    if (!inCornerChunk(lx, lz) && !isJungleWalkZone(lx, lz) && get(lx, 7, lz) !== B.AIR) {
      set(lx, ly, lz, B.JUNGLE_LOG);
    }
  }

  // Tall segmented 3D Bamboo groves around clearings & trails
  const bambooStalks = [
    [18, 78, 5], [18, 79, 6], [19, 79, 4], [18, 82, 5],
    [22, 85, 5], [23, 85, 6], [26, 84, 5], [27, 85, 6], [28, 84, 4],
    [33, 78, 5], [34, 78, 6], [34, 79, 4],
    [25, 71, 4], [25, 72, 5], [21, 70, 5],
    [31, 76, 5], [32, 76, 6], [32, 77, 4],
    [31, 68, 5], [32, 68, 6], [32, 69, 4],
    [33, 59, 5], [33, 60, 4], [21, 56, 4], [21, 57, 5],
  ];
  for (const [bx, bz, bh] of bambooStalks) {
    if (inCornerChunk(bx, bz) || isJungleWalkZone(bx, bz) || get(bx, 7, bz) === B.AIR) continue;
    set(bx, 7, bz, B.GRASS);
    for (let y = 8; y < 8 + bh; y++) {
      if (get(bx, y, bz) === B.AIR) set(bx, y, bz, B.BAMBOO);
    }
  }

  // Striped wild MC Melon patches nestled in the jungle undergrowth
  const melonBlocks = [
    [22, 83], [21, 84], [25, 84],
    [30, 85], [31, 85],
    [26, 74], [22, 79], [29, 78],
    [31, 70], [32, 70],
    [18, 80], [34, 81],
  ];
  for (const [mx, mz] of melonBlocks) {
    if (!inCornerChunk(mx, mz) && !isJungleWalkZone(mx, mz) && get(mx, 7, mz) !== B.AIR && get(mx, 8, mz) === B.AIR) {
      set(mx, 7, mz, B.GRASS);
      set(mx, 8, mz, B.MELON);
    }
  }

  // Lush non-blocking MC Ferns framing clearings, logs, bamboo & tree roots
  for (let x = 16; x <= 35; x++) {
    for (let z = 55; z <= 86; z++) {
      if (inCornerChunk(x, z) || Math.hypot(x - 16, z - 66) <= 9.2) continue;
      if (x === 33 && z === 72) continue; // keep H2 Pink Tulip exact!
      if (Math.hypot(x - 40, z - 75) <= 4.5) continue; // keep Bee Ring exact!
      let onExactPerch = false;
      for (const [px, pz] of [
        [21.5, 77.5], [20.5, 81.5], [29.5, 81.5], [31.5, 80.5], [31.5, 82.5],
        [24.5, 76.0], [26.5, 78.5], [26.5, 58.5],
      ]) {
        if (Math.hypot(x + 0.5 - px, z + 0.5 - pz) < 1.35) onExactPerch = true;
      }
      if (onExactPerch) continue;
      if (get(x, 7, z) === B.GRASS && get(x, 8, z) === B.AIR && hash2(x * 17 + 3, z * 19 + 5) < 0.28) {
        set(x, 8, z, B.FERN);
      }
    }
  }

  // Hidden H2 Pink Tulip at the jungle-meadow edge (33, 8, 72)
  set(33, 7, 72, B.GRASS);
  set(33, 8, 72, B.PINK_TULIP);

  // ============================================================================
  // 11. END POCKET: x in [128,176), z in [16,64), centre (152, 8, 40)
  // Scalloped MC End archipelago lobes + wide causeways so black-purple starry void shows right inside 52° follow cam!
  // ============================================================================
  const endLobes = [
    [152, 41, 7.6],   // central hub plaza (hosts Endermen + egg hop spots)
    [149, 47.5, 4.4], // SW wander terrace
    [155.5, 46, 4.4], // SE wander terrace
    [148.5, 34, 4.2], // NW wander terrace
    [156, 33, 4.0],   // NE wander terrace
    [152, 56, 4.8],   // arrive & exit portal isle
    [141, 39, 5.2],   // big enderman cage isle
    [162, 40, 4.5],   // small cage isle
    [139.5, 48.5, 3.6], [140.5, 30.5, 3.6], [163.5, 30.5, 3.6], [164.5, 47.5, 3.6], // 4 chorus seals
    [138, 28, 2.8], [166, 28, 2.8], [136, 48, 2.8], [167, 48, 2.8], [144, 23, 3.0], [152, 26, 4.2], // 6 pillars + stairs
  ];
  const endCauseways = [
    [152, 56, 152, 26, 2.8],     // S->N main spine
    [141, 39, 162, 40, 2.6],     // W->E cage bridge
    [139.5, 48.5, 149, 45, 2.3], // SW seal causeway
    [140.5, 30.5, 149, 34, 2.3], // NW seal causeway
    [163.5, 30.5, 156, 34, 2.3], // NE seal causeway
    [164.5, 47.5, 156, 45, 2.3], // SE seal causeway
    [144, 23, 151, 26, 2.0],     // N pillar spur
  ];
  function distToSegment(px, pz, ax, az, bx, bz) {
    const vx = bx - ax, vz = bz - az;
    const len2 = vx * vx + vz * vz;
    const t = len2 > 0 ? Math.max(0, Math.min(1, ((px - ax) * vx + (pz - az) * vz) / len2)) : 0;
    return Math.hypot(px - (ax + vx * t), pz - (az + vz * t));
  }
  for (let x = 131; x <= 172; x++) {
    for (let z = 19; z <= 61; z++) {
      let minNorm = 99;
      for (const [lx, lz, lr] of endLobes) {
        const nd = Math.hypot(x - lx, z - lz) / lr;
        if (nd < minNorm) minNorm = nd;
      }
      for (const [ax, az, bx, bz, hw] of endCauseways) {
        const nd = distToSegment(x, z, ax, az, bx, bz) / hw;
        if (nd < minNorm) minNorm = nd;
      }
      const jag = 0.06 * Math.sin(x * 0.9 + z * 0.7);
      if (minNorm + jag <= 1.0) {
        const depth = minNorm < 0.55 ? 4 : minNorm < 0.8 ? 5 : 6;
        fill(x, depth, z, x, 7, z, B.END_STONE);
      }
    }
  }
  // Floating decorative End-stone mini islets out in the starry void (visible around perimeter at 52° pitch!)
  const voidIslets = [
    [131, 6, 22, 2],
    [172, 6, 22, 2],
    [131, 5, 35, 1],
    [172, 5, 38, 1],
    [143, 6, 58, 2],
    [161, 6, 58, 2],
  ];
  for (const [ix, iy, iz, ir] of voidIslets) {
    for (let ox = -ir; ox <= ir; ox++) {
      for (let oz = -ir; oz <= ir; oz++) {
        if (Math.hypot(ox, oz) <= ir + 0.3 && get(ix + ox, 7, iz + oz) === B.AIR) {
          fill(ix + ox, iy - 1, iz + oz, ix + ox, iy, iz + oz, B.END_STONE);
        }
      }
    }
  }
  // Exit End Portal at (152, 58) — walkable 3x3 pool inside 5x5 End Portal Frame
  for (let dx = -2; dx <= 2; dx++) {
    for (let dz = -2; dz <= 2; dz++) {
      if (Math.abs(dx) === 2 && Math.abs(dz) === 2) continue;
      set(152 + dx, 7, 58 + dz, (Math.abs(dx) === 2 || Math.abs(dz) === 2) ? B.END_PORTAL_FRAME : B.OBSIDIAN);
    }
  }

  // 6 Obsidian Pillars around End island
  const pillars = [
    [138, 28, 14],
    [166, 28, 15],
    [136, 48, 13],
    [167, 48, 14],
    [144, 23, 15],
    [152, 26, 16], // Tallest central north pillar carrying the Dragon Egg!
  ];
  for (const [px, pz, topY] of pillars) {
    fill(px - 1, 8, pz - 1, px + 1, topY, pz + 1, B.OBSIDIAN);
  }
  // Dragon Egg atop tallest pillar (152, 17, 26) + walkable End-Stone wraparound staircase (y = 8 -> 16)!
  set(152, 17, 26, B.DRAGON_EGG);
  // 9-step wraparound staircase around the 3x3 pillar (151..153, 25..27):
  // Steps at radius 2 around (152, 26), each ascending +1 Y per adjacent cell so A* walks straight up!
  const eggStairs = [
    [150, 28, 8],
    [150, 27, 9],
    [150, 26, 10],
    [150, 25, 11],
    [150, 24, 12],
    [151, 24, 13],
    [152, 24, 14],
    [153, 24, 15],
    [153, 25, 16], // Top landing at y=16 -> standing at y=17 right next to (152, 17, 26)!
  ];
  for (const [sx, sz, topBlockY] of eggStairs) {
    fill(sx, 8, sz, sx, topBlockY, sz, B.END_STONE);
  }

  // Big Iron-Bar Cage of 6 Endermen (x: 138..144, z: 36..42, y: 8..12) with magenta roof accent like video 3:50!
  for (let x = 138; x <= 144; x++) {
    for (let z = 36; z <= 42; z++) {
      set(x, 12, z, (x >= 140 && x <= 142 && z >= 38 && z <= 40) ? B.CONCRETE_PERFECT : B.IRON_BLOCK);
      const edge = x === 138 || x === 144 || z === 36 || z === 42;
      if (edge) {
        const corner = (x === 138 || x === 144) && (z === 36 || z === 42);
        for (let y = 8; y <= 11; y++) {
          set(x, y, z, corner ? B.IRON_BLOCK : B.IRON_BARS);
        }
      }
    }
  }

  // 小末's Small Cage (x: 160..164, z: 38..42, y: 8..11)
  for (let x = 160; x <= 164; x++) {
    for (let z = 38; z <= 42; z++) {
      set(x, 11, z, B.CONCRETE_PERFECT);
      const edge = x === 160 || x === 164 || z === 38 || z === 42;
      if (edge) {
        const corner = (x === 160 || x === 164) && (z === 38 || z === 42);
        for (let y = 8; y <= 10; y++) {
          set(x, y, z, corner ? B.OBSIDIAN : B.IRON_BARS);
        }
      }
    }
  }

  // ============================================================================
  // 12. NETHER POCKET: x in [192,240), z in [16,64), centre (216, 8, 40) — W2 Overhaul
  // ============================================================================
  // Organic scalloped Nether island base (netherrack & soul-sand valley floor)
  for (let x = 195; x <= 237; x++) {
    for (let z = 18; z <= 61; z++) {
      const dx = (x - 216) / 20.8;
      const dz = (z - 40) / 21.2;
      const jag = Math.sin(x * 0.65 + z * 0.5) * 0.05;
      if (Math.hypot(dx, dz) + jag <= 1.02) {
        fill(x, 4, z, x, 7, z, B.NETHERRACK);
      }
    }
  }

  // Protected walkable floor zones (y=8/9 clear sky so surfaceY & A* stay 100% clean)
  const isNetherWalkableCorridor = (px, pz) => {
    // South arrival courtyard & exit portal approach
    if (px >= 211 && px <= 221 && pz >= 48 && pz <= 59) return true;
    // Fortress bridge deck & battlements footprint
    if (px >= 212 && px <= 220 && pz >= 33 && pz <= 47) return true;
    // North Wither Altar plaza & summon stage
    if (px >= 212 && px <= 220 && pz >= 22 && pz <= 32) return true;
    // West Soul-Sand Valley + south/north shore walkways
    if (px >= 202 && px <= 209 && pz >= 25 && pz <= 53) return true;
    if (px >= 208 && px <= 212 && ((pz >= 49 && pz <= 54) || (pz >= 28 && pz <= 33))) return true;
    // East Nether Terrace + south/north shore walkways
    if (px >= 226 && px <= 229 && pz >= 28 && pz <= 52) return true;
    if (px >= 220 && px <= 226 && ((pz >= 50 && pz <= 54) || (pz >= 28 && pz <= 33))) return true;
    return false;
  };

  // Sculpted Netherrack Hills & Perimeter Cliffs (y = 8..16) around the valley & arrival rim!
  for (let x = 195; x <= 237; x++) {
    for (let z = 18; z <= 61; z++) {
      if (get(x, 7, z) === B.AIR || isNetherWalkableCorridor(x, z)) continue;
      // Leave Lava Lake channels (x: 209..211 & 221..225, z: 34..49) open for glowing lava!
      if (((x >= 209 && x <= 211) || (x >= 221 && x <= 225)) && z >= 34 && z <= 49) continue;

      let hillH = 0;
      // West Netherrack Ridge (x <= 201)
      if (x <= 201) {
        hillH = Math.min(8, Math.round((202 - x) * 1.35 + Math.sin(z * 0.45 + x * 0.3) * 1.4));
      }
      // East Netherrack Ridge (x >= 230)
      if (x >= 230) {
        hillH = Math.max(hillH, Math.min(8, Math.round((x - 229) * 1.4 + Math.cos(z * 0.42 - x * 0.25) * 1.4)));
      }
      // North Altar Backdrop Cliffs (z <= 21)
      if (z <= 21) {
        hillH = Math.max(hillH, Math.min(7, Math.round((22 - z) * 1.6 + Math.sin(x * 0.5) * 1.2)));
      }
      // SW & SE Arrival Portal Crags (z >= 55 outside central portal lane)
      if (z >= 55 && (x <= 210 || x >= 222)) {
        hillH = Math.max(hillH, Math.min(5, Math.round((z - 54) * 1.1 + Math.cos(x * 0.6) * 1.1)));
      }
      if (hillH >= 1) {
        const useBasaltCap = hillH >= 4 && hash2(x * 7, z * 11) < 0.22;
        fill(x, 8, z, x, 7 + hillH, z, B.NETHERRACK);
        if (useBasaltCap) set(x, 7 + hillH, z, B.BASALT);
      }
    }
  }

  // Glowing Bubbling Lava Lake Channels flanking the Fortress Bridge (scenery, walkable=false!)
  for (let z = 34; z <= 49; z++) {
    for (const lx of [209, 210, 211, 221, 222, 223, 224, 225]) {
      // Taper north & south tips organically
      if ((z === 34 || z === 49) && (lx === 209 || lx === 225)) continue;
      fill(lx, 4, z, lx, 6, z, B.NETHERRACK);
      set(lx, 7, z, B.LAVA);
      clearAir(lx, 8, z, lx, 16, z);
    }
  }

  // Grand Nether-Brick Fortress Bridge spanning the Lava Lake (walkable deck x: 213..219, z: 33..47, top y=9!)
  fill(212, 7, 33, 220, 8, 47, B.NETHER_BRICK);
  // Fortress support piers plunging into the Lava Lake edges
  for (const pz of [36, 41, 46]) {
    fill(211, 5, pz, 212, 8, pz, B.NETHER_BRICK);
    fill(220, 5, pz, 221, 8, pz, B.NETHER_BRICK);
  }
  // Crenellated Nether-Brick battlements along x=212 & x=220 (keeping x=213..219 wide open 7-block deck for 3 Wither Skeletons!)
  for (let z = 34; z <= 46; z++) {
    set(212, 9, z, B.NETHER_BRICK);
    set(220, 9, z, B.NETHER_BRICK);
    if (z % 2 === 0) {
      set(212, 10, z, B.NETHER_BRICK);
      set(220, 10, z, B.NETHER_BRICK);
    }
  }
  // Bridge beacon towers + Glowstone lanterns + Fortress Gate Arch at z=36
  for (const lz of [36, 41, 46]) {
    set(212, 10, lz, B.NETHER_BRICK); set(212, 11, lz, B.GLOWSTONE);
    set(220, 10, lz, B.NETHER_BRICK); set(220, 11, lz, B.GLOWSTONE);
  }
  fill(212, 11, 36, 212, 14, 36, B.NETHER_BRICK);
  fill(220, 11, 36, 220, 14, 36, B.NETHER_BRICK);
  fill(212, 14, 36, 220, 14, 36, B.NETHER_BRICK);
  set(213, 13, 36, B.NETHER_BRICK); set(219, 13, 36, B.NETHER_BRICK);
  set(216, 13, 36, B.GLOWSTONE); set(215, 13, 36, B.GLOWSTONE); set(217, 13, 36, B.GLOWSTONE);
  set(216, 12, 36, B.GLOWSTONE);

  // Bridge corner Soul-Sand + Nether Wart planters (south entrance z=47 & north exit z=33)
  for (const [px, pz] of [[212, 47], [220, 47], [212, 33], [220, 33]]) {
    set(px, 8, pz, B.SOUL_SAND);
    set(px, 9, pz, B.NETHER_WART);
  }

  // Basalt Pillars erupting from the Lava Lake & Valley Rims (some crowned with Soul-Fire braziers!)
  const basaltPillars = [
    [210, 46, 11, true],
    [210, 39, 12, false],
    [209, 43, 9, false],
    [223, 47, 11, true],
    [224, 41, 13, false],
    [222, 37, 10, false],
    [201, 43, 13, false],
    [201, 36, 14, true],
    [230, 48, 13, false],
    [230, 35, 14, false],
    [208, 55, 11, true],
    [224, 55, 11, false],
  ];
  for (const [bx, bz, topY, hasFire] of basaltPillars) {
    fill(bx, 7, bz, bx, topY, bz, B.BASALT);
    if (hasFire) set(bx, topY + 1, bz, B.SOUL_FIRE);
  }

  // Hanging Golden Glowstone Stalactite Clusters anchored cleanly to Cliff Overhangs!
  // West cliff overhang spurs + dripping Glowstone clusters
  fill(198, 14, 39, 202, 15, 41, B.NETHERRACK);
  fill(201, 13, 40, 202, 14, 40, B.GLOWSTONE);
  set(202, 12, 40, B.GLOWSTONE); set(201, 12, 41, B.GLOWSTONE);

  fill(200, 13, 51, 203, 14, 53, B.NETHERRACK);
  fill(202, 11, 52, 203, 12, 52, B.GLOWSTONE);
  set(202, 10, 52, B.GLOWSTONE);

  // East cliff overhang spurs + dripping Glowstone clusters
  fill(229, 14, 38, 233, 15, 40, B.NETHERRACK);
  fill(229, 13, 39, 230, 14, 39, B.GLOWSTONE);
  set(229, 12, 39, B.GLOWSTONE); set(230, 12, 40, B.GLOWSTONE);

  fill(229, 13, 46, 232, 14, 48, B.NETHERRACK);
  fill(229, 11, 47, 230, 12, 47, B.GLOWSTONE);
  set(229, 10, 47, B.GLOWSTONE);

  // North Altar cliff crown cluster
  fill(214, 14, 19, 218, 15, 21, B.NETHERRACK);
  fill(215, 13, 20, 217, 13, 20, B.GLOWSTONE);
  set(216, 12, 20, B.GLOWSTONE); set(216, 11, 20, B.GLOWSTONE);

  // Dramatic Fenced Lava Falls pouring down West, East & North Netherrack Cliffs!
  // West Cliff Fenced Lava Fall (x=200, z=46..48 — right in arrival left view!)
  fill(199, 8, 45, 201, 15, 49, B.NETHERRACK);
  fill(200, 7, 45, 201, 8, 49, B.NETHER_BRICK);
  fill(200, 8, 46, 200, 14, 48, B.LAVA);
  fill(201, 8, 46, 201, 8, 48, B.NETHER_BRICK);
  fill(201, 9, 46, 201, 14, 48, B.IRON_BARS);

  // East Cliff Fenced Lava Fall (x=231, z=42..44 — right in arrival right view!)
  fill(230, 8, 41, 232, 16, 45, B.NETHERRACK);
  fill(230, 7, 41, 231, 8, 45, B.NETHER_BRICK);
  fill(231, 8, 42, 231, 15, 44, B.LAVA);
  fill(230, 8, 42, 230, 8, 44, B.NETHER_BRICK);
  fill(230, 9, 42, 230, 15, 44, B.IRON_BARS);

  // Twin North Cliff Fenced Lava Columns flanking Wither Altar (x=210 & 222, z=20)
  for (const nx of [210, 222]) {
    fill(nx - 1, 8, 19, nx + 1, 15, 21, B.NETHERRACK);
    set(nx, 8, 21, B.NETHER_BRICK);
    fill(nx, 8, 20, nx, 14, 20, B.LAVA);
    fill(nx, 9, 21, nx, 14, 21, B.IRON_BARS);
  }

  // Soul-Sand Valley (x: 202..209, z: 33..53 + foreground tongue 210..213, 49..53) with Soul Soil & Blue Soul-Fire!
  for (let x = 202; x <= 212; x++) {
    for (let z = 33; z <= 53; z++) {
      const inMainValley = x <= 209 && z >= 34 && z <= 53;
      const inFrontTongue = x >= 209 && x <= 212 && z >= 49 && z <= 53;
      if (!inMainValley && !inFrontTongue) continue;
      if (get(x, 7, z) === B.LAVA || get(x, 7, z) === B.AIR) continue;
      set(x, 7, z, (hash2(x * 5, z * 7) < 0.45) ? B.SOUL_SOIL : B.SOUL_SAND);
    }
  }
  // 4 raised Soul Sand blocks ready to dig in Quest 9 (matching q_wither LAYOUT_EXTRA_SAND)
  set(204, 8, 39, B.SOUL_SAND);
  set(207, 8, 39, B.SOUL_SAND);
  set(204, 8, 42, B.SOUL_SAND);
  set(207, 8, 42, B.SOUL_SAND);
  // Ensure East Terrace Soul Sand pockets under q_wither breakables (226,49) & (226,29) look authentic
  fill(225, 7, 48, 227, 7, 50, B.SOUL_SAND);
  fill(225, 7, 28, 227, 7, 30, B.SOUL_SAND);

  // Flickering Cyan-Blue Soul-Fire flames across the Soul-Sand Valley (non-blocking, non-pickable, emissive!)
  const soulFireSpots = [
    [210, 8, 51], [206, 8, 50], [203, 8, 48],
    [206, 8, 45], [203, 8, 43], [205, 8, 40],
    [203, 8, 37], [206, 8, 35], [208, 8, 36],
  ];
  for (const [sfx, sfy, sfz] of soulFireSpots) {
    if (get(sfx, sfy, sfz) === B.AIR) set(sfx, sfy, sfz, B.SOUL_FIRE);
  }

  // Crimson Nether Wart beds framing Arrival, East Terrace & North Bridge (non-blocking, non-pickable!)
  const netherWartSpots = [
    [213, 50], [213, 51], [219, 50], [219, 51], [220, 50],
    [227, 42], [227, 43], [228, 43], [227, 36],
    [212, 31], [220, 31],
  ];
  for (const [wx, wz] of netherWartSpots) {
    if (get(wx, 7, wz) !== B.AIR && get(wx, 7, wz) !== B.LAVA && get(wx, 8, wz) === B.AIR) {
      set(wx, 7, wz, B.SOUL_SAND);
      set(wx, 8, wz, B.NETHER_WART);
    }
  }

  // Wither Altar (x: 213..219, z: 22..28)
  fill(213, 7, 22, 219, 7, 28, B.NETHER_BRICK);
  set(213, 8, 22, B.NETHER_BRICK); set(213, 9, 22, B.GLOWSTONE);
  set(219, 8, 22, B.NETHER_BRICK); set(219, 9, 22, B.GLOWSTONE);
  set(213, 8, 28, B.NETHER_BRICK); set(213, 9, 28, B.GLOWSTONE);
  set(219, 8, 28, B.NETHER_BRICK); set(219, 9, 28, B.GLOWSTONE);

  // Nether Exit Portal Arch at (216.5, 8, 58.5)
  fill(215, 7, 58, 218, 7, 58, B.OBSIDIAN);
  fill(215, 8, 58, 215, 12, 58, B.OBSIDIAN);
  fill(218, 8, 58, 218, 12, 58, B.OBSIDIAN);
  fill(215, 12, 58, 218, 12, 58, B.OBSIDIAN);
  clearAir(216, 8, 58, 217, 11, 58);

  // ============================================================================
  // 13. ALL 33 BINDING `poi` KEYS (§5) + EXTRA LANDMARKS
  // ============================================================================
  const poi = Object.freeze({
    spawn: { x: 48.5, y: 8, z: 66.5 },
    plaza: { x: 48.5, y: 8, z: 48.5 },
    board: { x: 48.5, y: 8, z: 42.5 },
    runway: { x: 48.5, y: 8, z: 54.5 },
    stage: { x: 48.5, y: 8, z: 59.5 },
    meadow: { x: 48.5, y: 8, z: 72.5 },
    hive: { x: 40.5, y: 8, z: 75.5 },
    swamp: { x: 69.5, y: 8, z: 68.5 },
    cave: { x: 79.5, y: 8, z: 46.5 },
    villageSquare: { x: 70.5, y: 8, z: 26.5 },
    statue: { x: 70.5, y: 8, z: 32.5 },
    pumpkins: { x: 78.5, y: 8, z: 20.5 },
    ironAltar: { x: 66.5, y: 8, z: 27.5 },
    bank: { x: 80.5, y: 8, z: 30.5 },
    stall: { x: 74.5, y: 8, z: 24.5 },
    snow: { x: 48.5, y: 8, z: 22.5 },
    snowArena: { x: 50.5, y: 8, z: 16.5 },
    shrine: { x: 20.5, y: 8, z: 24.5 },
    endPortal: { x: 20.5, y: 8, z: 18.5 },
    netherPortal: { x: 12.5, y: 8, z: 30.5 },
    kaiHouse: { x: 23.5, y: 8, z: 44.5 },
    prison: { x: 25.5, y: 8, z: 66.5 },
    prisonCell: { x: 16.5, y: 8, z: 66.5 },
    jungle: { x: 24.5, y: 8, z: 76.5 },
    clearing: { x: 26.5, y: 8, z: 58.5 },
    pinkTulip: { x: 33.5, y: 8, z: 72.5 },
    endArrive: { x: 152.5, y: 8, z: 54.5 },
    endCage: { x: 159.5, y: 8, z: 40.5 },
    dragonEgg: { x: 153.5, y: 17, z: 26.5 },
    netherArrive: { x: 216.5, y: 8, z: 53.5 },
    fortress: { x: 216.5, y: 9, z: 40.5 },
    soulSand: { x: 205.5, y: 8, z: 40.5 },
    witherAltar: { x: 216.5, y: 8, z: 26.5 },
    // Extra portal return helpers
    endExit: { x: 152.5, y: 8, z: 58.5 },
    netherExit: { x: 216.5, y: 8, z: 58.5 },
  });

  // Ensure dragonEgg top landing is solid at y=16 -> standing at y=17
  fill(153, 8, 26, 153, 16, 26, B.END_STONE);

  const landmarks = Object.freeze({
    capeSpots,
    bleacherSeats,
    ironOreSpots,
    statueIronBlocks: [
      { x: 69, y: 8, z: 30 },
      { x: 71, y: 8, z: 30 },
    ],
    statueNose: { x: 70, y: 10, z: 31 },
    beeFlowerRing: beeRing.map(([x, z, id]) => ({ x, y: 8, z, blockId: id })),
    prisonStones,
    prisonCobwebs: [
      { x: 20, y: 8, z: 66 },
      { x: 20, y: 8, z: 65 },
    ],
    prisonCellDoor: [
      { x: 15, y: 8, z: 66 },
      { x: 15, y: 9, z: 66 },
    ],
    bankChest: { x: 86, y: 8, z: 30 },
    bankPasscodeBlocks: [
      { x: 87, y: 10, z: 27, blockId: B.CONCRETE_PERFECT },
      { x: 87, y: 9, z: 27, blockId: B.CONCRETE_PRETTY },
      { x: 87, y: 8, z: 27, blockId: B.CONCRETE_TRYHARD },
    ],
    soulSandBlocks: [
      { x: 204, y: 8, z: 39 },
      { x: 207, y: 8, z: 39 },
      { x: 204, y: 8, z: 42 },
      { x: 207, y: 8, z: 42 },
    ],
  });

  return { poi, landmarks };
}
