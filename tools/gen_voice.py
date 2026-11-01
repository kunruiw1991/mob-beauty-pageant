#!/usr/bin/env python3
"""Regenerates the Mob Beauty Pageant voice-over clips (v1.1).

Holds the full line list (id -> speaker -> text), renders every line with edge-tts (Microsoft Edge neural voices),
trims leading/trailing silence + loudness-normalizes with ffmpeg (mono, 24 kHz, 48 kbps MP3, bit-exact, no tags)
into assets/voice/<id>.mp3, and writes the JS manifest src/data/voice_lines.js (id -> file, speaker, text, duration)
that src/fx/voice.js plays from. Deterministic: lines whose (voice, rate, pitch, text) did not change are skipped
(hash cache in assets/voice/.hashes.json), clips no longer in the list are deleted, and the manifest is written in
list order. Total size must stay <= 6 MB.

Usage:
  pip install edge-tts            # or point EDGE_TTS_BIN at an existing edge-tts executable
  python3 tools/gen_voice.py      # regenerate changed clips + manifest
  python3 tools/gen_voice.py --force
  python3 tools/gen_voice.py --check   # verify every manifest clip exists and the size budget holds (no network)
"""
from __future__ import annotations

import argparse
import concurrent.futures
import hashlib
import json
import os
import shutil
import subprocess
import sys
import tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(ROOT, 'assets', 'voice')
MANIFEST_JS = os.path.join(ROOT, 'src', 'data', 'voice_lines.js')
HASHES = os.path.join(OUT_DIR, '.hashes.json')
MAX_TOTAL_BYTES = 6 * 1024 * 1024
EDGE_TTS_BIN = os.environ.get('EDGE_TTS_BIN', 'edge-tts')

# speaker -> (edge-tts voice, rate, pitch). Narrator + contestants share the child voice (en-US-AnaNeural) with a
# distinct rate/pitch personality each; Kai, Bella and Mr. Question get their own adult voices.
SPEAKERS: dict[str, tuple[str, str, str]] = {
    'narrator': ('en-US-AnaNeural', '+0%', '+0Hz'),
    'sheep': ('en-US-AnaNeural', '+0%', '+8Hz'),          # Blossom: sweet
    'slime': ('en-US-AnaNeural', '+10%', '+14Hz'),        # Bobo: bouncy
    'cat': ('en-US-AnaNeural', '-8%', '+4Hz'),            # Mimi: shy
    'golem': ('en-US-AnaNeural', '-12%', '-22Hz'),        # Tinny: big and clunky
    'snow': ('en-US-AnaNeural', '+6%', '+10Hz'),          # Snowy: cheerful
    'creeper': ('en-US-AnaNeural', '-5%', '-6Hz'),        # Hissy: shy, then super happy
    'bee': ('en-US-AnaNeural', '+15%', '+18Hz'),          # Buzzy: zippy
    'ender': ('en-US-AnaNeural', '-10%', '-10Hz'),        # Endie: soft and calm
    'wither': ('en-US-AnaNeural', '+0%', '-15Hz'),        # Trio: low (three heads)
    'villager': ('en-US-AnaNeural', '-4%', '-5Hz'),       # Emma
    'dragon': ('en-US-AnaNeural', '+8%', '-12Hz'),        # Baby Dragon
    'pinksheep': ('en-US-AnaNeural', '+4%', '+20Hz'),     # Pinky: extra sweet
    'snowgolem': ('en-US-AnaNeural', '+0%', '-8Hz'),      # a plain snow golem mob
    'kai': ('en-US-GuyNeural', '+8%', '+6Hz'),            # rival Kai
    'bella': ('en-US-JennyNeural', '+4%', '+0Hz'),        # Bella
    'mrq': ('en-US-ChristopherNeural', '+0%', '-10Hz'),   # Mr. Question
    'skeleton': ('en-US-ChristopherNeural', '+18%', '+12Hz'),
}

