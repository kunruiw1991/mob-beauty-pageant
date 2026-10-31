# 我的世界：生物选美大赛 · Mob Beauty Pageant — Binding Design (owner: opus-pageant-director)

Reference: Bilibili BV1XynB6EEpk 《我的世界：生物美貌排行榜！在线选美大赛！》 (辰羊游戏, 11.7 min). Frames studied in
`/tmp/bv1xyn/sheet_01..09.jpg`. Video beats we keep: the giant 5-row colored **tier wall standing in a grass field**
(0:20, 11:35), red-caped **"?" mystery cards** for unmet mobs (0:10), the **NEXT picture-frame reveal** (6:20, 8:30),
sheep that grows flowers where she walks (0:05), slime girl summoning slimes in a swamp (0:30), iron golem from iron
blocks + a carved pumpkin, with the **"fake iron" dirt swap on 贝拉's statue** (1:25–2:30) and **snow golems dropping
their pumpkin heads** (3:00), the rival **hogging pumpkins** (2:50), the End with **cages full of endermen** (3:45),
rival **小凯 hiding the enderman girl** (4:25), a **honey-block floor you can't dig** (4:45), the **lava-ring prison**
with cobwebs + obsidian stepping stones (5:15–5:55), wither skeleton skulls + soul sand (6:40–8:25, wither girl has 3
heads), the villager girl who **only appears to very rich people** (8:35), the **"?" mystery man dropping 15
diamonds** (9:25), the **bank with emerald blocks** (9:35) and the **passcode chest** whose code hides in a corner
(10:50). Tone: 沙雕 slapstick, bright blocky pixel art, fast cuts, a rival who keeps interfering.

