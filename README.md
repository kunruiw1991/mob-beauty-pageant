# 我的世界：生物选美大赛 · Mob Beauty Pageant

**▶ Play now: https://kunruiw1991.github.io/mob-beauty-pageant/** (iPad / phone / desktop — touch first, no install)

![Mob Beauty Pageant — 小凯 crashes the runway in front of the tier wall](screenshot.jpg)

A kid-friendly, silly (沙雕) voxel 3D browser game inspired by the Bilibili video
[《我的世界：生物美貌排行榜！在线选美大赛！》BV1XynB6EEpk](https://www.bilibili.com/video/BV1XynB6EEpk) by 辰羊游戏.
Explore a compact blocky island, finish a short tactile mini-quest to meet each Minecraft mob contestant,
dress her up on the runway, snap a polaroid, and **drag her portrait onto the giant 5-row tier wall** — while the
rival **小凯** keeps getting in the way (and keeps losing, hilariously).

Every row is a happy row: 👑 完美 · 💎 超漂亮 · 🌸 漂亮 · 🙂 一般 · 💪 再努力 — contestants always react with joy or a
funny dance, and the crowd of pigs, chickens, cows, villagers and creepers cheers along. Humor comes from the quests
and the rival, never from looks.

## How to play

| Action | Touch / mouse |
|---|---|
| Walk | Tap the ground (or anything — you walk to it) |
| Interact | Tap the glowing thing / the contestant (you walk over first) |
| Look around | Drag on the world with one finger |
| Find the next contestant | Follow the light beacon, or tap the edge arrow with her face |
| Rank | Drag the polaroid onto a row (or tap the card, then a row) |
| Board / pause | 🏆 chip top-left · ⏸ top-right |

≤ 4 buttons on screen while playing, all ≥ 68 px. No text walls: icons, beacons and picture hints show the way.
Progress (board, portraits, stars) is saved in the browser (`pageant_progress`). A full run takes about 15–25 minutes.

**Stars:** ★ rank all 10 contestants · ★ find both hidden contestants · ★ finish within 20 minutes.

## Contestants

| # | 选手 | Mob | Quest | Gag |
|---|---|---|---|---|
| 1 | 花花 | 羊 Sheep | Pick 5 sparkly flowers from the trail she grows, hand her the bouquet | She eats the bouquet and sneezes petals |
| 2 | 啵啵 | 史莱姆 Slime | Bop her bouncing slimes (big ones split) | 小凯 gets bounced into the pond; a tiny slime moves onto her head |
| 3 | 喵喵 | 猫 Cat | Sneak through the jungle while she isn't looking, offer a fish | Her "gift" is 小凯's stolen hat |
| 4 | 铁铁 | 铁傀儡 Iron Golem | Mine iron, "borrow" blocks from 贝拉's statue, get a pumpkin, build the T | Fake-iron dirt swap (贝拉 💢), 小凯 hogs the pumpkins, a snow golem's head pops off |
| 5 | 雪宝 | 雪傀儡 Snow Golem | Snowball fight against 小凯 behind his snow wall | 小凯 ends up as a snowman |
| 6 | 嘶嘶 | 苦力怕 Creeper | Calm her fuse with well-timed pats | Her happy explosion is pure confetti |
| 7 | 嗡嗡 | 蜜蜂 Bee | Simon-says: tap the flowers in the order she visits them | 小凯 gets stuck on a honey block |
| 8 | 小末 | 末影人 Enderman | Free her in the End — 小凯 steals her — cross his lava-ring prison with a cake decoy | 小凯 ends up locked in his own cell with cake on his face |
| 9 | 三三 | 凋零 Wither | Pop skull helmets off wither skeletons in the Nether, dig soul sand, build the T | Bald skeletons run off blushing; her 3 heads want 3 hats |
| 10 | 翠翠 | 村民 Villager | Get "rich": trades, the ?-man's dropped diamonds, crack 小凯 Bank's passcode chest | Her eyes turn into emeralds; 小凯 faints at his empty chest |
| H1 | 龙宝宝 | 末影龙 (hidden) | Chase the teleporting dragon egg in the End | The egg hops away every time |
| H2 | 粉粉 | 粉色羊 (hidden) | Find the pink tulip, give it to the one white sheep | Pink puff — and 贝拉 claims her |
| ★ | 小凯 | rival | Finale: struts the runway in all his junk and demands to be ranked | Push-ups on 再努力, happy tears on 完美 |

## World

One ~80×80 hub island — plaza with the tier wall, runway, mob bleachers and red-caped "?" mystery figures (they
flip to reveal each contestant), flower meadow, swamp, iron cave, village with 贝拉's statue and 小凯 Bank, snowy
pocket, jungle, 小凯's prismarine house and lava-ring prison — plus End and Nether pockets reached through portals.

## Tech

- Zero-build ES2022 modules + vendored Three.js r170; all 16×16 block textures, mob skins, accessories and sounds
  are generated procedurally in code (canvas + WebAudio). No assets, no CDN, no speech synthesis.
- Chunked voxel meshes with hidden-face culling, baked vertex AO, one atlas material, a terrain "cutaway" shader so
  trees never hide the player, A* tap-to-walk on the voxel grid, instanced crowd and particle pools.
- Fixed-timestep 60 Hz deterministic simulation with a frozen `window.__PAGEANT__` test seam
  (`startGame`, `teleport`, `completeQuest`, `rank`, `stepFrames`, `getState`, …).
- Tests (headless Chrome over CDP): `python3 tests/smoke.py`, `python3 tests/run_e2e.py` (36 checks),
  `python3 tests/layout_audit.py` (1280×800, 1024×768, 844×390, 390×844), `python3 tests/sim_gates.py`
  (14 fun gates over 20 seeds: first contact, quest completability, zero dead taps, a gag per quest, touch drag on the
  board, performance, session length, determinism, persistence…).

See [docs/DESIGN.md](docs/DESIGN.md) for the full design and the fun gates.

## Changelog

- **v1.0** — 10 contestants + 2 hidden + rival finale; 10 tactile quests (24 gags with a gag camera); End + Nether;
  runway dress-up with 16 voxel accessories and polaroid portraits; drag-to-rank tier wall mirrored in 3D; final
  排行榜 with stars and PNG sharing; MC-mob crowd; procedural music and SFX; iPad/phone layouts.

Fan-made tribute for family fun; not affiliated with Mojang/Microsoft or the video's creator.