# Shared tier reactions per personality group (4 groups x 5 rows). src/fx/voice.js maps every contestant to a group
# and tints playback rate per contestant so the shared clip still sounds like her.
TIER_GROUP_SPEAKER = {'sweet': 'sheep', 'bouncy': 'slime', 'cool': 'ender', 'spooky': 'wither'}

LINES: list[tuple[str, str, str]] = [
    # --- Narrator -------------------------------------------------------------------------------------------
    ('narr_welcome', 'narrator', 'Welcome to the Mob Beauty Pageant!'),
    ('narr_welcome_back', 'narrator', "Welcome back! Let's keep the show going!"),
    ('narr_booth', 'narrator', 'Strike a pose! Pick an accessory, then snap a photo!'),
    ('narr_booth2', 'narrator', 'Lights, camera, pose!'),
    ('narr_board', 'narrator', 'Drag her picture to a row!'),
    ('narr_board2', 'narrator', 'Which row will she go in?'),
    ('narr_next', 'narrator', "Who's next? Follow the light!"),
    ('narr_hidden', 'narrator', 'Wow! You found a secret contestant!'),
    ('narr_finale', 'narrator', "Wait a minute... who's that on the runway?"),
    ('narr_results', 'narrator', "Ta-da! Here's your final leaderboard. What a show!"),
    ('narr_end', 'narrator', 'Whoa! This is the End. Spooky, but sparkly!'),
    ('narr_nether', 'narrator', "Phew! It's super toasty in the Nether!"),
    # --- Contestants: intro (first meeting), quest hint, quest-complete cheer --------------------------------
    ('sheep_intro', 'sheep', "Hi! I'm Blossom! Flowers pop up wherever I walk!"),
    ('sheep_hint', 'sheep', 'Can you pick five sparkly flowers for me?'),
    ('sheep_cheer', 'sheep', 'A bouquet! Munch, munch... achoo! Thank you!'),
    ('slime_intro', 'slime', "Boing, boing! I'm Bobo! Want to play with my slimes?"),
    ('slime_hint', 'slime', 'Bop the big slimes, then pop the little ones!'),
    ('slime_cheer', 'slime', 'Hee hee! A tiny slime hat, just for me!'),
    ('cat_intro', 'cat', "Meow... I'm Mimi. I'm a little bit shy."),
    ('cat_hint', 'cat', "Only sneak closer when I'm not looking!"),
    ('cat_cheer', 'cat', "Purr! I got you a present. It's Kai's hat!"),
    ('golem_intro', 'golem', 'Clang, clang! Build me with iron blocks and a pumpkin!'),
    ('golem_hint', 'golem', 'Mine the iron ore... and maybe borrow a few blocks!'),
    ('golem_cheer', 'golem', 'Tinny is here! This flower is for you!'),
    ('snow_intro', 'snow', "Hi! I'm Snowy! Want to have a snowball fight?"),
    ('snow_hint', 'snow', 'Throw snowballs at Kai when he pops up!'),
    ('snow_cheer', 'snow', 'Ha ha! Kai turned into a snowman!'),
    ('creeper_intro', 'creeper', "Hiss... I'm Hissy. Everyone runs away from me."),
    ('creeper_hint', 'creeper', 'Pat me gently, right when I flash!'),
    ('creeper_cheer', 'creeper', "I'm so happy, I could pop! Confetti!"),
    ('bee_intro', 'bee', "Buzz, buzz! I'm Buzzy! Let's make flower music!"),
    ('bee_hint', 'bee', 'Watch my flowers, then tap them in the same order!'),
    ('bee_cheer', 'bee', "Buzz-tastic! You're sweeter than honey!"),
    ('ender_intro', 'ender', "Hello... I'm Endie. Can you help me out of this cage?"),
    ('ender_hint', 'ender', 'Tap the bars to set me free!'),
    ('ender_cheer', 'ender', 'You saved me! Best friends forever!'),
    ('wither_intro', 'wither', "Hi! Hi! Hi! I'm Trio! Three heads, three hellos!"),
    ('wither_hint', 'wither', 'Pop off the skull helmets, then dig up soul sand!'),
    ('wither_cheer', 'wither', 'Three heads, three hats! Achoo! Oops, a balloon!'),
    ('villager_intro', 'villager', "Hmm! I'm Emma! I only visit very rich people!"),
    ('villager_hint', 'villager', 'Fill my market stall with emeralds!'),
    ('villager_cheer', 'villager', 'Ka-ching! Look, my eyes turned into emeralds!'),
    ('dragon_intro', 'dragon', 'Rawr! Catch my egg, if you can!'),
    ('dragon_hint', 'dragon', 'Keep chasing the egg! It loves to hop!'),
    ('dragon_cheer', 'dragon', 'I hatched! Rawr! Hello, world!'),
    ('pinksheep_intro', 'pinksheep', "Baa... I'm just a plain little sheep."),
    ('pinksheep_hint', 'pinksheep', 'Can you find me a pink tulip?'),
    ('pinksheep_cheer', 'pinksheep', "I'm pink! Call me Pinky! Baa-utiful!"),
    # --- Tier reactions per personality group (never mean: every row is a happy row) ------------------------
    ('sweet_perfect', 'sheep', "Perfect? I'm the queen of the runway!"),
    ('sweet_gorgeous', 'sheep', 'Gorgeous! I feel so sparkly!'),
    ('sweet_pretty', 'sheep', 'Pretty! Aww, thank you!'),
    ('sweet_okay', 'sheep', 'Okay! Time for my silly dance!'),
    ('sweet_tryhard', 'sheep', "Keep trying! I'll practice and come back even cuter!"),
    ('bouncy_perfect', 'slime', 'Perfect! Boing, boing, hooray!'),
    ('bouncy_gorgeous', 'slime', 'Gorgeous! Wheee! Best day ever!'),
    ('bouncy_pretty', 'slime', 'Pretty! That deserves a happy bounce!'),
    ('bouncy_okay', 'slime', 'Okay! Watch my wiggle dance!'),
    ('bouncy_tryhard', 'slime', 'Keep trying! Push-ups! One, two, three!'),
    ('cool_perfect', 'ender', 'Perfect! This is the best day of my life!'),
    ('cool_gorgeous', 'ender', 'Gorgeous! Thank you, thank you!'),
    ('cool_pretty', 'ender', 'Pretty! That makes me smile.'),
    ('cool_okay', 'ender', "Okay! I'll dance anyway!"),
    ('cool_tryhard', 'ender', "Keep trying! I'll get stronger every day!"),
    ('spooky_perfect', 'wither', 'Perfect! Even my spooky side is smiling!'),
    ('spooky_gorgeous', 'wither', "Gorgeous! That's rawr-some!"),
    ('spooky_pretty', 'wither', 'Pretty! Hee hee hee!'),
    ('spooky_okay', 'wither', 'Okay! Spooky dance time!'),
    ('spooky_tryhard', 'wither', 'Keep trying! Flex, flex, flex!'),
    # --- Kai, the rival (always comically defeated) ---------------------------------------------------------
    ('kai_bounced', 'kai', 'Whoa, whoa, whoa! Splash! Not the pond!'),
    ('kai_hat', 'kai', "Hey! That's my hat!"),
    ('kai_pumpkins', 'kai', 'Ha ha! All the pumpkins are mine!'),
    ('kai_snowman', 'kai', "So cold! I'm a snowman now?"),
    ('kai_honey', 'kai', "Ugh! I'm stuck in the honey!"),
    ('kai_steal', 'kai', "Ha ha! She's coming with me! Catch me if you can!"),
    ('kai_cake', 'kai', "Mmm, cake... wait, I'm locked in my own cell!"),
    ('kai_faint', 'kai', "My emeralds! They're all gone! Oh no..."),
    ('kai_finale', 'kai', "Wait for me! I'm in the pageant too! Rank me!"),
    ('kai_r_perfect', 'kai', "Perfect? I'm crying happy tears!"),
    ('kai_r_gorgeous', 'kai', 'Gorgeous! I knew it! Ha ha!'),
    ('kai_r_pretty', 'kai', "Pretty? I'll take it!"),
    ('kai_r_okay', 'kai', 'Okay? Fine, watch my dance moves!'),
    ('kai_r_tryhard', 'kai', 'Keep trying? Push-ups! One, two, three!'),
    # --- Bella, Mr. Question and friends --------------------------------------------------------------------
    ('bella_nose', 'bella', "Hey! Who took my statue's nose?"),
    ('bella_pink', 'bella', "A pink sheep! She's mine now! So fluffy!"),
    ('mrq_diamonds', 'mrq', 'Oops! My diamonds! Oh well, finders keepers!'),
    ('skel_bald', 'skeleton', "Eek! My helmet! Don't look!"),
    ('snowgolem_pop', 'snowgolem', 'Boing! Hey, where did my head go?'),
    ('dragon_hop', 'dragon', 'Hee hee! Missed me!'),
]


