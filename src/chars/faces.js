import * as THREE from '../../vendor/three.module.min.js';
import { createCanvas, canvasToTexture, shadeHex } from './skins.js';

const emoteCache = new Map();

/**
 * Paints an 8x8 pixel chibi face at (fx, fy) with big 2x3 sparkling eyes + blush + hair bangs.
 */
export function paintChibiFace(g, fx, fy, opts = {}) {
  if (!g) return;
  const skin = opts.skin || '#ffe0c8';
  const skinShade = shadeHex(skin, -12);
  const eye = opts.eye || '#2b2238';
  const eyeLight = opts.eyeLight || shadeHex(eye, 55);
  const lash = opts.lash || '#1a1423';
  const blush = opts.blush || '#ff85a2';
  const hair = opts.hair || null;
  const bangs = opts.bangs || 'parted';
  const mouth = opts.mouth || 'smile';
  const tallEyes = opts.tallEyes !== false;

  // Base skin + soft top shadow
  g.fillStyle = skin;
  g.fillRect(fx, fy, 8, 8);
  g.fillStyle = skinShade;
  g.fillRect(fx, fy, 8, 1);
  g.fillRect(fx + 2, fy + 7, 4, 1);
  g.fillStyle = skin;
  g.fillRect(fx + 1, fy + 7, 6, 1);

  if (opts.questionFace) {
    g.fillStyle = '#111116';
    g.fillRect(fx, fy, 8, 8);
    g.fillStyle = '#ffffff';
    // Cute pixel '?' + eyes like video 09:10
    g.fillRect(fx + 2, fy + 1, 4, 1);
    g.fillRect(fx + 5, fy + 2, 1, 2);
    g.fillRect(fx + 3, fy + 3, 2, 1);
    g.fillRect(fx + 3, fy + 4, 1, 1);
    g.fillRect(fx + 3, fy + 6, 1, 1);
    g.fillStyle = '#74c0fc';
    g.fillRect(fx + 1, fy + 5, 1, 1);
    g.fillRect(fx + 6, fy + 5, 1, 1);
    return;
  }

  // Hair bangs on forehead
  if (hair && bangs !== 'none') {
    const hairHi = shadeHex(hair, 18);
    g.fillStyle = hair;
    g.fillRect(fx, fy, 8, 2);
    g.fillStyle = hairHi;
    g.fillRect(fx + 1, fy, 2, 1);
    g.fillRect(fx + 5, fy, 2, 1);
    if (bangs === 'parted') {
      g.fillStyle = skin;
      g.fillRect(fx + 3, fy + 1, 2, 1);
      g.fillStyle = hair;
      g.fillRect(fx, fy + 2, 1, 2);
      g.fillRect(fx + 7, fy + 2, 1, 2);
    } else if (bangs === 'spiky') {
      g.fillStyle = skin;
      g.fillRect(fx + 1, fy + 1, 1, 1);
      g.fillRect(fx + 4, fy + 1, 2, 1);
      g.fillStyle = hair;
      g.fillRect(fx + 2, fy + 2, 2, 1);
    } else if (bangs === 'hood') {
      g.fillStyle = skin;
      g.fillRect(fx + 1, fy + 1, 6, 1);
      if (opts.innerHair) {
        g.fillStyle = opts.innerHair;
        g.fillRect(fx + 2, fy + 1, 4, 1);
      }
      g.fillStyle = hair;
      g.fillRect(fx, fy, 8, 1);
      g.fillRect(fx, fy + 1, 1, 6);
      g.fillRect(fx + 7, fy + 1, 1, 6);
    } else if (bangs === 'long') {
      g.fillStyle = skin;
      g.fillRect(fx + 3, fy + 1, 2, 1);
      g.fillStyle = hair;
      g.fillRect(fx, fy + 2, 1, 6);
      g.fillRect(fx + 7, fy + 2, 1, 6);
    }
  }

  // Big 2x3 or 2x2 pixel eyes (x = 1..2 and 5..6)
  if (tallEyes) {
    // Upper lash + sparkle
    g.fillStyle = lash;
    g.fillRect(fx + 1, fy + 2, 2, 1);
    g.fillRect(fx + 5, fy + 2, 2, 1);
    // Sclera + iris
    g.fillStyle = eye;
    g.fillRect(fx + 1, fy + 3, 2, 2);
    g.fillRect(fx + 5, fy + 3, 2, 2);
    g.fillStyle = eyeLight;
    g.fillRect(fx + 2, fy + 4, 1, 1);
    g.fillRect(fx + 5, fy + 4, 1, 1);
    // Crisp white specular catchlight
    g.fillStyle = '#ffffff';
    g.fillRect(fx + 1, fy + 3, 1, 1);
    g.fillRect(fx + 6, fy + 3, 1, 1);
  } else {
    g.fillStyle = '#ffffff';
    g.fillRect(fx + 1, fy + 3, 2, 2);
    g.fillRect(fx + 5, fy + 3, 2, 2);
    g.fillStyle = eye;
    g.fillRect(fx + 2, fy + 3, 1, 2);
    g.fillRect(fx + 5, fy + 3, 1, 2);
  }

  // Blush pixels
  if (blush) {
    g.fillStyle = blush;
    g.fillRect(fx + 0, fy + 5, 2, 1);
    g.fillRect(fx + 6, fy + 5, 2, 1);
  }

  // Optional tiny pixel nose accent (cat pink dot / snow orange dot)
  if (opts.noseDot) {
    g.fillStyle = opts.noseDot;
    g.fillRect(fx + 3, fy + 5, 2, 1);
  }

  // Mouth
  if (mouth === 'grin') {
    // Mischievous rival grin
    g.fillStyle = '#3b1d26';
    g.fillRect(fx + 2, fy + 6, 4, 1);
    g.fillStyle = '#ffffff';
    g.fillRect(fx + 3, fy + 6, 3, 1);
    g.fillStyle = lash;
    g.fillRect(fx + 5, fy + 2, 2, 1); // cocked brow
  } else if (mouth === 'cat') {
    g.fillStyle = '#c24162';
    g.fillRect(fx + 2, fy + 6, 1, 1);
    g.fillRect(fx + 5, fy + 6, 1, 1);
    g.fillRect(fx + 3, fy + 5, 2, 1);
  } else if (mouth === 'open') {
    g.fillStyle = '#e64980';
    g.fillRect(fx + 3, fy + 6, 2, 1);
  } else if (mouth === 'shy') {
    g.fillStyle = '#b85d6f';
    g.fillRect(fx + 3, fy + 6, 2, 1);
  } else {
    g.fillStyle = '#d65c75';
    g.fillRect(fx + 3, fy + 6, 2, 1);
  }
}

