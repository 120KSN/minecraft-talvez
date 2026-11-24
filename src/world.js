import * as THREE from 'three';
import { BLOCK, BLOCKS } from './blocks.js';

export const CHUNK_SIZE = 16;
export const WORLD_HEIGHT = 40;
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
    const broad = valueNoise(x * 0.009, z * 0.009, this.seed);
    const detail = valueNoise(x * 0.038, z * 0.038, this.seed + 11);
    const ridge = 1 - Math.abs(valueNoise(x * 0.016, z * 0.016, this.seed + 29) * 2 - 1);
    const height = Math.floor(7 + broad * 11 + detail * 3 + ridge * 5);
    const biome = valueNoise(x * 0.012, z * 0.012, this.seed + 431);
    const beach = height <= SEA_LEVEL + 1;
    return { height: Math.max(4, Math.min(WORLD_HEIGHT - 7, height)), beach, forest: biome > 0.56 };
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
        if (terrain.beach || (!terrain.forest && random < 0.91)) continue;
        const top = terrain.height;
        if (x === px && z === pz && y > top && y <= top + 4) return BLOCK.WOOD;
        const dy = y - (top + 3);
        const dx = Math.abs(x - px), dz = Math.abs(z - pz);
        if (dy >= 0 && dy <= 2 && dx <= 2 && dz <= 2 && dx + dz + Math.max(0, dy - 1) <= 4 && !(dy === 0 && dx < 1 && dz < 1)) return BLOCK.LEAVES;
      }
    }
    return BLOCK.AIR;
  }

  naturalBlock(x, y, z) {
    if (y < 0 || y >= WORLD_HEIGHT) return BLOCK.AIR;
    if (y === 0) return BLOCK.BEDROCK;
    const { height, beach } = this.terrain(x, z);
    if (y <= height) {
      if (y === height) return beach ? BLOCK.SAND : BLOCK.GRASS;
      if (y >= height - 3) return beach ? BLOCK.SAND : BLOCK.DIRT;
      return BLOCK.STONE;
    }
    const tree = this.treeBlock(x, y, z);
    if (tree) return tree;
    if (y <= SEA_LEVEL) return BLOCK.WATER;
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
        const top = this.terrain(wx, wz).height;
        for (let y = 0; y <= Math.max(top, SEA_LEVEL); y++) {
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
            const tile = id === BLOCK.GRASS && face.normal[1] !== 1 ? 8 : BLOCKS[id].tile;
            const u0 = (tile * 16 + 0.5) / 144, u1 = ((tile + 1) * 16 - 0.5) / 144;
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
