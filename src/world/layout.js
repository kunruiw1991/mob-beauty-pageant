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
  // 10. SW JUNGLE (17..33, 70..86), CREEPER CLEARING (26, 58) & PINK TULIP
  // ============================================================================
  // Creeper clearing around (26, 58)
  for (let x = 22; x <= 31; x++) {
    for (let z = 54; z <= 62; z++) {
      if (get(x, 7, z) !== B.AIR && Math.hypot(x - 26.5, z - 58.5) < 4.5) {
        set(x, 7, z, B.GRASS);
        clearAir(x, 8, z, x, 12, z);
      }
    }
  }
  // Jungle canopy trees + fallen logs for cat sneak quest (staying x >= 16 so chunk (0,5) stays ocean!)
  placeTree(19, 8, 74, B.JUNGLE_LOG, B.JUNGLE_LEAVES, 7, true);
  placeTree(29, 8, 75, B.JUNGLE_LOG, B.JUNGLE_LEAVES, 7, true);
  placeTree(22, 8, 83, B.JUNGLE_LOG, B.JUNGLE_LEAVES, 6, true);
  placeTree(31, 8, 83, B.JUNGLE_LOG, B.JUNGLE_LEAVES, 6, true);
  // Fallen jungle logs for 喵喵 to perch/leap
  fill(23, 8, 77, 25, 8, 77, B.JUNGLE_LOG);
  fill(26, 8, 80, 28, 8, 80, B.JUNGLE_LOG);
  fill(20, 8, 79, 21, 8, 79, B.JUNGLE_LOG);
  // Hidden H2 Pink Tulip at the jungle-meadow edge (33, 8, 72)
  set(33, 7, 72, B.GRASS);
  set(33, 8, 72, B.PINK_TULIP);

  // ============================================================================
  // 11. END POCKET: x in [128,176), z in [16,64), centre (152, 8, 40)
  // ============================================================================
  for (let x = 131; x <= 172; x++) {
    for (let z = 19; z <= 61; z++) {
      const dx = (x - 152) / 20;
      const dz = (z - 40) / 20;
      const d = Math.hypot(dx, dz) + Math.sin(x * 0.25) * 0.05 + Math.cos(z * 0.25) * 0.05;
      if (d <= 1.0) {
        const bot = Math.max(4, Math.floor(4 + d * 3));
        fill(x, bot, z, x, 7, z, B.END_STONE);
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
  // 12. NETHER POCKET: x in [192,240), z in [16,64), centre (216, 8, 40)
  // ============================================================================
  for (let x = 196; x <= 236; x++) {
    for (let z = 19; z <= 61; z++) {
      const dx = (x - 216) / 20;
      const dz = (z - 40) / 20;
      if (Math.hypot(dx, dz) <= 1.0) {
        fill(x, 5, z, x, 7, z, B.NETHERRACK);
      }
    }
  }

  // Nether Exit Portal Arch at (216.5, 8, 58.5)
  fill(215, 7, 58, 218, 7, 58, B.OBSIDIAN);
  fill(215, 8, 58, 215, 12, 58, B.OBSIDIAN);
  fill(218, 8, 58, 218, 12, 58, B.OBSIDIAN);
  fill(215, 12, 58, 218, 12, 58, B.OBSIDIAN);
  clearAir(216, 8, 58, 217, 11, 58);

  // Nether-Brick Fortress Bridge (x: 213..219, z: 33..47, deck block y=8 -> walkable top y=9!)
  fill(213, 8, 33, 219, 8, 47, B.NETHER_BRICK);
  // North & south wide open access stairs (z=33 and z=47 stay y=8 -> step-up = 1 from y=8 ground!)
  for (let z = 34; z <= 46; z++) {
    set(213, 9, z, B.NETHER_BRICK);
    set(219, 9, z, B.NETHER_BRICK);
    if (z % 3 === 1) {
      set(213, 10, z, B.NETHER_BRICK);
      set(219, 10, z, B.NETHER_BRICK);
    }
  }
  // Fortress Glowstone lanterns
  set(213, 11, 37, B.GLOWSTONE);
  set(219, 11, 37, B.GLOWSTONE);
  set(213, 11, 43, B.GLOWSTONE);
  set(219, 11, 43, B.GLOWSTONE);

  // Soul Sand Patch (x: 202..209, z: 37..44)
  fill(202, 7, 37, 209, 7, 44, B.SOUL_SAND);
  // 4 raised Soul Sand blocks ready to dig in Quest 9!
  set(204, 8, 39, B.SOUL_SAND);
  set(207, 8, 39, B.SOUL_SAND);
  set(204, 8, 42, B.SOUL_SAND);
  set(207, 8, 42, B.SOUL_SAND);

  // Wither Altar (x: 213..219, z: 22..28)
  fill(213, 7, 22, 219, 7, 28, B.NETHER_BRICK);
  set(213, 8, 22, B.NETHER_BRICK); set(213, 9, 22, B.GLOWSTONE);
  set(219, 8, 22, B.NETHER_BRICK); set(219, 9, 22, B.GLOWSTONE);
  set(213, 8, 28, B.NETHER_BRICK); set(213, 9, 28, B.GLOWSTONE);
  set(219, 8, 28, B.NETHER_BRICK); set(219, 9, 28, B.GLOWSTONE);

  // Dramatic Fenced Lava Falls on East & West Nether cliffs (scenery, fenced with Nether Brick!)
  for (const lx of [199, 232]) {
    fill(lx - 1, 7, 38, lx + 1, 8, 42, B.NETHER_BRICK);
    fill(lx, 8, 39, lx, 18, 41, B.LAVA);
    fill(lx - 1, 8, 39, lx - 1, 20, 41, lx === 199 ? B.NETHERRACK : B.IRON_BARS);
    fill(lx + 1, 8, 39, lx + 1, 20, 41, lx === 232 ? B.NETHERRACK : B.IRON_BARS);
    fill(lx - 1, 18, 38, lx + 1, 20, 42, B.NETHERRACK);
  }

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
    netherArrive: { x: 216.5, y: 8, z: 54.5 },
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