/**
 * Draws an iconic 8x8 MC mob / contestant face scaled crisply to `size` for NEXT picture frame & badges.
 */
export function drawMobIconCanvas(kind, size = 96) {
  const c = createCanvas(size, size);
  const g = c.getContext('2d');
  if (!g) return c;
  g.imageSmoothingEnabled = false;

  const sub = createCanvas(8, 8);
  const s = sub.getContext('2d');
  if (!s) return c;

  switch (kind) {
    case 'sheep':
    case 'sheepMob':
      s.fillStyle = '#f8f5eb'; s.fillRect(0, 0, 8, 8);
      s.fillStyle = '#e6c5ad'; s.fillRect(1, 2, 6, 5);
      s.fillStyle = '#ffffff'; s.fillRect(1, 3, 2, 1); s.fillRect(5, 3, 2, 1);
      s.fillStyle = '#2b2b2b'; s.fillRect(1, 3, 1, 1); s.fillRect(6, 3, 1, 1);
      s.fillStyle = '#ff9ebb'; s.fillRect(3, 5, 2, 1);
      break;
    case 'pinksheep':
      s.fillStyle = '#ff8fab'; s.fillRect(0, 0, 8, 8);
      s.fillStyle = '#f4c7b8'; s.fillRect(1, 2, 6, 5);
      s.fillStyle = '#ffffff'; s.fillRect(1, 3, 2, 1); s.fillRect(5, 3, 2, 1);
      s.fillStyle = '#881337'; s.fillRect(1, 3, 1, 1); s.fillRect(6, 3, 1, 1);
      s.fillStyle = '#ff4d8d'; s.fillRect(3, 5, 2, 1);
      break;
    case 'slime':
    case 'slimeMob':
      s.fillStyle = '#6ce048'; s.fillRect(0, 0, 8, 8);
      s.fillStyle = '#3da832'; s.fillRect(1, 1, 6, 6);
      s.fillStyle = '#143d14'; s.fillRect(1, 2, 2, 2); s.fillRect(5, 2, 2, 2);
      s.fillRect(4, 5, 1, 1);
      break;
    case 'cat':
    case 'catMob':
      s.fillStyle = '#f4a261'; s.fillRect(0, 0, 8, 8);
      s.fillStyle = '#fff3e0'; s.fillRect(2, 4, 4, 4);
      s.fillStyle = '#2fb344'; s.fillRect(1, 3, 2, 1); s.fillRect(5, 3, 2, 1);
      s.fillStyle = '#ff7597'; s.fillRect(3, 5, 2, 1);
      break;
    case 'golem':
      s.fillStyle = '#e2e5e9'; s.fillRect(0, 0, 8, 8);
      s.fillStyle = '#51cf66'; s.fillRect(0, 0, 2, 3); s.fillRect(6, 5, 2, 3);
      s.fillStyle = '#d9342b'; s.fillRect(1, 3, 2, 1); s.fillRect(5, 3, 2, 1);
      s.fillStyle = '#adb5bd'; s.fillRect(3, 4, 2, 3);
      break;
    case 'snow':
    case 'snowGolemMob':
      s.fillStyle = '#f8f9fa'; s.fillRect(0, 0, 8, 8);
      s.fillStyle = '#212529'; s.fillRect(1, 2, 1, 1); s.fillRect(6, 2, 1, 1);
      s.fillStyle = '#f76707'; s.fillRect(3, 3, 2, 1);
      s.fillStyle = '#212529'; s.fillRect(1, 5, 1, 1); s.fillRect(2, 6, 4, 1); s.fillRect(6, 5, 1, 1);
      break;
    case 'creeper':
      s.fillStyle = '#52b74a'; s.fillRect(0, 0, 8, 8);
      s.fillStyle = '#69db7c'; s.fillRect(0, 0, 3, 2); s.fillRect(5, 6, 3, 2);
      s.fillStyle = '#111812';
      s.fillRect(1, 2, 2, 2); s.fillRect(5, 2, 2, 2);
      s.fillRect(3, 4, 2, 2); s.fillRect(2, 5, 1, 2); s.fillRect(5, 5, 1, 2);
      break;
    case 'bee':
    case 'beeMob':
      s.fillStyle = '#ffd43b'; s.fillRect(0, 0, 8, 8);
      s.fillStyle = '#4a3218'; s.fillRect(0, 0, 8, 1); s.fillRect(0, 7, 8, 1);
      s.fillStyle = '#18181b'; s.fillRect(1, 2, 2, 3); s.fillRect(5, 2, 2, 3);
      s.fillStyle = '#74c0fc'; s.fillRect(1, 2, 1, 1); s.fillRect(5, 2, 1, 1);
      break;
    case 'ender':
    case 'endermanMob':
      s.fillStyle = '#14101d'; s.fillRect(0, 0, 8, 8);
      s.fillStyle = '#f8d0ff'; s.fillRect(0, 4, 3, 1); s.fillRect(5, 4, 3, 1);
      s.fillStyle = '#d946ef'; s.fillRect(1, 4, 1, 1); s.fillRect(6, 4, 1, 1);
      break;
    case 'wither':
    case 'witherSkeleton':
      s.fillStyle = '#242228'; s.fillRect(0, 0, 8, 8);
      s.fillStyle = '#3b3742'; s.fillRect(1, 1, 6, 2);
      s.fillStyle = '#74c0fc'; s.fillRect(1, 4, 2, 1); s.fillRect(5, 4, 2, 1);
      s.fillStyle = '#111115'; s.fillRect(2, 6, 4, 1);
      break;
    case 'villager':
    case 'villagerMob':
      s.fillStyle = '#d49a78'; s.fillRect(0, 0, 8, 8);
      s.fillStyle = '#5c3c24'; s.fillRect(1, 2, 6, 1);
      s.fillStyle = '#2f9e44'; s.fillRect(1, 3, 2, 1); s.fillRect(5, 3, 2, 1);
      s.fillStyle = '#b57b5b'; s.fillRect(3, 4, 2, 3);
      break;
    case 'dragon':
      s.fillStyle = '#1d1528'; s.fillRect(0, 0, 8, 8);
      s.fillStyle = '#a855f7'; s.fillRect(1, 0, 2, 1); s.fillRect(5, 0, 2, 1);
      s.fillStyle = '#f0abfc'; s.fillRect(1, 4, 2, 1); s.fillRect(5, 4, 2, 1);
      s.fillStyle = '#c026d3'; s.fillRect(2, 6, 4, 1);
      break;
    case 'kai':
      paintChibiFace(s, 0, 0, { hair: '#261c1a', bangs: 'spiky', eye: '#18181b', mouth: 'grin', tallEyes: false });
      break;
    default:
      paintChibiFace(s, 0, 0, { hair: '#4a321f', eye: '#2b2238' });
      break;
  }

  g.drawImage(sub, 0, 0, size, size);
  return c;
}

