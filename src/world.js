import * as THREE from 'three';
import { BLOCK, BLOCKS } from './blocks.js';

export const CHUNK_SIZE = 16;
export const WORLD_HEIGHT = 64;
const SEA_LEVEL = 10;
const FACE_DATA = [
  { normal: [1, 0, 0], corners: [[1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1]], shade: 0.82 },
  { normal: [-1, 0, 0], corners: [[0, 0, 1], [0, 1, 1], [0, 1, 0], [0, 0, 0]], shade: 0.78 },
  { normal: [0, 1, 0], corners: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]], shade: 1 },
  { normal: [0, -1, 0], corners: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]], shade: 0.55 },
  { normal: [0, 0, 1], corners: [[1, 0, 1], [1, 1, 1], [0, 1, 1], [0, 0, 1]], shade: 0.9 },
  { normal: [0, 0, -1], corners: [[0, 0, 0], [0, 1, 0], [1, 1, 0], [1, 0, 0]], shade: 0.85 }
];
const TRIANGLES = [0, 1, 2, 0, 2, 3];

function hash2(x, z, seed) {
  let value = Math.imul(x, 374761393) + Math.imul(z, 668265263) + Math.imul(seed | 0, 1442695041);
  value = Math.imul(value ^ (value >>> 13), 1274126177);
  return ((value ^ (value >>> 16)) >>> 0) / 4294967295;
}

function smooth(t) { return t * t * (3 - 2 * t); }

function valueNoise(x, z, seed) {
  const x0 = Math.floor(x), z0 = Math.floor(z);
  const tx = smooth(x - x0), tz = smooth(z - z0);
  const a = hash2(x0, z0, seed), b = hash2(x0 + 1, z0, seed);
  const c = hash2(x0, z0 + 1, seed), d = hash2(x0 + 1, z0 + 1, seed);
  const top = a + (b - a) * tx;
  const bottom = c + (d - c) * tx;
  return top + (bottom - top) * tz;
}

function floorDiv(value, divisor) { return Math.floor(value / divisor); }

export class VoxelWorld {
  constructor(scene, atlas, { seed, edits = {}, renderDistance = 2, onBlockChange = () => {} }) {
    this.scene = scene;
    this.atlas = atlas;
    this.seed = seed >>> 0;
    this.edits = edits;
    this.renderDistance = renderDistance;
    this.onBlockChange = onBlockChange;
    this.chunks = new Map();
    this.material = new THREE.MeshLambertMaterial({ map: atlas.texture, vertexColors: true });
    this.lastCenter = null;
  }

  terrain(x, z) {
    const broad = valueNoise(x * 0.006, z * 0.006, this.seed);
    const detail = valueNoise(x * 0.025, z * 0.025, this.seed + 11);
    const ridge = valueNoise(x * 0.014, z * 0.014, this.seed + 29);
    const moisture = valueNoise(x * 0.009, z * 0.009, this.seed + 431);
    const temperature = valueNoise(x * 0.008, z * 0.008, this.seed + 733);
    let biome = 'plain';
    if (temperature > 0.68 && moisture < 0.45) biome = 'desert';
    else if (temperature < 0.32) biome = 'snow';
    else if (moisture < 0.28) biome = 'swamp';
    else if (moisture > 0.62) biome = 'forest';
    else if (broad > 0.72 || ridge > 0.78) biome = 'mountain';
    const mountainBoost = biome === 'mountain' ? 13 * ridge : 0;
    const plainHeight = 8 + broad * 8 + detail * 4;
    const river = Math.abs(valueNoise(x * 0.018, z * 0.018, this.seed + 991) - 0.5);
    const riverDepth = river < 0.018 ? Math.floor((0.018 - river) * 170) : 0;
    let height = Math.floor(plainHeight + mountainBoost - riverDepth);
    if (biome === 'swamp') height = Math.floor(SEA_LEVEL + 1 + detail * 2);
    if (height <= SEA_LEVEL + 2) biome = 'beach';
    const beach = height <= SEA_LEVEL + 1;
    return {
      height: Math.max(4, Math.min(WORLD_HEIGHT - 9, height)),
      beach,
      forest: biome === 'forest' || biome === 'plain',
      biome,
      moisture,
      temperature
    };
  }

