import * as THREE from '../../vendor/three.module.min.js';
import { mergeGeometries, createCanvas } from './skins.js';

export const ACCESSORY_IDS = [
  'crown', 'flowerCrown', 'bow', 'strawHat', 'topHat', 'sunglasses',
  'partyHat', 'pumpkinHat', 'slimeHat', 'beanie', 'headphones', 'halo',
  'scarf', 'beret', 'starClip', 'chefHat',
];

let sharedAccMat = null;
const accGeoCache = new Map();
const _euler = new THREE.Euler();
const _mat4 = new THREE.Matrix4();

function getAccMat() {
  if (!sharedAccMat) {
    sharedAccMat = new THREE.MeshLambertMaterial({ vertexColors: true });
  }
  return sharedAccMat;
}

function vox(w, h, d, hex, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
  const g = new THREE.BoxGeometry(w, h, d);
  if (rx || ry || rz) {
    _euler.set(rx, ry, rz, 'XYZ');
    _mat4.makeRotationFromEuler(_euler);
    g.applyMatrix4(_mat4);
  }
  if (x || y || z) g.translate(x, y, z);
  const c = new THREE.Color(hex);
  const cnt = g.attributes.position.count;
  const arr = new Float32Array(cnt * 3);
  for (let i = 0; i < cnt; i++) {
    arr[i * 3] = c.r;
    arr[i * 3 + 1] = c.g;
    arr[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return g;
}

export function getAccessoryGeometry(accId) {
  if (accGeoCache.has(accId)) return accGeoCache.get(accId);
  const b = [];
  switch (accId) {
    case 'crown':
      // Royal gold band + spikes + 3 gems (≤ 14 boxes)
      b.push(vox(0.68, 0.14, 0.68, 0xfcc419, 0, 0.07, 0));
      b.push(vox(0.70, 0.05, 0.70, 0xffe066, 0, 0.025, 0));
      b.push(vox(0.14, 0.20, 0.12, 0xffd43b, 0, 0.22, 0.28));
      b.push(vox(0.12, 0.15, 0.12, 0xffe066, -0.26, 0.19, 0.26));
      b.push(vox(0.12, 0.15, 0.12, 0xffe066, 0.26, 0.19, 0.26));
      b.push(vox(0.12, 0.15, 0.12, 0xfcc419, -0.26, 0.19, -0.26));
      b.push(vox(0.12, 0.15, 0.12, 0xfcc419, 0.26, 0.19, -0.26));
      b.push(vox(0.12, 0.16, 0.12, 0xffd43b, 0, 0.20, -0.28));
      b.push(vox(0.10, 0.10, 0.06, 0xe03131, 0, 0.10, 0.35));
      b.push(vox(0.08, 0.08, 0.06, 0x339af0, -0.20, 0.09, 0.35));
      b.push(vox(0.08, 0.08, 0.06, 0x2f9e44, 0.20, 0.09, 0.35));
      break;

    case 'flowerCrown':
      // Leafy wreath + 6 bright pixel blossoms
      b.push(vox(1.14, 0.12, 0.12, 0x40c057, 0, 0.02, 0.52));
      b.push(vox(1.14, 0.12, 0.12, 0x37b24d, 0, 0.02, -0.52));
      b.push(vox(0.12, 0.12, 1.00, 0x40c057, -0.52, 0.02, 0));
      b.push(vox(0.12, 0.12, 1.00, 0x40c057, 0.52, 0.02, 0));
      b.push(vox(0.20, 0.20, 0.10, 0xff6b9d, -0.30, 0.05, 0.57));
      b.push(vox(0.08, 0.08, 0.12, 0xffe066, -0.30, 0.05, 0.59));
      b.push(vox(0.22, 0.22, 0.10, 0xffd43b, 0, 0.07, 0.58));
      b.push(vox(0.08, 0.08, 0.12, 0xf76707, 0, 0.07, 0.60));
      b.push(vox(0.20, 0.20, 0.10, 0x74c0fc, 0.30, 0.05, 0.57));
      b.push(vox(0.08, 0.08, 0.12, 0xffffff, 0.30, 0.05, 0.59));
      b.push(vox(0.18, 0.18, 0.10, 0xda77f2, -0.56, 0.05, 0.16));
      b.push(vox(0.18, 0.18, 0.10, 0xff8787, 0.56, 0.05, 0.16));
      break;

    case 'bow':
      // Big cute stepped ribbon bow perched clearly on head/hood
      b.push(vox(0.16, 0.16, 0.16, 0xe64980, 0.12, 0.14, 0.36, 0, 0, -0.10));
      b.push(vox(0.28, 0.28, 0.14, 0xff6b9d, -0.10, 0.18, 0.35, 0, 0, 0.12));
      b.push(vox(0.28, 0.28, 0.14, 0xff6b9d, 0.34, 0.13, 0.35, 0, 0, -0.22));
      b.push(vox(0.16, 0.14, 0.16, 0xff85a2, -0.14, 0.18, 0.36));
      b.push(vox(0.16, 0.14, 0.16, 0xff85a2, 0.38, 0.12, 0.36));
      b.push(vox(0.10, 0.20, 0.10, 0xf06595, 0.04, 0.02, 0.38, 0, 0, 0.28));
      b.push(vox(0.10, 0.20, 0.10, 0xf06595, 0.20, 0.01, 0.38, 0, 0, -0.35));
      break;

    case 'strawHat':
      b.push(vox(1.42, 0.07, 1.42, 0xf3d078, 0, 0.035, 0));
      b.push(vox(1.24, 0.05, 1.24, 0xe8be5a, 0, 0.07, 0));
      b.push(vox(0.88, 0.28, 0.88, 0xedd07e, 0, 0.21, 0));
      b.push(vox(0.91, 0.09, 0.91, 0xe03131, 0, 0.12, 0));
      b.push(vox(0.14, 0.16, 0.10, 0xc92a2a, 0.46, 0.11, 0.20));
      break;

    case 'topHat':
      b.push(vox(1.16, 0.08, 1.16, 0x1e2028, 0, 0.04, 0));
      b.push(vox(0.76, 0.56, 0.76, 0x2b2e3b, 0, 0.34, 0));
      b.push(vox(0.79, 0.11, 0.79, 0xd9342b, 0, 0.13, 0));
      b.push(vox(0.16, 0.13, 0.06, 0xffd43b, 0, 0.13, 0.40));
      break;

    case 'sunglasses':
      // Deal-with-it pixel shades over chibi eyes
      b.push(vox(1.04, 0.08, 0.08, 0x111116, 0, -0.30, 0.53));
      b.push(vox(0.36, 0.22, 0.09, 0x18181f, -0.25, -0.38, 0.53));
      b.push(vox(0.36, 0.22, 0.09, 0x18181f, 0.25, -0.38, 0.53));
      b.push(vox(0.28, 0.08, 0.09, 0x272730, -0.25, -0.48, 0.53));
      b.push(vox(0.28, 0.08, 0.09, 0x272730, 0.25, -0.48, 0.53));
      // Pixel shine bars
      b.push(vox(0.08, 0.14, 0.10, 0x74c0fc, -0.33, -0.36, 0.54));
      b.push(vox(0.06, 0.08, 0.10, 0xffffff, -0.25, -0.33, 0.55));
      b.push(vox(0.08, 0.14, 0.10, 0x74c0fc, 0.17, -0.36, 0.54));
      b.push(vox(0.06, 0.08, 0.10, 0xffffff, 0.25, -0.33, 0.55));
      // Side temples
      b.push(vox(0.07, 0.08, 0.58, 0x111116, -0.52, -0.30, 0.24));
      b.push(vox(0.07, 0.08, 0.58, 0x111116, 0.52, -0.30, 0.24));
      break;

    case 'partyHat':
      b.push(vox(0.60, 0.16, 0.60, 0x4dabf7, 0, 0.08, 0));
      b.push(vox(0.46, 0.16, 0.46, 0xff6b9d, 0, 0.24, 0));
      b.push(vox(0.32, 0.16, 0.32, 0xffd43b, 0, 0.40, 0));
      b.push(vox(0.18, 0.14, 0.18, 0x69db7c, 0, 0.55, 0));
      b.push(vox(0.20, 0.18, 0.20, 0xffffff, 0, 0.69, 0));
      break;

    case 'pumpkinHat':
      b.push(vox(0.84, 0.54, 0.84, 0xf76707, 0, 0.27, 0));
      b.push(vox(0.88, 0.48, 0.60, 0xe8590c, 0, 0.27, 0));
      b.push(vox(0.60, 0.48, 0.88, 0xe8590c, 0, 0.27, 0));
      b.push(vox(0.14, 0.18, 0.14, 0x37b24d, 0.03, 0.60, 0, 0, 0, -0.2));
      b.push(vox(0.16, 0.14, 0.06, 0xffe066, -0.18, 0.31, 0.43));
      b.push(vox(0.16, 0.14, 0.06, 0xffe066, 0.18, 0.31, 0.43));
      b.push(vox(0.36, 0.10, 0.06, 0xffe066, 0, 0.15, 0.43));
      break;

    case 'slimeHat':
      // Cute pet slime riding on head
      b.push(vox(0.66, 0.50, 0.66, 0x69db7c, 0, 0.25, 0));
      b.push(vox(0.42, 0.32, 0.42, 0x2f9e44, 0, 0.22, 0));
      b.push(vox(0.11, 0.11, 0.06, 0x143d14, -0.14, 0.27, 0.33));
      b.push(vox(0.11, 0.11, 0.06, 0x143d14, 0.14, 0.27, 0.33));
      b.push(vox(0.10, 0.06, 0.06, 0xff85a2, -0.22, 0.19, 0.33));
      b.push(vox(0.10, 0.06, 0.06, 0xff85a2, 0.22, 0.19, 0.33));
      break;

    case 'beanie':
      b.push(vox(1.06, 0.18, 1.06, 0xe03131, 0, 0.02, 0));
      b.push(vox(0.92, 0.22, 0.92, 0xfa5252, 0, 0.21, 0));
      b.push(vox(0.72, 0.14, 0.72, 0xff6b6b, 0, 0.38, 0));
      b.push(vox(0.24, 0.22, 0.24, 0xffffff, 0, 0.52, 0));
      break;

    case 'headphones':
      b.push(vox(1.12, 0.10, 0.22, 0x364fc7, 0, 0.08, 0));
      b.push(vox(0.92, 0.06, 0.16, 0x74c0fc, 0, 0.13, 0));
      b.push(vox(0.11, 0.50, 0.18, 0x364fc7, -0.55, -0.18, 0));
      b.push(vox(0.11, 0.50, 0.18, 0x364fc7, 0.55, -0.18, 0));
      b.push(vox(0.20, 0.36, 0.36, 0xff6b9d, -0.57, -0.44, 0));
      b.push(vox(0.20, 0.36, 0.36, 0xff6b9d, 0.57, -0.44, 0));
      b.push(vox(0.08, 0.22, 0.22, 0xffffff, -0.66, -0.44, 0));
      b.push(vox(0.08, 0.22, 0.22, 0xffffff, 0.66, -0.44, 0));
      break;

    case 'halo':
      b.push(vox(0.68, 0.10, 0.12, 0xffe066, 0, 0.36, 0.34));
      b.push(vox(0.68, 0.10, 0.12, 0xffe066, 0, 0.36, -0.34));
      b.push(vox(0.12, 0.10, 0.56, 0xffe066, -0.34, 0.36, 0));
      b.push(vox(0.12, 0.10, 0.56, 0xffe066, 0.34, 0.36, 0));
      b.push(vox(0.12, 0.10, 0.12, 0xffffff, -0.26, 0.38, 0.26));
      b.push(vox(0.12, 0.10, 0.12, 0xffffff, 0.26, 0.38, -0.26));
      break;

    case 'scarf':
      // Snug knit collar right below chibi chin + prominent front scarf tails!
      b.push(vox(0.88, 0.16, 0.66, 0xe03131, 0, -0.06, 0.02));
      b.push(vox(0.90, 0.05, 0.68, 0xffe8cc, 0, -0.06, 0.02));
      b.push(vox(0.24, 0.42, 0.14, 0xe03131, 0.16, -0.26, 0.34, 0, 0, -0.08));
      b.push(vox(0.24, 0.08, 0.15, 0xffe8cc, 0.18, -0.42, 0.34, 0, 0, -0.08));
      b.push(vox(0.20, 0.28, 0.12, 0xc92a2a, -0.05, -0.20, 0.32, 0, 0, 0.06));
      break;

    case 'beret':
      b.push(vox(0.98, 0.16, 0.94, 0x9c36b5, 0.09, 0.10, 0, 0, 0, -0.15));
      b.push(vox(0.78, 0.12, 0.76, 0xae3ec9, 0.11, 0.20, 0, 0, 0, -0.15));
      b.push(vox(0.09, 0.13, 0.09, 0x3b1d4a, 0.13, 0.29, 0, 0, 0, -0.15));
      break;

    case 'starClip':
      b.push(vox(0.22, 0.22, 0.10, 0xffd43b, 0.34, -0.18, 0.52));
      b.push(vox(0.10, 0.38, 0.10, 0xffe066, 0.34, -0.18, 0.53));
      b.push(vox(0.38, 0.10, 0.10, 0xffe066, 0.34, -0.18, 0.53));
      b.push(vox(0.10, 0.10, 0.11, 0xffffff, 0.34, -0.18, 0.54));
      b.push(vox(0.14, 0.08, 0.10, 0xff85a2, 0.14, -0.18, 0.52));
      break;

    case 'chefHat':
    default:
      b.push(vox(0.82, 0.20, 0.82, 0xe9ecef, 0, 0.10, 0));
      b.push(vox(0.92, 0.32, 0.92, 0xffffff, 0, 0.34, 0));
      b.push(vox(0.56, 0.26, 0.56, 0xf8f9fa, -0.18, 0.44, 0.14));
      b.push(vox(0.56, 0.26, 0.56, 0xf8f9fa, 0.18, 0.44, -0.14));
      b.push(vox(0.54, 0.24, 0.54, 0xffffff, 0.16, 0.44, 0.16));
      break;
  }
  const merged = mergeGeometries(b);
  accGeoCache.set(accId, merged);
  return merged;
}

export function createAccessoryMesh(accId) {
  if (!accId) return null;
  const geo = getAccessoryGeometry(accId);
  const mesh = new THREE.Mesh(geo, getAccMat());
  mesh.name = `acc_${accId}`;
  return mesh;
}

export function drawAccessoryThumb(accId, size = 96) {
  const c = createCanvas(size, size);
  const g = c.getContext('2d');
  if (!g) return c;
  g.imageSmoothingEnabled = false;
  g.clearRect(0, 0, size, size);

  const sub = createCanvas(16, 16);
  const p = sub.getContext('2d');
  if (!p) return c;
  const px = (x, y, w, h, col) => { p.fillStyle = col; p.fillRect(x, y, w, h); };

  switch (accId) {
    case 'crown':
      px(2, 9, 12, 4, '#fcc419'); px(2, 5, 2, 4, '#ffd43b'); px(7, 4, 2, 5, '#ffe066'); px(12, 5, 2, 4, '#ffd43b');
      px(7, 10, 2, 2, '#e03131'); px(4, 10, 1, 2, '#339af0'); px(11, 10, 1, 2, '#2f9e44');
      break;
    case 'flowerCrown':
      px(2, 7, 12, 3, '#40c057'); px(3, 5, 3, 4, '#ff6b9d'); px(7, 4, 3, 4, '#ffd43b'); px(11, 5, 3, 4, '#74c0fc');
      px(4, 6, 1, 1, '#fff'); px(8, 5, 1, 1, '#f76707'); px(12, 6, 1, 1, '#fff');
      break;
    case 'bow':
      px(2, 4, 5, 8, '#ff6b9d'); px(9, 4, 5, 8, '#ff6b9d'); px(6, 6, 4, 4, '#e64980');
      px(5, 10, 2, 4, '#f06595'); px(9, 10, 2, 4, '#f06595');
      break;
    case 'strawHat':
      px(1, 10, 14, 2, '#f3d078'); px(4, 5, 8, 5, '#edd07e'); px(4, 8, 8, 2, '#e03131');
      break;
    case 'topHat':
      px(2, 12, 12, 2, '#1e2028'); px(4, 3, 8, 9, '#2b2e3b'); px(4, 10, 8, 2, '#d9342b'); px(7, 10, 2, 2, '#ffd43b');
      break;
    case 'sunglasses':
      px(1, 6, 14, 2, '#111116'); px(2, 7, 5, 4, '#18181f'); px(9, 7, 5, 4, '#18181f');
      px(3, 8, 1, 2, '#74c0fc'); px(4, 8, 1, 1, '#fff'); px(10, 8, 1, 2, '#74c0fc');
      break;
    case 'partyHat':
      px(3, 11, 10, 3, '#4dabf7'); px(5, 8, 6, 3, '#ff6b9d'); px(6, 5, 4, 3, '#ffd43b'); px(7, 2, 2, 3, '#ffffff');
      break;
    case 'pumpkinHat':
      px(3, 5, 10, 8, '#f76707'); px(7, 2, 2, 3, '#37b24d'); px(5, 7, 2, 2, '#ffe066'); px(9, 7, 2, 2, '#ffe066'); px(6, 10, 4, 1, '#ffe066');
      break;
    case 'slimeHat':
      px(3, 4, 10, 9, '#69db7c'); px(5, 6, 6, 6, '#2f9e44'); px(5, 7, 2, 2, '#143d14'); px(9, 7, 2, 2, '#143d14');
      break;
    case 'beanie':
      px(3, 10, 10, 3, '#e03131'); px(4, 6, 8, 4, '#fa5252'); px(6, 2, 4, 4, '#ffffff');
      break;
    case 'headphones':
      px(4, 3, 8, 2, '#364fc7'); px(3, 5, 2, 5, '#364fc7'); px(11, 5, 2, 5, '#364fc7');
      px(2, 8, 3, 5, '#ff6b9d'); px(11, 8, 3, 5, '#ff6b9d');
      break;
    case 'halo':
      px(3, 6, 10, 2, '#ffe066'); px(2, 7, 2, 2, '#ffd43b'); px(12, 7, 2, 2, '#ffd43b'); px(3, 9, 10, 2, '#fcc419');
      break;
    case 'scarf':
      px(3, 4, 10, 4, '#e03131'); px(3, 6, 10, 1, '#ffe8cc'); px(8, 8, 4, 6, '#e03131'); px(8, 12, 4, 1, '#ffe8cc');
      break;
    case 'beret':
      px(3, 6, 11, 5, '#9c36b5'); px(4, 5, 8, 2, '#ae3ec9'); px(8, 3, 2, 2, '#3b1d4a');
      break;
    case 'starClip':
      px(7, 2, 2, 12, '#ffe066'); px(2, 7, 12, 2, '#ffe066'); px(5, 5, 6, 6, '#ffd43b'); px(7, 7, 2, 2, '#fff');
      break;
    case 'chefHat':
    default:
      px(4, 10, 8, 3, '#dee2e6'); px(2, 4, 12, 6, '#ffffff'); px(4, 2, 8, 3, '#f8f9fa');
      break;
  }
  g.drawImage(sub, 0, 0, size, size);
  return c;
}
