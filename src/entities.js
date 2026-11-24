import * as THREE from 'three';
import { BLOCK } from './blocks.js';

export class EntityManager {
  constructor(scene, world) {
    this.scene = scene;
    this.world = world;
    this.entities = [];
    this.spawnTimer = 0;
  }

  createEntity(type, x, z) {
    let y = this.world.terrain(x, z).height + 1.05;
    const group = new THREE.Group();
    const bodyMaterial = new THREE.MeshLambertMaterial({ color: type === 'sheep' ? '#dedecf' : '#5f7d45' });
    const body = new THREE.Mesh(new THREE.BoxGeometry(type === 'sheep' ? 1.1 : 0.7, type === 'sheep' ? 0.8 : 1.2, type === 'sheep' ? 1.5 : 0.6), bodyMaterial);
    body.position.y = type === 'sheep' ? 0.55 : 0.85;
    body.castShadow = true;
    group.add(body);
    if (type === 'zombie') {
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.58, 0.58), new THREE.MeshLambertMaterial({ color: '#779b66' }));
      head.position.y = 1.62;
      head.castShadow = true;
      group.add(head);
    }
    group.position.set(x + 0.5, y, z + 0.5);
    this.scene.add(group);
    this.entities.push({
      type,
      group,
      health: type === 'sheep' ? 10 : 20,
      speed: type === 'sheep' ? 0.65 : 0.9,
      heading: Math.random() * Math.PI * 2,
      changeTimer: 1 + Math.random() * 4,
      attackTimer: 0
    });
  }

  spawnAround(player) {
    if (this.entities.length >= 10) return;
    const px = Math.floor(player.position.x), pz = Math.floor(player.position.z);
    for (let i = 0; i < 3; i++) {
      const angle = Math.random() * Math.PI * 2;
      const distance = 12 + Math.random() * 10;
      const x = Math.floor(px + Math.cos(angle) * distance);
      const z = Math.floor(pz + Math.sin(angle) * distance);
      const terrain = this.world.terrain(x, z);
      if (terrain.height < 6 || terrain.beach) continue;
      const night = this.world.timePhase ?? 0;
      const hostile = night > 0.65 && terrain.biome !== 'swamp';
      this.createEntity(hostile ? 'zombie' : 'sheep', x, z);
    }
  }

  update(dt, player, gameState) {
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this.spawnTimer = 8;
      this.spawnAround(player);
    }
    for (let i = this.entities.length - 1; i >= 0; i--) {
      const entity = this.entities[i];
      entity.changeTimer -= dt;
      entity.attackTimer -= dt;
      if (entity.changeTimer <= 0) {
        entity.heading += (Math.random() - 0.5) * 2.2;
        entity.changeTimer = 2 + Math.random() * 5;
      }
      const dx = Math.cos(entity.heading) * entity.speed * dt;
      const dz = Math.sin(entity.heading) * entity.speed * dt;
      const nx = Math.floor(entity.group.position.x + dx);
      const nz = Math.floor(entity.group.position.z + dz);
      const y = Math.floor(entity.group.position.y);
      if (this.world.getBlock(nx, y - 1, nz) !== BLOCK.AIR &&
          this.world.getBlock(nx, y, nz) === BLOCK.AIR) {
        entity.group.position.x += dx;
        entity.group.position.z += dz;
      } else entity.heading += Math.PI * (0.7 + Math.random() * 0.6);
      const surface = this.world.terrain(Math.floor(entity.group.position.x), Math.floor(entity.group.position.z)).height + 1.05;
      entity.group.position.y = THREE.MathUtils.lerp(entity.group.position.y, surface, Math.min(1, dt * 5));
      if (entity.type === 'zombie') {
        const distance = entity.group.position.distanceTo(player.position);
        if (distance < 8) {
          entity.heading = Math.atan2(player.position.z - entity.group.position.z, player.position.x - entity.group.position.x);
          if (distance < 1.25 && entity.attackTimer <= 0) {
            entity.attackTimer = 1.2;
            if (gameState.mode === 'survival') player.damage(2);
          }
        }
      }
    }
  }

  hit(camera, damage = 2) {
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
    raycaster.far = 4;
    for (let i = this.entities.length - 1; i >= 0; i--) {
      const entity = this.entities[i];
      const hits = raycaster.intersectObject(entity.group, true);
      if (!hits.length) continue;
      entity.health -= damage;
      if (entity.health <= 0) {
        this.scene.remove(entity.group);
        this.entities.splice(i, 1);
      }
      return true;
    }
    return false;
  }

  dispose() {
    for (const entity of this.entities) {
      this.scene.remove(entity.group);
      entity.group.traverse(child => {
        if (child.geometry) child.geometry.dispose();
        if (child.material) child.material.dispose();
      });
    }
    this.entities.length = 0;
  }
}