  treeBlock(x, y, z) {
    const cell = 7;
    const cx = floorDiv(x, cell), cz = floorDiv(z, cell);
    for (let oz = -1; oz <= 1; oz++) {
      for (let ox = -1; ox <= 1; ox++) {
        const tx = cx + ox, tz = cz + oz;
        const random = hash2(tx, tz, this.seed + 71);
        const px = tx * cell + Math.floor(hash2(tx, tz, this.seed + 3) * cell);
        const pz = tz * cell + Math.floor(random * cell);
        const terrain = this.terrain(px, pz);
        if (terrain.beach || terrain.biome === 'desert' || terrain.biome === 'snow' || (!terrain.forest && random < 0.84)) continue;
        const top = terrain.height;
        const trunkHeight = terrain.biome === 'forest' ? 5 : 4;
        if (x === px && z === pz && y > top && y <= top + trunkHeight) return BLOCK.WOOD;
        const dy = y - (top + trunkHeight - 1);
        const dx = Math.abs(x - px), dz = Math.abs(z - pz);
        if (dy >= 0 && dy <= 2 && dx <= 2 && dz <= 2 && dx + dz + Math.max(0, dy - 1) <= 4 && !(dy === 0 && dx < 1 && dz < 1)) return BLOCK.LEAVES;
      }
    }
    return BLOCK.AIR;
  }

  naturalBlock(x, y, z) {
    if (y < 0 || y >= WORLD_HEIGHT) return BLOCK.AIR;
    if (y === 0) return BLOCK.BEDROCK;
    const terrain = this.terrain(x, z);
    const { height, beach, biome } = terrain;
    if (y <= height) {
      if (y === height) {
        if (biome === 'desert') return BLOCK.SAND;
        if (biome === 'snow') return BLOCK.SNOW;
        if (biome === 'swamp' && y <= SEA_LEVEL + 2) return BLOCK.DIRT;
        return beach ? BLOCK.SAND : BLOCK.GRASS;
      }
      if (y >= height - 3) {
        if (biome === 'desert') return BLOCK.SAND;
        if (biome === 'snow') return y === height - 1 ? BLOCK.SNOW : BLOCK.DIRT;
        return beach ? BLOCK.SAND : BLOCK.DIRT;
      }
      if (y > 4 && y < height - 4) {
        const ore = hash2(x, z, this.seed + y * 53);
        if (ore > 0.985) return BLOCK.COAL;
      }
      if (y > 5 && y < height - 5 && biome !== 'mountain') {
        const cave1 = valueNoise(x * 0.08, z * 0.08, this.seed + y * 17);
        const cave2 = valueNoise(x * 0.16 + y * 0.03, z * 0.16, this.seed + 821);
        if (cave1 > 0.68 && cave2 > 0.64) return BLOCK.AIR;
      }
      return BLOCK.STONE;
    }
    const tree = this.treeBlock(x, y, z);
    if (tree) return tree;
    if (y <= SEA_LEVEL) return BLOCK.WATER;
    if (y === terrain.height + 1) {
      if (terrain.biome === 'plain' || terrain.biome === 'forest') {
        const vegetation = hash2(x, z, this.seed + 1201);
        if (vegetation > 0.985) return BLOCK.FLOWER;
        if (vegetation > 0.92) return BLOCK.TALL_GRASS;
      }
      if (terrain.biome === 'swamp') {
        if (hash2(x, z, this.seed + 1403) > 0.97) return BLOCK.TALL_GRASS;
      }
    }
    return BLOCK.AIR;
  }

  key(x, y, z) { return `${x},${y},${z}`; }

  getBlock(x, y, z) {
    x = Math.floor(x); y = Math.floor(y); z = Math.floor(z);
    const key = this.key(x, y, z);
    if (Object.prototype.hasOwnProperty.call(this.edits, key)) return this.edits[key];
    const chunk = this.chunks.get(`${floorDiv(x, CHUNK_SIZE)},${floorDiv(z, CHUNK_SIZE)}`);
    if (chunk) return chunk.data[this.index(x, y, z)];
    return this.naturalBlock(x, y, z);
  }

  index(x, y, z) {
    return (y * CHUNK_SIZE + (z - floorDiv(z, CHUNK_SIZE) * CHUNK_SIZE)) * CHUNK_SIZE +
      (x - floorDiv(x, CHUNK_SIZE) * CHUNK_SIZE);
  }

  chunkKey(cx, cz) { return `${cx},${cz}`; }

  createChunk(cx, cz) {
    const data = new Uint8Array(WORLD_HEIGHT * CHUNK_SIZE * CHUNK_SIZE);
    const chunk = { cx, cz, data, mesh: null };
    for (let z = 0; z < CHUNK_SIZE; z++) {
      for (let x = 0; x < CHUNK_SIZE; x++) {
        const wx = cx * CHUNK_SIZE + x, wz = cz * CHUNK_SIZE + z;
        for (let y = 0; y < WORLD_HEIGHT; y++) {
          data[(y * CHUNK_SIZE + z) * CHUNK_SIZE + x] = this.naturalBlock(wx, y, wz);
        }
      }
    }
    for (const [key, id] of Object.entries(this.edits)) {
      const [x, y, z] = key.split(',').map(Number);
      if (floorDiv(x, CHUNK_SIZE) === cx && floorDiv(z, CHUNK_SIZE) === cz && y >= 0 && y < WORLD_HEIGHT) {
        data[this.index(x, y, z)] = id;
      }
    }
    return chunk;
  }