def line_hash(speaker: str, text: str) -> str:
  voice, rate, pitch = SPEAKERS[speaker]
  return hashlib.sha1(f'{voice}|{rate}|{pitch}|{text}|v3'.encode('utf-8')).hexdigest()[:16]


def probe_duration(path: str) -> float:
  out = subprocess.check_output(
      ['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', path], text=True)
  return round(float(out.strip() or 0), 2)


def render(line_id: str, speaker: str, text: str, tmp_dir: str) -> str:
  voice, rate, pitch = SPEAKERS[speaker]
  raw = os.path.join(tmp_dir, f'{line_id}.raw.mp3')
  for attempt in range(3):
    try:
      subprocess.run([EDGE_TTS_BIN, '--voice', voice, f'--rate={rate}', f'--pitch={pitch}', '--text', text,
                      '--write-media', raw], check=True, capture_output=True, stdin=subprocess.DEVNULL, timeout=90)
      if os.path.getsize(raw) > 1000:
        break
    except (subprocess.SubprocessError, OSError) as e:  # network hiccup: retry
      if attempt == 2:
        raise RuntimeError(f'edge-tts failed for {line_id}: {e}') from e
  out = os.path.join(OUT_DIR, f'{line_id}.mp3')
  # Trim lead-in, tighten the TTS's long sentence pauses (~0.9 s) to ~0.25 s for snappy kid-game delivery,
  # trim the tail, then loudness-normalize.
  trim = ('silenceremove=start_periods=1:start_threshold=-48dB:start_silence=0.04,'
          'silenceremove=stop_periods=-1:stop_duration=0.12:stop_silence=0.12:stop_threshold=-40dB:window=0.01,'
          'areverse,silenceremove=start_periods=1:start_threshold=-48dB:start_silence=0.10,areverse,'
          'loudnorm=I=-16:TP=-1.5:LRA=11,aresample=24000')
  subprocess.run(['ffmpeg', '-nostdin', '-y', '-v', 'error', '-i', raw, '-af', trim, '-ac', '1', '-ar', '24000',
                  '-codec:a', 'libmp3lame', '-b:a', '48k', '-map_metadata', '-1', '-id3v2_version', '0',
                  '-write_xing', '0', '-fflags', '+bitexact', '-flags:a', '+bitexact', out],
                 check=True, capture_output=True, stdin=subprocess.DEVNULL, timeout=60)
  return out


