import * as THREE from 'three';
import { BLOCKS, BLOCK } from './blocks.js';

const PLAYER_RADIUS = 0.29;
const PLAYER_HEIGHT = 1.78;
const EYE_HEIGHT = 1.62;

export class Player {
  constructor(camera, { position, sensitivity = 1, health = 20, hunger = 20, pointerLockElement, isActive = () => true, mode = 'survival', onDamage = () => {}, onDeath = () => {} }) {
    this.camera = camera;
    this.position = position ? new THREE.Vector3(position.x, position.y, position.z) : new THREE.Vector3(0, 20, 0);
    this.velocityY = 0;
    this.yaw = 0;
    this.pitch = 0;
    this.sensitivity = sensitivity;
    this.health = health;
    this.hunger = hunger;
    this.onDamage = onDamage;
    this.onDeath = onDeath;
    this.pointerLockElement = pointerLockElement;
    this.isActive = isActive;
    this.mode = mode;
    this.flying = false;
    this.keys = new Set();
    this.onGround = false;
    this.sprinting = false;
    this.lastDamage = 0;
    this.hungerTimer = 0;
    this.regenTimer = 0;
    this.fallStart = this.position.y;
    this.handleKeyDown = event => {
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.code)) event.preventDefault();
      this.keys.add(event.code);
    };
    this.handleKeyUp = event => this.keys.delete(event.code);
    this.handleMouse = event => {
      if (!this.isActive()) return;
      if (document.pointerLockElement && document.pointerLockElement !== this.pointerLockElement) return;
      this.yaw -= event.movementX * 0.002 * this.sensitivity;
      this.pitch -= event.movementY * 0.002 * this.sensitivity;
      this.pitch = Math.max(-Math.PI / 2 + 0.02, Math.min(Math.PI / 2 - 0.02, this.pitch));
    };
    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('keyup', this.handleKeyUp);
    document.addEventListener('mousemove', this.handleMouse);
    this.camera.rotation.order = 'YXZ';
    this.syncCamera();
  }

  setSensitivity(value) { this.sensitivity = value; }
  setMode(mode) {
    this.mode = mode;
    if (mode === 'creative') {
      this.health = 20;
      this.hunger = 20;
      this.velocityY = 0;
      this.flying = false;
    }
  }

  isSolid(world, x, y, z) {
    const id = world.getBlock(x, y, z);
    return id !== BLOCK.AIR && id !== BLOCK.WATER && (BLOCKS[id]?.solid ?? true);
  }

  collides(world, x, feetY, z) {
    const minX = Math.floor(x - PLAYER_RADIUS), maxX = Math.floor(x + PLAYER_RADIUS);
    const minZ = Math.floor(z - PLAYER_RADIUS), maxZ = Math.floor(z + PLAYER_RADIUS);
    const minY = Math.floor(feetY + 0.025), maxY = Math.floor(feetY + PLAYER_HEIGHT - 0.025);
    for (let bx = minX; bx <= maxX; bx++) {
      for (let bz = minZ; bz <= maxZ; bz++) {
        for (let by = minY; by <= maxY; by++) {
          if (this.isSolid(world, bx, by, bz)) return true;
        }
      }
    }
    return false;
  }

  respawn(world) {
    this.health = 20;
    this.hunger = 20;
    this.velocityY = 0;
    this.position.set(0.5, world.terrain(0, 0).height + 1.05, 0.5);
    this.onGround = false;
    this.fallStart = this.position.y;
    this.onDeath();
  }

  damage(amount) {
    if (this.mode === 'creative') return;
    const now = performance.now();
    if (now - this.lastDamage < 800) return;
    this.lastDamage = now;
    this.health = Math.max(0, this.health - amount);
    this.onDamage();
  }

  update(dt, world) {
    const forwardInput = (this.keys.has('KeyW') ? 1 : 0) - (this.keys.has('KeyS') ? 1 : 0);
    const sideInput = (this.keys.has('KeyD') ? 1 : 0) - (this.keys.has('KeyA') ? 1 : 0);
    const length = Math.hypot(forwardInput, sideInput) || 1;
    const speed = this.keys.has('ShiftLeft') || this.keys.has('ShiftRight') ? 7.3 : 4.7;
    const forwardX = -Math.sin(this.yaw), forwardZ = -Math.cos(this.yaw);
    const rightX = Math.cos(this.yaw), rightZ = -Math.sin(this.yaw);
    const dx = (forwardX * forwardInput + rightX * sideInput) / length * speed * dt;
    const dz = (forwardZ * forwardInput + rightZ * sideInput) / length * speed * dt;
    const wasGrounded = this.onGround;
    if (dx && !this.collides(world, this.position.x + dx, this.position.y, this.position.z)) this.position.x += dx;
    if (dz && !this.collides(world, this.position.x, this.position.y, this.position.z + dz)) this.position.z += dz;

    if (this.mode === 'creative' && this.keys.has('KeyF')) {
      this.flying = !this.flying;
      this.keys.delete('KeyF');
    }
    if (this.mode === 'creative' && this.flying) {
      const vertical = (this.keys.has('Space') ? 1 : 0) - (this.keys.has('ControlLeft') || this.keys.has('ControlRight') ? 1 : 0);
      const flySpeed = this.keys.has('ShiftLeft') || this.keys.has('ShiftRight') ? 12 : 7;
      const next = new THREE.Vector3(dx, vertical * flySpeed * dt, dz);
      if (!this.collides(world, this.position.x + next.x, this.position.y + next.y, this.position.z + next.z)) {
        this.position.x += next.x;
        this.position.y += next.y;
        this.position.z += next.z;
      }
      this.velocityY = 0;
      this.onGround = false;
      this.syncCamera();
      return;
    }
    if (this.onGround && this.keys.has('Space')) {
      this.velocityY = 8.3;
      this.onGround = false;
      this.fallStart = this.position.y;
    }
    this.velocityY -= 22 * dt;
    const nextY = this.position.y + this.velocityY * dt;
    if (!this.collides(world, this.position.x, nextY, this.position.z)) {
      this.position.y = nextY;
      this.onGround = false;
    } else if (this.velocityY < 0) {
      const blockY = Math.floor(nextY + 0.025);
      this.position.y = blockY + 1;
      this.onGround = true;
      const fall = this.fallStart - this.position.y;
      if (this.mode === 'survival' && fall > 4) this.damage(Math.min(20, Math.floor(fall - 3)));
      this.velocityY = 0;
    } else {
      this.position.y = Math.floor(nextY + PLAYER_HEIGHT - 0.025) - PLAYER_HEIGHT;
      this.velocityY = 0;
    }
    if (this.position.y > this.fallStart) this.fallStart = this.position.y;
    if (this.mode === 'survival' && this.position.y < -8) this.respawn(world);
    if (this.mode === 'creative' && this.position.y < -8) this.position.y = 25;
    if (!wasGrounded && this.onGround) this.fallStart = this.position.y;

    if (this.mode === 'survival') this.hungerTimer += dt;
    if (this.mode === 'survival') {
      if (this.hungerTimer > 22) {
        this.hungerTimer = 0;
        this.hunger = Math.max(0, this.hunger - 1);
        if (this.hunger === 0) this.damage(1);
      }
      if (this.hunger >= 18 && this.health < 20) {
        this.regenTimer += dt;
        if (this.regenTimer > 4) {
          this.regenTimer = 0;
          this.health = Math.min(20, this.health + 1);
        }
      } else this.regenTimer = 0;
      if (this.health <= 0) this.respawn(world);
    }
    this.syncCamera();
  }

  syncCamera() {
    this.camera.position.set(this.position.x, this.position.y + EYE_HEIGHT, this.position.z);
    this.camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
  }

  dispose() {
    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('keyup', this.handleKeyUp);
    document.removeEventListener('mousemove', this.handleMouse);
  }
}