export function createEmoteSprite(icon) {
  if (!icon) return null;
  const text = String(icon);
  let mat = emoteCache.get(text);
  const isWide = text.length > 2;
  if (!mat) {
    const w = isWide ? 192 : 80;
    const h = 80;
    const c = createCanvas(w, h);
    const g = c.getContext('2d');
    if (g) {
      g.clearRect(0, 0, w, h);
      g.fillStyle = 'rgba(255,255,255,0.97)';
      g.strokeStyle = '#1e1b24';
      g.lineWidth = 5;
      g.beginPath();
      g.roundRect(6, 6, w - 12, 54, 16);
      g.fill();
      g.stroke();
      // Speech tail
      g.beginPath();
      g.moveTo(w / 2 - 9, 58);
      g.lineTo(w / 2, 73);
      g.lineTo(w / 2 + 9, 58);
      g.closePath();
      g.fill();
      g.stroke();
      g.fillStyle = '#ffffff';
      g.fillRect(w / 2 - 7, 55, 14, 6);

      // Custom vibrant vector/pixel art for core emotes (works even without OS color-emoji fonts!)
      if (text === '😜') {
        g.fillStyle = '#ffd43b';
        g.strokeStyle = '#d97706';
        g.lineWidth = 2.5;
        g.beginPath();
        g.arc(w / 2, 33, 18, 0, Math.PI * 2);
        g.fill();
        g.stroke();
        // Wink left eye '>'
        g.strokeStyle = '#1e1b24';
        g.lineWidth = 3;
        g.beginPath();
        g.moveTo(w / 2 - 11, 26);
        g.lineTo(w / 2 - 5, 30);
        g.lineTo(w / 2 - 11, 33);
        g.stroke();
        // Big open right eye
        g.fillStyle = '#ffffff';
        g.beginPath();
        g.arc(w / 2 + 7, 29, 5, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = '#1e1b24';
        g.beginPath();
        g.arc(w / 2 + 7, 29, 2.6, 0, Math.PI * 2);
        g.fill();
        // Grin + sticking-out pink tongue
        g.fillStyle = '#4a1525';
        g.beginPath();
        g.arc(w / 2, 36, 9, 0, Math.PI);
        g.fill();
        g.fillStyle = '#ff4d8d';
        g.beginPath();
        g.roundRect(w / 2 - 3, 38, 8, 10, 4);
        g.fill();
      } else if (text === '💢') {
        g.strokeStyle = '#e03131';
        g.lineWidth = 4.5;
        g.lineCap = 'round';
        const cx = w / 2, cy = 33;
        // 4 curved anger-vein brackets
        const veins = [
          [-13, -5, -5, -5, -5, -13],
          [13, -5, 5, -5, 5, -13],
          [-13, 5, -5, 5, -5, 13],
          [13, 5, 5, 5, 5, 13],
        ];
        for (const [x1, y1, xm, ym, x2, y2] of veins) {
          g.beginPath();
          g.moveTo(cx + x1, cy + y1);
          g.quadraticCurveTo(cx + xm, cy + ym, cx + x2, cy + y2);
          g.stroke();
        }
      } else if (text === '❤') {
        const cx = w / 2, cy = 35;
        g.fillStyle = '#ff3b6b';
        g.beginPath();
        g.moveTo(cx, cy + 13);
        g.bezierCurveTo(cx - 20, cy + 1, cx - 18, cy - 16, cx, cy - 6);
        g.bezierCurveTo(cx + 18, cy - 16, cx + 20, cy + 1, cx, cy + 13);
        g.fill();
        g.fillStyle = '#ffffff';
        g.fillRect(cx - 9, cy - 8, 4, 4);
      } else if (text === '?' || text === '!') {
        g.fillStyle = text === '?' ? '#2563eb' : '#e03131';
        g.font = '900 40px system-ui, sans-serif';
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText(text, w / 2, 34);
      } else if (text === '🎂') {
        const cx = w / 2;
        g.fillStyle = '#f59f00';
        g.fillRect(cx - 14, 34, 28, 12);
        g.fillStyle = '#ffffff';
        g.fillRect(cx - 15, 28, 30, 7);
        g.fillStyle = '#e03131';
        g.fillRect(cx - 10, 24, 4, 4);
        g.fillRect(cx - 2, 24, 4, 4);
        g.fillRect(cx + 6, 24, 4, 4);
        g.fillStyle = '#ffd43b';
        g.fillRect(cx - 1, 17, 2, 7);
      } else {
        g.fillStyle = '#18181b';
        g.font = isWide ? '900 24px "Noto Sans SC", system-ui, sans-serif' : '900 34px system-ui, sans-serif';
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText(text.slice(0, 10), w / 2, 34);
      }
    }
    const tex = canvasToTexture(c);
    mat = new THREE.SpriteMaterial({
      map: tex,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
      fog: false,
    });
    emoteCache.set(text, mat);
  }
  const spr = new THREE.Sprite(mat);
  spr.scale.set(isWide ? 2.0 : 0.9, 0.9, 1);
  spr.renderOrder = 25;
  return spr;
}