def js_str(s: str) -> str:
  return json.dumps(s, ensure_ascii=False)


def write_manifest(durations: dict[str, float]) -> None:
  rows = []
  for line_id, speaker, text in LINES:
    rows.append(f'  {line_id}: Object.freeze({{ file: {js_str(line_id + ".mp3")}, speaker: {js_str(speaker)}, '
                f'text: {js_str(text)}, dur: {durations[line_id]} }}),')
  groups = ', '.join(f'{k}: {js_str(v)}' for k, v in TIER_GROUP_SPEAKER.items())
  body = (
      '// AUTO-GENERATED by tools/gen_voice.py (v1.1 voice-over) — edit the line list there, then re-run it.\n'
      '// id -> { file (in assets/voice/), speaker, text (English subtitle = spoken line), dur (seconds) }.\n'
      "export const VOICE_BASE = './assets/voice/';\n\n"
      'export const VOICE_LINES = Object.freeze({\n' + '\n'.join(rows) + '\n});\n\n'
      f'export const VOICE_TIER_GROUP_SPEAKER = Object.freeze({{ {groups} }});\n\n'
      'export const VOICE_LINE_IDS = Object.freeze(Object.keys(VOICE_LINES));\n'
  )
  with open(MANIFEST_JS, 'w', encoding='utf-8') as f:
    f.write(body)