  loadAround(x, z) {
    const centerX = floorDiv(Math.floor(x), CHUNK_SIZE);
    const centerZ = floorDiv(Math.floor(z), CHUNK_SIZE);
    if (this.lastCenter && this.lastCenter.x === centerX && this.lastCenter.z === centerZ) return;
    this.lastCenter = { x: centerX, z: centerZ };
    const radius = this.renderDistance;
    const wanted = new Set();
    for (let dz = -radius; dz <= radius; dz++) {
      for (let dx = -radius; dx <= radius; dx++) {
        const cx = centerX + dx, cz = centerZ + dz;
        const key = this.chunkKey(cx, cz);
        wanted.add(key);
        if (!this.chunks.has(key)) {
          const chunk = this.createChunk(cx, cz);
          this.chunks.set(key, chunk);
          this.buildChunk(chunk);
        }
      }
    }
    for (const [key, chunk] of this.chunks) {
      if (!wanted.has(key)) {
        this.scene.remove(chunk.mesh);
        chunk.mesh.geometry.dispose();
        this.chunks.delete(key);
      }
    }
  }

  buildChunk(chunk) {
    const positions = [], normals = [], uvs = [], colors = [], indices = [];
    for (let y = 0; y < WORLD_HEIGHT; y++) {
      for (let z = 0; z < CHUNK_SIZE; z++) {
        for (let x = 0; x < CHUNK_SIZE; x++) {
          const id = chunk.data[(y * CHUNK_SIZE + z) * CHUNK_SIZE + x];
          if (!id) continue;
          const wx = chunk.cx * CHUNK_SIZE + x, wz = chunk.cz * CHUNK_SIZE + z;
          for (const face of FACE_DATA) {
            const neighborId = this.getBlock(wx + face.normal[0], y + face.normal[1], wz + face.normal[2]);
            if (neighborId && ((BLOCKS[neighborId]?.solid ?? true) || neighborId === id)) continue;
            const start = positions.length / 3;
            const tile = id === BLOCK.GRASS && face.normal[1] !== 1 ? 1 : BLOCKS[id].tile;
            const u0 = (tile * 16 + 0.5) / 240, u1 = ((tile + 1) * 16 - 0.5) / 240;
            const v0 = 0.5 / 16, v1 = 15.5 / 16;
            const faceUvs = [[u0, v0], [u0, v1], [u1, v1], [u1, v0]];
            for (let i = 0; i < 6; i++) {
              const cornerIndex = TRIANGLES[i], corner = face.corners[cornerIndex];
              positions.push(x + corner[0], y + corner[1], z + corner[2]);
              normals.push(...face.normal);
              uvs.push(...faceUvs[cornerIndex]);
              const variation = 0.93 + hash2(wx + corner[0], wz + corner[2], this.seed + y * 19) * 0.07;
              colors.push(face.shade * variation, face.shade * variation, face.shade * variation);
              indices.push(start + i);
            }
          }
        }
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometry.setIndex(indices);
    geometry.computeBoundingSphere();
    if (chunk.mesh) {
      this.scene.remove(chunk.mesh);
      chunk.mesh.geometry.dispose();
    }
    chunk.mesh = new THREE.Mesh(geometry, this.material);
    chunk.mesh.position.set(chunk.cx * CHUNK_SIZE, 0, chunk.cz * CHUNK_SIZE);
    chunk.mesh.castShadow = true;
    chunk.mesh.receiveShadow = true;
    this.scene.add(chunk.mesh);
  }

  setBlock(x, y, z, id) {
    x = Math.floor(x); y = Math.floor(y); z = Math.floor(z);
    if (y < 0 || y >= WORLD_HEIGHT) return false;
    const key = this.key(x, y, z);
    const original = this.naturalBlock(x, y, z);
    if (id === original) delete this.edits[key];
    else this.edits[key] = id;
    const cx = floorDiv(x, CHUNK_SIZE), cz = floorDiv(z, CHUNK_SIZE);
    const affected = [[cx, cz]];
    if (x % CHUNK_SIZE === 0) affected.push([cx - 1, cz]);
    if (x % CHUNK_SIZE === CHUNK_SIZE - 1) affected.push([cx + 1, cz]);
    if (z % CHUNK_SIZE === 0) affected.push([cx, cz - 1]);
    if (z % CHUNK_SIZE === CHUNK_SIZE - 1) affected.push([cx, cz + 1]);
    for (const [acx, acz] of affected) {
      const chunk = this.chunks.get(this.chunkKey(acx, acz));
      if (!chunk) continue;
      chunk.data[this.index(x, y, z)] = id;
      this.buildChunk(chunk);
    }
    this.onBlockChange(key, id);
    return true;
  }

  dispose() {
    for (const chunk of this.chunks.values()) {
      this.scene.remove(chunk.mesh);
      chunk.mesh.geometry.dispose();
    }
    this.chunks.clear();
    this.material.dispose();
    this.atlas.texture.dispose();
  }
}