**Kid rules (non-negotiable):** contestants are 生物选手, chibi + fully clothed (head ≈ 40 % of height, no curves —
NOT the cover's style). Humor comes from quests, the rival and gags, never from mocking looks. No fail states, no
damage, no death, no scary music; lava is scenery you can never fall into. Touch-first, show-don't-tell, ≤ 12 Chinese
characters visible in any one HUD string, zero `speechSynthesis`.

---------------------------------------------------------------------------------------------------------------------
## 1. Tech frame (binding)

- Zero-build ES2022 modules, relative imports only (`import * as THREE from '../../vendor/three.module.min.js'`),
  no importmap/CDN/bundler. Three.js r170 vendored. `#title` visible by default in HTML (iPad module-failure safety).
- Fixed timestep **60 Hz** sim (`DT = 1/60`), render interpolated; rAF loop runs ≤ 5 sim steps per frame.
  **All sim logic uses `ctx.time` (sim seconds) and `ctx.rng` (seeded mulberry32)** — never `Math.random`,
  `Date.now`, `performance.now` or `setTimeout` inside sim code (DOM-only cosmetics may use real time but must never
  gate state). This is what makes `stepFrames(n)` fast-forward sims and determinism (F11) work.
- Renderer: `antialias:false` (pixel look), `setPixelRatio(min(dpr,2))` + dynamic drop to 1.0 if avg frame > 22 ms,
  `NoToneMapping`, sRGB output, **no shadow maps** (blob shadows under characters), `MeshLambertMaterial` /
  `MeshBasicMaterial` only, metalness never used. Textures: canvas-generated, `NearestFilter`, `SRGBColorSpace`,
  `generateMipmaps=false`. Portrait/billboard materials `toneMapped:false, fog:false`.
- **Never call `renderer.compile(scene,camera)` at boot** (iPad WebKit GPU watchdog). Build the world in ≤ 8 ms
  slices across frames after the title paints.
- Instanced particle pools: `frustumCulled = false`. Pool everything; no per-effect geometry/material allocation.
- iPad: `viewport-fit=cover`, safe-area insets, `touch-action:none` on canvas and draggables, `user-scalable=no`,
  buttons bound on `pointerup` with 280 ms debounce (+ `click` fallback), `left/top/right/bottom:0` before `inset:0`.
- Coordinates: 1 block = 1 unit, y up, grid `X=256 × Y=40 × Z=96` (Uint8Array block ids). Areas live side by side in
  the same grid; only the current area's chunks are `visible`:
  - **hub** x∈[0,96) z∈[0,96) (island ≈ 80×80, sea level y=6, ground ≈ y=8; ocean outside = one water plane),
  - **end** x∈[128,176) z∈[16,64), **nether** x∈[192,240) z∈[16,64).
- Ports for local serving (avoid collisions): director 8790, core 8791, voxel-world 8792, characters 8793,
  quests-a 8794, quests-b 8795, pageant-ui 8796, fx-audio 8797, qa-sims 8798. Prefer `tests/cdp.py` (serves the
  repo in-process, headless Chrome) for automated checks.
- ALL scratch/screenshots/logs go under `/tmp/bv1xyn/` (shots: `/tmp/bv1xyn/shots/<module>/*.jpg`, **JPEG only**).
  Root disk is at 99 %: never write junk in the repo, `~` or `/google/`. Builders never `git commit` (director owns
  git). Never write real family names.

## 2. File ownership (one owner per file; ask the owner on the board for changes)

| Owner | Files |
|---|---|
| **core** (integrator) | `index.html`, `src/main.js`, `src/core/{loop,rng,state,events,input,pick,camera,scene,player,areas,seam,debug}.js`, `src/data/roster.js` (from §4 table, written FIRST) |
| **voxel-world** | `src/world/{blocks,textures,world,chunks,layout,nav,sky,water,portals,boardwall}.js` |
| **characters** | `src/chars/{skins,faces,models,anim,accessories,contestants,npcs,mobs,crowd,capes}.js` |
| **quests-a** | `src/quests/{index,manager,kit}.js`, `src/quests/q_{sheep,slime,cat,golem,creeper}.js`, `src/quests/hidden.js` |
| **quests-b** | `src/quests/{rival,finale}.js`, `src/quests/q_{snow,bee,ender,wither,villager}.js` |
| **pageant-ui** | `styles/main.css`, `src/ui/{hud,title,booth,board,menus,progress,portrait,share,next}.js` |
| **fx-audio** | `src/fx/{particles,shake,confetti,fireworks,popups,rings,audio,music,sfx}.js` |
| **qa-sims** | `tests/*` (except `tests/cdp.py` = director, edits allowed for bug fixes), `/tmp/bv1xyn/qa/*` |
| director | `docs/DESIGN.md`, `README.md`, `screenshot.jpg`, `.gitignore`, `.nojekyll`, git |

Day-one rule: every owner creates its files with **working stubs that match §3 within the first 15 minutes**, so
imports never break; then fills them in. A module must load without errors even if its dependencies are stubs.

## 3. Interfaces (binding contracts)

### 3.1 `ctx` (built by core, passed to every module)
```js
ctx = { THREE, renderer, scene, camera, events, rng, time /*sim s*/, frame, state /*live, mutable*/,
        world, chars, quests, ui, fx, audio, player, rival, pick, cam /*camera rig*/, areas, roster, DT }
```
### 3.2 `src/core/events.js`
`on(type, fn) → off()`, `emit(type, payload)`, `once(type, fn)`. Event types (payload):
`tap {sx,sy,hit}` · `feedback {kind:'walk'|'interact'|'blocked'|'collect', pos}` · `blockHit {pos,blockId,stage}` ·
`blockBreak {pos,blockId}` · `blockPlace {pos,blockId}` · `collect {item,count,pos}` · `questStart {id}` ·
`questStep {id,step}` · `questComplete {id}` · `gag {questId,gagId,pos}` · `rivalSteal {contestantId}` ·
`rivalRescued {contestantId}` · `spawnBig {pos,kind:'golem'|'wither'|'dragon'}` · `areaChange {area}` ·
`sceneChange {scene}` · `boothStart {id}` · `accessory {id,accessoryId,slot}` · `photo {id}` · `rank {id,tier}` ·
`hiddenFound {id}` · `finaleStart` · `gameComplete {stars,timeMs}` · `sfx {name}` (fx-audio listens to most of these
directly — modules emit events, they do not call fx unless they need a specific effect).
### 3.3 voxel-world → `createWorld(ctx) → world`
`getBlock(x,y,z)`, `setBlock(x,y,z,id)` (re-meshes the chunk ≤ 3 ms), `raycast(origin,dir,maxDist) → {pos,normal,blockId}|null`
(voxel DDA), `surfaceY(x,z)`, `isWalkable(x,y,z)`, `findPath(from,to) → [{x,y,z}]|null` (A*/Dijkstra, 8-neighbour,
step-up ≤ 1, drop ≤ 2, octile heuristic, string-pulled), `nearestWalkable(pos,maxR)`, `setArea(area)` (chunk
visibility + sky/fog/light palette), `update(dt)` (water/clouds/portal swirl), `poi` (named `{x,y,z}` points, §5),
`B` (block id enum), `blockColor(id) → THREE.Color` (for particles), `atlas` (texture), `buildSteps()` (generator for
sliced boot build), `boardWall.setPortrait(id, canvas|dataURL, tier)` (the 3D tier wall in the plaza mirrors the
board), `boardWall.highlight(tier)`.
### 3.4 characters → `createChars(ctx) → chars`
`chars.create(kind, opts) → actor` with `actor = {id, kind, group, setAnim(name), setAccessory(accId, slot=0),
clearAccessories(), setEmote(icon|null), lookAt(pos), moveTo(pos, speed) /*straight line, quests use paths via world*/,
update(dt), setVisible(b), hitRadius}`. Kinds: `'player'`, `'kai'`, `'bela'`, `'mystery'`, every contestant id of §4,
mobs `'slimeMob'`(size 1|2), `'snowGolemMob'`, `'villagerMob'`, `'witherSkeleton'`, `'endermanMob'`, `'sheepMob'`,
`'chicken'`, `'catMob'`, `'beeMob'`, `'crowdMob'`. Anims: `idle walk run wave cheer pose shrug flex pushup sad happy
sneak throw dig hop teleport spawn eat sneeze faint stuck cry dance`. `chars.crowd(scene, seats[]) → {react(kind:
'cheer'|'clap'|'aww'|'gasp'|'jump'), update(dt)}` (≤ 6 draw calls total, InstancedMesh per body part).
`chars.capes` — red-caped "?" mystery figures for unmet contestants on the plaza stands (video 0:10); `capes.reveal(id)`.
### 3.5 quests-a → `src/quests/index.js` exports `QUESTS` (array, §6 order) and `createQuestManager(ctx)`
Each quest module default-exports:
```js
{ id, contestantId, area /*'hub'|'end'|'nether'*/, poi /*start poi key*/, order,
  start(ctx), update(dt, ctx), onTap(hit, ctx) /*→ true if handled*/, onAction(ctx), /*context button*/
  targets(ctx) /*→ [{id,pos,kind,label}] what the agent/pointer should tap next (never empty while active)*/,
  pointer(ctx) /*→ {x,y,z}|null beacon target*/, objective(ctx) /*→ {icon, have, need}|null for HUD strip*/,
  action(ctx) /*→ {icon}|null context button*/, cleanup(ctx) }
```
Manager: `activate(id)`, `active()`, `complete(id)` (emits `questComplete`, then core runs booth → board), `next()`
(next available quest id), `tapTarget(targetId)` (agent helper). Shared helpers in `kit.js`: breakable block (N taps,
crack stages, particles), collectible item (bob + sparkle + auto-pickup), ghost slot placement (glowing outline,
tap to place), simple patrol, timers on sim time.
### 3.6 quests-b → `src/quests/rival.js` exports `createRival(ctx) → rival`
`rival.actor`, `rival.state`, `appear(pos, mode)`, `leave()`, `taunt()` (emote 😜 + laugh sfx), `snatch(target)`,
`patrol(points, coneDeg, range)`, `seesPlayer()`, `eatDecoy(pos)`, `stick()`, `bury()`, `faint()`, `update(dt)`.
Modes/states: `offstage cameo hog steal patrol eating stuck buried fainted finale`.
`src/quests/finale.js` exports `startFinale(ctx)` (小凯 walks the runway and asks to be ranked, §8).
### 3.7 pageant-ui → `createUI(ctx) → ui`
`showTitle()`, `hideTitle()`, `showHUD(b)`, `updateHUD(state)`, `setObjective({icon,have,need}|null)`,
`setAction({icon}|null, onPress)`, `showBooth(contestantId) → Promise<{accessories:[...], portrait:dataURL}>`,
`showBoard({newId, mode:'rank'|'view'}) → Promise<{id,tier}|null>`, `showNext(contestantId)` (picture-frame NEXT card,
1.5 s), `showFinal()`, `iris(out|in)` (transition), `pause()`. Progress: `progress.load()`, `progress.save(p)` key
**`pageant_progress`**. Portrait: `renderPortrait(ctx, contestantId, accessories) → {canvas, dataURL}` (offscreen
192×192, transparent, JPEG for storage ≤ 12 KB).
### 3.8 fx-audio → `createFx(ctx) → fx`, `createAudio(ctx) → audio`
`fx.burst(pos, blockId|color, n=12)`, `fx.sparkles(pos, n, {toPlayer})` (XP orbs), `fx.confetti(pos|'screen', n)`,
`fx.fireworks(pos, n)`, `fx.hearts(pos, n)`, `fx.ring(pos, color)` (tap marker), `fx.wobble(pos)` (blocked tap),
`fx.popup(pos, icon)`, `fx.shake(intensity, seconds)` (must move position AND look target), `fx.flash(color, s)`,
`fx.splat()` (snowball on screen), `fx.update(dt)`. `audio.unlock()` (first pointerdown), `audio.play(name, {pitch,
vol, pos})`, `audio.music(track|null)`, `audio.setMuted({music, sfx})`. Counters into `state.stats`
(`particles, sounds, shakes, confetti, fireworks`).

### 3.9 `window.__PAGEANT__` (core; `Object.freeze`d; every getter deep-clones)
`startGame({seed})` (skip title, new run) · `teleport(questId)` (player to quest start, activates it) ·
`completeQuest(id)` (force-complete → booth) · `rank(contestantId, tier)` · `stepFrames(n)` (n sim steps, sync, no
render) · `getState()` · agent helpers: `listTargets()` (active quest targets with world + screen coords),
`tapTarget(id)` (performs exactly what a real tap on it does, incl. walking), `tapScreen(x,y)`, `pressAction()`,
`boothChoose(accessoryId)`, `boothSnap()`, `boardDrop(contestantId, tier)` (through the same code path as a drag
drop), `continue()` (board → world), `perf()` (`{fps, p95ms, calls, triangles, geometries, textures}`), `setMuted(b)`.

### 3.10 `getState()` shape (deep clone, JSON-safe)
```js
{ v:1, seed, frame, timeMs, scene:'title'|'world'|'booth'|'board'|'finale'|'final', area:'hub'|'end'|'nether',
  player:{x,y,z,moving,pathLen}, quest:{id,step,progress,need,startedMs,pointer}|null,
  quests:{[id]:{status:'locked'|'available'|'active'|'done', ms, gags:[gagId]}},
  contestants:{[id]:{met,hidden,found,accessories:[...],tier,portrait:bool}},
  rival:{state,x,z,appearances:[questId], stealDone, rescued},
  feedback:{taps, walk, interact, blocked, collect, dead /*taps with no feedback — must stay 0*/, lastMs},
  stats:{particles,sounds,shakes,confetti,fireworks}, stars, board:{[id]:tier}, elapsedMs, firstMetMs }
```

## 4. Roster (12 contestants + rival finale) — `src/data/roster.js` exports `ROSTER`, `TIERS`, `ACCESSORIES`

| # | id | 名字 | Mob | Quest (one line) | Signature gag (gagId) | Accessories |
|---|---|---|---|---|---|---|
| 1 | sheep | 花花 | 羊 | Pick 5 sparkly flowers from the trail she grows, give her the bouquet | She EATS the bouquet, sneezes petals (`sheep_eats_bouquet`) | flowerCrown, bow, strawHat |
| 2 | slime | 啵啵 | 史莱姆 | Bop her 3 big slimes; big splits into 2 small | 小凯 gets bounced into the pond (`kai_bounced`); last tiny slime hops on her head (`slime_pet`) | slimeHat, crown, sunglasses |
| 3 | cat | 喵喵 | 猫 | Sneak up (move only while she looks away), offer a fish | Her "gift" is 小凯's stolen hat (`cat_gift_kai_hat`) | bow, beanie, headphones |
| 4 | golem | 铁铁 | 铁傀儡 | Mine 2 iron ore + "borrow" 2 blocks from 贝拉's statue, get a pumpkin, build the T | Fake-iron dirt swap, 贝拉 💢 (`fake_iron`); 小凯 hogs pumpkins (`kai_hogs_pumpkins`); snow golem's head pops off (`snow_head_pop`) | flowerCrown, topHat, sunglasses |
| 5 | snow | 雪宝 | 雪傀儡 | Snowball fight: hit 小凯 5× as he pops up behind his wall | 小凯 ends buried as a snowman (`kai_snowman`) | beanie, scarf, pumpkinHat |
| 6 | creeper | 嘶嘶 | 苦力怕 | Calm her fuse with 5 well-timed pats | Happy explosion = confetti + flower heart crater (`creeper_confetti`) | partyHat, bow, sunglasses |
| 7 | bee | 嗡嗡 | 蜜蜂 | Simon-says: tap flowers in the order she visits (3, 4, 5) | 小凯 stuck on a honey block (`kai_honey`) | flowerCrown, crown, headphones |
| 8 | ender | 小末 | 末影人 | Free her from the End cage → 小凯 steals her → cross the lava-ring prison, decoy cake, break the cell | 小凯 locked in his own cell with cake face (`kai_steal`, `kai_cake_face`) | halo, beret, sunglasses |
| 9 | wither | 三三 | 凋零 | Nether: pop 3 skull helmets off wither skeletons, dig 4 soul sand, build the T | Bald skeletons run off blushing (`skeleton_bald`); 3 heads want 3 hats (`wither_three_hats`) | crown, partyHat, topHat (×3 heads) |
| 10 | villager | 翠翠 | 村民 | Get "rich": 3 trades + catch 问号先生's dropped diamonds + crack 小凯 Bank's passcode chest | 小凯 faints at his empty chest (`kai_faint`); her eyes turn to emeralds (`emerald_eyes`) | strawHat, crown, beret |
| H1 | dragon | 龙宝宝 | 末影龙 (hidden) | In the End, tap the dragon egg; it teleports 3×; 4th tap hatches | Egg hops away every time you reach it (`egg_hop`) | crown, partyHat, halo |
| H2 | pinksheep | 粉粉 | 粉色羊 (hidden) | Find the pink tulip at the jungle edge, give it to the one white sheep | Sheep turns pink with a puff, 贝拉 claims her (`pink_dye`) | bow, flowerCrown, starClip |
| ★ | kai | 小凯 | rival | Finale: walks the runway in all his "collected" junk and demands to be ranked | Per-row reaction (push-ups on 再努力, happy cry on 完美) | — |

`TIERS` (top→bottom, video colors, kid labels): `perfect` 完美 👑 `#c43bd8` · `gorgeous` 超漂亮 💎 `#3b5bdb` ·
`pretty` 漂亮 🌸 `#f2c318` · `okay` 一般 🙂 `#d9342b` · `tryhard` 再努力 💪 `#3fae3a`. Every row is positive:
the contestant's reaction is always happy/funny (§8.3).
`ACCESSORIES` ids: crown, flowerCrown, bow, strawHat, topHat, sunglasses, partyHat, pumpkinHat, slimeHat, beanie,
headphones, halo, scarf, beret, starClip, chefHat — each a tiny voxel model (≤ 40 boxes merged into one geometry).

Look bible: MC 16×16 texture style; contestants are chibi block-humans (head 1.0, body 0.7×0.8×0.45, limbs 0.3 wide)
with distinct silhouettes: 花花 wool-cube hood + flowers; 喵喵 ears + tail; 啵啵 translucent green jelly head with a
face inside; 铁铁 big iron shoulders + vines; 雪宝 snowball body + pumpkin-orange hair; 嘶嘶 creeper-pattern hoodie;
嗡嗡 stripes + wings + antennae; 小末 tall/thin, long dark hair, glowing pink-purple eyes + purple particles; 三三 black
outfit + 2 small skull heads on shoulders; 翠翠 straw hat + green robe + cute big nose; 龙宝宝 black-purple wings; 粉粉
pink fluff. Big pixel eyes (2–3 px) + blush pixels on every face. Player 阿辰: green creeper hoodie hood-up, black
pants. 小凯: cyan tee, dark hair, mischievous grin. 贝拉: orange fox hoodie. 问号先生: white suit, black head with "?".

## 5. World layout (hub island, plaza at (48, 8, 48), camera yaw looks north = −z)

- **Plaza** r≈9 quartz/smooth-stone around (48,48). **Tier wall** on its north edge (x 41..55, z 38, 10 high), facing
  south: 5 rows of colored concrete with pixel label tiles (video 0:20), portraits = one canvas-atlas plane (1 draw).
  **Runway** pink/white wool from (48,50) to (48,58), **crowd bleachers** both sides (x 43–45 and 51–53), **photo stage**
  + flower arch at (48,59). Red-caped "?" figures stand on a podium row next to the wall.
- **Spawn** (48,66) facing north (first view = the giant wall + capes).
- S **Flower meadow** (34–62, 68–88): flowers, sheep flock, oak with **beehive** (40,80) — sheep, bee, pinksheep.
- SE **Swamp** (62–86, 58–84): dark water, lily pads, vines — slime.
- E **Stone hill + cave** mouth (80,46), small lit cave room with iron ore — golem step 1.
- NE **Village** (60–86, 12–36): 3 houses, farm, villagers, **贝拉's iron statue** (70,30) + her house, **pumpkin patch**
  (78,20), **iron altar** (66,26), **小凯 Bank** (quartz, $-signs, emerald blocks, passcode chest) (82,30), market stall.
- N **Snowy pocket** (36–60, 4–24): snow, ice pond, spruce, 3 snow golems, snowball arena with 小凯's snow wall.
- NW **Portal shrine** (8–30, 8–30): **End portal** frame (20,18), **Nether portal** obsidian frame (12,30).
- W **小凯's prismarine house** (8–24, 38–52) + **lava-ring prison** (r≈7 obsidian ring + lava moat, centre (16,66)).
- SW **Jungle** (14–34, 70–88) — cat; **creeper clearing** (26,58).
- **End** pocket: end stone island, 6 obsidian pillars (tallest carries the dragon egg), a big iron-bar cage of 6
  endermen + 小末's small cage, exit portal. **Nether** pocket: netherrack, lava falls (scenery, fenced), a nether-brick
  fortress bridge with 3 wither skeletons, soul sand patch, wither altar, exit portal.
- `poi` keys: spawn plaza board runway stage meadow hive swamp cave villageSquare statue pumpkins ironAltar bank stall
  snow snowArena shrine endPortal netherPortal kaiHouse prison prisonCell jungle clearing pinkTulip endArrive endCage
  dragonEgg netherArrive fortress soulSand witherAltar.
- Walking: 4.3 blocks/s (5.2 when path > 20). Tap on any block → walk to nearest walkable cell; portals = walk in.

## 6. Quest flow (order = beacon order; each ≤ 90 s for the ideal agent; NO menus — tap/drag only)

Order: **sheep → slime → cat → golem → snow → creeper → bee → ender → wither → villager**, hidden any time after
their area is reachable (sparkle hints after quest 5), then **finale**. Start of each quest: the red cape of that
contestant on the plaza flips to her face; a **beacon** (light pillar + bouncing arrow) marks `pointer()`; the HUD
strip shows `objective()`. Interaction range 2.5 blocks: tapping a far target walks there, then interacts.
Mercy rules guarantee completion (F2): every timing/sneak/memory challenge auto-softens after 3 misses.

1. **sheep** (meadow, ~35 s): 花花 wanders, dropping a flower block every 0.5 s (≤ 24 live). Every 3rd flower sparkles;
   tap 5 sparkly flowers (auto-walk + pick, XP ding rising in pitch) → tap 花花 → she munches the bouquet, sneezes
   petals, big heart. Tutorial: first beacon is 6 blocks from spawn.
2. **slime** (swamp, ~45 s): 啵啵 giggles and summons 3 big slimes (2 taps each → split into 2 small, 1 tap each = 12
   taps). 小凯 cameo laughs on the far bank; the 2nd big slime bounces him into the water (splash). The last small
   slime hops onto 啵啵's head instead of popping.
3. **cat** (jungle, ~50 s): 喵喵 on a log; looks away 3–5 s, "?" tell 0.6 s, peeks 1.5 s. Moving while she peeks → she
   leaps to another log (no fail). Within 2 blocks unseen → fish appears in hand → tap her → purr + gift (小凯's hat).
   Mercy: after 3 leaps she walks to you curious.
4. **golem** (cave → statue → pumpkins → snow → altar, ~85 s): objective iron 0/4. Tap iron ore 3× (crack stages) ×2;
   tap 贝拉's statue blocks 3× ×2 → each becomes dirt 假铁, 2nd time 贝拉 pops out 💢 and the statue nose falls off.
   Tap a pumpkin → 小凯 snatches it, tongue out 😜. Beacon → snow golem: tap it → its pumpkin head boings off (blushing
   snowman face). Altar: 5 glowing ghost slots (4 iron T + pumpkin), tap to place → rumble 0.8 s, **shake**, 铁铁
   rises from the blocks, offers you a poppy.
5. **snow** (snow arena, ~40 s): 小凯 behind a snow wall pops up 1.2 s / down 1–2 s; tap him to throw (arc, 0.45 s);
   5 hits. His slow snowballs at you can be tapped away; a hit = screen splat, nothing else. 5th hit → he's buried as
   a snowman, 雪宝 laughs.
6. **creeper** (clearing, ~35 s): chickens flee from sad 嘶嘶 (tiny rain cloud). Within 3 blocks her fuse cycles
   (swell + white flash, hiss rising, 1.1 s period); tap on the flash = good pat (−35 %), off-beat = −15 %; calm
   meter fills after 5 good pats (mercy: any 8 pats). Then she's so happy she pops → confetti + a flower heart crater.
7. **bee** (hive, ~45 s): 6 colored flower clumps in a ring, each a musical note. 嗡嗡 visits a sequence (3, then 4,
   then 5); tap the same order. Wrong → head shake + replay (mercy: after 3 misses the next flower glows). 小凯
   sneaks for honey and ends stuck on a honey block, wiggling.
8. **ender** (End + prison, ~85 s — the scripted rival beat): walk into the End portal → End pocket: cage of 6
   endermen; 小末's small cage: tap the bars 3× → she teleports beside you → **STEAL**: 小凯 bursts from the exit
   portal, grabs her and dives back (3.5 s cutscene, `rivalSteal`). Back in the hub the beacon leads to the lava-ring
   prison: (a) 3 obsidian stepping stones bob (up 1.2 s / down 0.8 s) — tap the next stone while up to hop (tapping
   while down = wobble, you can never fall); (b) 2 cobwebs at the gate, 2 snips each; (c) yard: 小凯 patrols around
   the cell with a visible yellow vision cone; seen → he gently tosses you back to the gate (boing). Context button
   🎂 (3 cakes): places a cake on his path; he eats for 5 s. (d) tap the obsidian cell door 3× → 小末 hugs you, both
   teleport out; 小凯 is left in the cell with cake on his face (`rivalRescued`).
9. **wither** (Nether, ~80 s): Nether portal → 3 wither skeletons patrol the fortress bridge: tap one 2× → its skull
   helmet pops off, it blushes and runs off holding its bald head. Tap 4 soul sand blocks (dig). Altar: 7 ghost slots
   (4 soul sand T + 3 skulls) → black smoke swirl, thunder, **shake**, 三三 appears and sneezes a blue skull that turns
   into a balloon.
10. **villager** (village, ~75 s): the empty market stall shows 10 empty emerald slots. Sources: 3 villagers (tap →
    "hrrm" → 1 emerald each); 问号先生 sprints across the square dropping 4 diamonds (each counts 1, fade after 6 s,
    he loops back every 10 s); 小凯 Bank: a sign in the corner shows 3 colored blocks, the passcode chest shows 6
    colored buttons — tap the 3 in order → emerald shower fills the rest. At 10/10 翠翠 pops in at the stall (ka-ching),
    eyes become emeralds; 小凯 arrives and faints at his empty chest.
- **H1 dragon** (End): tap the egg on the tallest pillar (reachable by a stair of end stone) → it teleports to another
  spot 3×; 4th tap hatches 龙宝宝. **H2 pinksheep** (meadow): pick the pink tulip (jungle edge, sparkles), tap the white
  sheep → pink puff → 粉粉, 贝拉 runs over to hug "her" sheep (video 7:55).

## 7. Rival 小凯 (quests-b)
Appears in ≥ 7 of 10 quests: slime (cameo), cat (hat gag), golem (hogs pumpkins), snow (fight), bee (honey), ender
(steal + patrol + cake face), villager (bank faint), finale. Every appearance ends with him comically defeated
(splash, buried, stuck, cake face, faint) — never hurt, never sad for long. State + `appearances[]` in `getState`.
Laugh sfx + 😜 emote on every taunt. He is the main source of 沙雕 humor: exaggerated anims (flail, faint, wiggle).

## 8. Pageant flow (pageant-ui + core)
8.1 **Booth/runway** (after `questComplete`): iris wipe to the plaza; contestant walks the runway 2.5 s with her pose;
crowd cheers + hearts + camera-flash sparkles. Bottom tray: 3 accessory buttons (≥ 80 px, voxel thumbnails) + one big
📸 button (≥ 96 px). Tap accessory → pops onto her head (三三: three heads, three picks). 📸 → white flash + shutter,
pose freezes into a polaroid that flies to the tray. Idle 12 s → auto-pick first accessory + auto-snap.
8.2 **Tier board** (DOM overlay, voxel-textured frame, video colors): 5 rows (icon + label tile left, cards right,
cards ≥ 72 px), the new polaroid (≥ 96 px) wiggles in the tray; first time only, a ghost hand demonstrates a drag.
Drag via Pointer Events + `setPointerCapture`; row under the finger highlights; drop snaps with bounce; release
outside → back to tray. Tap-card-then-tap-row fallback. Any placed card can be re-dragged in `view` mode.
8.3 **Reactions** per row (crowd + contestant, 2.5 s): 完美 → fanfare, confetti ≥ 150, 3 fireworks, crowd jumps;
超漂亮 → cheer + sparkles + 2 fireworks; 漂亮 → claps + hearts; 一般 → crowd "哦~", contestant shrugs and does a silly
dance; 再努力 → crowd "加油!" chant, contestant flexes / does push-ups. The 3D wall in the plaza gets the portrait.
8.4 Then the **NEXT card** (item-frame with the next mob's face, video 6:20) 1.5 s → back to the world, beacon on.
8.5 **Finale** after 10 ranked: 小凯 struts the runway wearing pumpkin + snow + honey + cake ("我也要参赛!" ≤ 6 chars
bubble) → rank him → reaction → **final 排行榜 screen**: full board, ★ count, time, buttons 分享 (PNG via canvas →
Web Share API with file, else download), 再来一次 (new seed; board history kept, re-rank allowed), 继续找 (hidden).
8.6 **Stars**: ★ all 10 main ranked · ★ both hidden found · ★ total game time ≤ 20 min (pauses excluded).
8.7 **HUD in play** (≤ 3 interactive): top-left board chip "3/10" (opens board `view`), top-right ⏸, bottom-right
context button only when `action()` ≠ null; top-centre non-interactive objective strip. Pause: 继续, 音乐, 音效,
重新开始, 排行榜. Title: logo, 3D plaza background with capes, ▶ (≥ 110 px), 继续 if progress, 🏆.
Media rules: both `@media (max-width:720px)` and `@media (max-height:520px)`; camera distance/FOV aspect-adaptive.

## 9. Juice & audio (fx-audio)
Every world tap → `fx.ring` (walk, white) / interact pulse (yellow) / `fx.wobble` + soft "bonk" (blocked) within
100 ms. Block hit → crack overlay + 4 chips; break → 12–16 textured cubes + pop; collect → XP orbs fly to player +
rising-pitch ding; quest complete → ≥ 60 particles + jingle + hearts; golem/wither spawn → `shake(0.6, 0.5)` + rumble;
完美 → confetti ≥ 150 + fireworks; slapstick sfx for 小凯 (boing, splash, wiggle, faint "噗通"). Footstep dust puffs.
WebAudio only (no files, no speech): procedural SFX names `step_grass step_stone step_snow tap blocked hit_stone
hit_wood hit_soft break pickup xp pop boing splash hiss confetti snow_throw snow_hit vwoop rumble thunder wither_spawn
golem_spawn hrrm meow baa buzz kai_laugh kai_whine shutter cheer aww clap fanfare drumroll munch sneeze kaching portal
snip note0..note5`; music tracks `title overworld nether end runway finale` (C418-ish pentatonic overworld; drone
nether; airy pad end; bouncy square-bass runway). Master limiter; sfx ≤ 12 voices; unlock on first pointerdown.

## 10. Performance budget
≥ 50 fps on iPad; terrain = chunk meshes with hidden-face culling + baked vertex AO, one atlas material (≤ 40 draws
per area); characters 6 parts sharing one skin texture (hidden when off-area / > 40 blocks); crowd instanced; particles
instanced pools; **≤ 150 draw calls and ≤ 200k triangles** in the busiest frame (plaza: 12 contestants + crowd + wall).
`renderer.info.memory.geometries/textures` stable (±5 %) across 3 quest cycles.

## 11. Fun gates (director enforces; qa-sims measures in `tests/sim_gates.py`, 20 seeds unless noted)

| Gate | Target |
|---|---|
| F1 first contact | autoplay agent meets 花花 (sheep quest started) ≤ 20 s and finishes sheep quest ≤ 60 s from title tap in ≥ 90 % seeds |
| F2 quests completable | random-ish agent (random target order, 0.3–1.2 s delays, 20 % wasted taps) completes every quest ≤ 120 s in ≥ 95 % (10 quests × 20 seeds); ideal agent ≤ 90 s each |
| F3 zero dead taps | 500 random canvas taps across hub/end/nether/quests → `feedback.dead == 0`, feedback ≤ 100 ms |
| F4 funny beat per quest | every completed quest has ≥ 1 gag in `quests[id].gags`; 小凯 `appearances` ≥ 7 distinct quests |
| F5 board drag | CDP touch drag tray→row works for all 5 rows at 390×844 and 844×390, mouse at 1280×800; tap-tap fallback 5/5 |
| F6 performance | rAF p95 ≤ 25 ms at 1280×800 (headless; if SwiftShader baseline of an empty scene already exceeds 12 ms, gate = p95 ≤ 2× baseline), calls ≤ 150, tris ≤ 200k, no memory growth |
| F7 session length | ideal agent full run ≤ 14 min game time; random-ish median 15–25 min |
| F8 boot | title visible ≤ 1.5 s, world interactive ≤ 4 s after ▶, 0 console errors |
| F9 rival beat | steal fires in 100 % seeds; prison rescue ≤ 90 s for random-ish in ≥ 90 % |
| F10 show-don't-tell | `quest.pointer` non-null 100 % of active-quest frames; no HUD string > 12 CJK chars |
| F11 determinism | same seed + same input script → identical `getState()` JSON at 3600 frames (3/3) |
| F12 layout | 4 viewports: 0 scrollbars, 0 overlaps, targets ≥ 68 px, ≤ 5 controls in play |
| F13 juice | each quest complete → ≥ 60 particles + ≥ 1 sfx within 0.5 s; 完美 → confetti ≥ 150 |
| F14 persistence | reload mid-run → board, portraits, stars, done quests restored from `pageant_progress` |

Director's eye gate (not automatable): 2–3 play loops at 1280×800 and 844×390 in gbrowser; "is it funny and cute like
the video?" — every quest must have a visible laugh moment, the wall must look like the video's wall, the contestants
must be distinct at a glance. Cosmetic-only fixes are rejected when the ask was a feel problem.