def total_bytes() -> int:
  return sum(os.path.getsize(os.path.join(OUT_DIR, f'{lid}.mp3')) for lid, _, _ in LINES
             if os.path.exists(os.path.join(OUT_DIR, f'{lid}.mp3')))


def main() -> int:
  ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
  ap.add_argument('--force', action='store_true', help='re-render every clip')
  ap.add_argument('--check', action='store_true', help='verify files + budget only (no network)')
  ap.add_argument('--jobs', type=int, default=6)
  args = ap.parse_args()

  ids = [lid for lid, _, _ in LINES]
  assert len(ids) == len(set(ids)), 'duplicate line ids'
  for lid, spk, text in LINES:
    assert spk in SPEAKERS, f'{lid}: unknown speaker {spk}'
    assert text and len(text) <= 90, f'{lid}: text too long for a subtitle'

  if args.check:
    missing = [lid for lid in ids if not os.path.exists(os.path.join(OUT_DIR, f'{lid}.mp3'))]
    size = total_bytes()
    print(f'clips={len(ids)} missing={missing} total={size / 1048576:.2f} MB')
    return 0 if not missing and size <= MAX_TOTAL_BYTES else 1

  if shutil.which(EDGE_TTS_BIN) is None and not os.path.exists(EDGE_TTS_BIN):
    print(f'edge-tts not found ({EDGE_TTS_BIN}); pip install edge-tts or set EDGE_TTS_BIN', file=sys.stderr)
    return 2
  os.makedirs(OUT_DIR, exist_ok=True)
  try:
    with open(HASHES, encoding='utf-8') as f:
      hashes = json.load(f)
  except (OSError, ValueError):
    hashes = {}

  todo = [(lid, spk, text) for lid, spk, text in LINES
          if args.force or hashes.get(lid) != line_hash(spk, text)
          or not os.path.exists(os.path.join(OUT_DIR, f'{lid}.mp3'))]
  tmp_dir = tempfile.mkdtemp(prefix='gen_voice_', dir=os.environ.get('VOICE_TMP') or None)
  try:
    with concurrent.futures.ThreadPoolExecutor(max_workers=max(1, args.jobs)) as pool:
      futs = {pool.submit(render, lid, spk, text, tmp_dir): (lid, spk, text) for lid, spk, text in todo}
      for fut in concurrent.futures.as_completed(futs):
        lid, spk, text = futs[fut]
        fut.result()
        hashes[lid] = line_hash(spk, text)
        print(f'  rendered {lid}', flush=True)
  finally:
    shutil.rmtree(tmp_dir, ignore_errors=True)

  keep = {f'{lid}.mp3' for lid in ids}
  for name in os.listdir(OUT_DIR):
    if name.endswith('.mp3') and name not in keep:
      os.remove(os.path.join(OUT_DIR, name))
  hashes = {lid: hashes[lid] for lid in ids if lid in hashes}
  with open(HASHES, 'w', encoding='utf-8') as f:
    json.dump(hashes, f, indent=1, sort_keys=True)
    f.write('\n')

  durations = {lid: probe_duration(os.path.join(OUT_DIR, f'{lid}.mp3')) for lid in ids}
  write_manifest(durations)
  size = total_bytes()
  print(f'voice: {len(ids)} clips ({len(todo)} rendered), {size / 1048576:.2f} MB, '
        f'{sum(durations.values()):.1f} s total -> {os.path.relpath(MANIFEST_JS, ROOT)}')
  if size > MAX_TOTAL_BYTES:
    print('ERROR: voice clips exceed the 6 MB budget', file=sys.stderr)
    return 1
  return 0


if __name__ == '__main__':
  sys.exit(main())
