import * as THREE from 'three';
import { BLOCK, BLOCKS, blockItem, createBlockAtlas } from './blocks.js';
import { Player } from './player.js';
import { VoxelWorld, CHUNK_SIZE } from './world.js';
import { newGameState, readSave, readSettings, writeSave, writeSettings } from './storage.js';
import { RECIPES, TOOLS } from './items.js';
import { canCraft, craftTool } from './crafting.js';
import { EntityManager } from './entities.js';

const $ = selector => document.querySelector(selector);
const gameRoot = $('#game');
const hud = $('#hud');
const hotbarRoot = $('#hotbar');
const inventoryGrid = $('#inventory-grid');
const inventoryHotbar = $('#inventory-hotbar');
const toastRoot = $('#toast');
let settings;
try {
  settings = readSettings();
} catch (error) {
  console.error('Falha ao carregar as configurações:', error);
  settings = { renderDistance: 2, sensitivity: 1, volume: 0.04 };
}
let gameState = null;
let world = null;
let player = null;
let renderer = null;
let scene = null;
let camera = null;
let sunlight = null;
let hemisphere = null;
let clock = new THREE.Clock();
let mode = 'menu';
let previousScreen = 'menu';
let toastTimer = 0;
let autosaveTimer = 0;
let ambientContext = null;
let ambientGain = null;
let lastPointerLocked = false;
let selectedHit = null;
let entityManager = null;
const particles = [];

function showToast(message) {
  toastRoot.textContent = message;
  toastRoot.classList.add('visible');
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toastRoot.classList.remove('visible'), 2300);
}

function updateHealthHud() {
  if (!player) return;
  const status = $('.status');
  if (status) status.classList.toggle('hidden', gameState?.mode === 'creative');
  $('#health').innerHTML = Array.from({ length: 10 }, (_, i) =>
    `<span class="${i < Math.ceil(player.health / 2) ? 'heart-full' : 'heart-empty'}">${i < Math.ceil(player.health / 2) ? '♥' : '♡'}</span>`
  ).join('');
  $('#hunger').innerHTML = Array.from({ length: 10 }, (_, i) =>
    `<span class="${i < Math.ceil(player.hunger / 2) ? 'food-full' : 'food-empty'}">${i < Math.ceil(player.hunger / 2) ? '●' : '○'}</span>`
  ).join('');
}

function renderSlot(slot, index, selected = false) {
  const item = slot && BLOCKS[slot.id] ? blockItem(slot.id, slot.count) : null;
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `slot${selected ? ' selected' : ''}`;
  button.setAttribute('aria-label', item ? `${item.name}, ${item.count}` : 'Espaço vazio');
  button.title = item ? `${item.name} × ${item.count}` : 'Vazio';
  button.innerHTML = `${index < 9 ? `<span class="slot-key">${index + 1}</span>` : ''}${item ? `<span class="item-icon" style="color:${item.color}">${item.icon}</span><span class="count">${item.count}</span>` : ''}`;
  return button;
}

function refreshInventory() {
  if (!gameState) return;
  refreshToolStatus();
  const inventory = gameState.mode === 'creative' ? gameState.creativeHotbar : gameState.inventory;
  hotbarRoot.replaceChildren();
  for (let i = 0; i < 9; i++) hotbarRoot.append(renderSlot(inventory[i], i, i === gameState.selected));
  inventoryGrid.replaceChildren();
  for (let i = gameState.mode === 'creative' ? 0 : 9; i < (gameState.mode === 'creative' ? 9 : 36); i++) {
    const button = renderSlot(gameState.mode === 'creative' ? gameState.creativeHotbar[i] : gameState.inventory[i], i);
    button.addEventListener('click', () => {
      const selectedSlot = gameState.selected;
      const target = gameState.mode === 'creative' ? gameState.creativeHotbar : gameState.inventory;
      [target[selectedSlot], target[i]] = [target[i], target[selectedSlot]];
      refreshInventory();
      saveGame(false);
    });
    inventoryGrid.append(button);
  }

  function refreshToolStatus() {
    const root = $('#tool-status');
    if (!root || gameState?.mode !== 'survival') {
      if (root) root.textContent = '';
      return;
    }
    const entries = Object.values(gameState.tools).filter(Boolean);
    root.textContent = entries.length
      ? entries.map(tool => `${TOOLS[tool.id].icon} ${TOOLS[tool.id].name}: ${tool.durability}/${TOOLS[tool.id].maxDurability}`)
      : 'Sem ferramentas';
  }
  inventoryHotbar.replaceChildren();
  for (let i = 0; i < 9; i++) {
    const button = renderSlot(inventory[i], i, i === gameState.selected);
    button.addEventListener('click', () => {
      gameState.selected = i;
      refreshInventory();
      saveGame(false);
    });
    inventoryHotbar.append(button);
  }
  refreshCrafting();
}

function refreshCrafting() {
  const grid = $('#crafting-grid');
  if (!grid) return;
  grid.replaceChildren();
  if (gameState?.mode !== 'survival') {
    grid.innerHTML = '<p class="inventory-hint">O crafting fica disponível no modo Sobrevivência.</p>';
    return;
  }
  for (const recipe of RECIPES) {
    const button = document.createElement('button');
    const craftable = canCraft(gameState.inventory, recipe);
    button.type = 'button';
    button.className = `craft-recipe${craftable ? '' : ' unavailable'}`;
    button.disabled = !craftable;
    button.textContent = `${TOOLS[recipe.result].icon} ${recipe.name}`;
    button.title = recipe.ingredients.map(item => `${item.count}× bloco ${item.id}`).join(', ');
    button.addEventListener('click', () => {
      const result = craftTool(gameState, recipe.id);
      if (!result) return;
      showToast(`${TOOLS[recipe.result].name} criada.`);
      refreshInventory();
      saveGame(false);
    });
    grid.append(button);
  }
}

function setMode(nextMode) {
  mode = nextMode;
  $('#menu').classList.toggle('hidden', nextMode !== 'menu');
  $('#pause').classList.toggle('hidden', nextMode !== 'pause');
  $('#inventory').classList.toggle('hidden', nextMode !== 'inventory');
  $('#settings').classList.toggle('hidden', nextMode !== 'settings');
  hud.classList.toggle('hidden', !['playing', 'inventory'].includes(nextMode));
  document.body.classList.toggle('playing', nextMode === 'playing');
}

function startAmbient() {
  if (ambientContext) {
    ambientContext.resume();
    return;
  }
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) return;
  ambientContext = new AudioContext();
  const buffer = ambientContext.createBuffer(1, ambientContext.sampleRate * 2, ambientContext.sampleRate);
  const channel = buffer.getChannelData(0);
  for (let i = 0; i < channel.length; i++) channel[i] = (Math.random() * 2 - 1) * 0.12;
  const noise = ambientContext.createBufferSource();
  noise.buffer = buffer;
  noise.loop = true;
  const filter = ambientContext.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 340;
  ambientGain = ambientContext.createGain();
  ambientGain.gain.value = settings.volume;
  noise.connect(filter);
  filter.connect(ambientGain);
  ambientGain.connect(ambientContext.destination);
  noise.start();
}

function requestGamePointerLock() {
  if (!renderer?.domElement?.requestPointerLock) return;
  try {
    const request = renderer.domElement.requestPointerLock();
    if (request && typeof request.catch === 'function') {
      request.catch(error => {
        console.warn('O navegador não permitiu capturar o mouse:', error);
        showToast('Clique no mundo para controlar a câmera.');
      });
    }
  } catch (error) {
    console.warn('O navegador não permitiu capturar o mouse:', error);
    showToast('Clique no mundo para controlar a câmera.');
  }
}

function saveGame(notify = true) {
  if (!gameState) return;
  if (player) {
    gameState.position = { x: player.position.x, y: player.position.y, z: player.position.z };
    gameState.health = player.health;
    gameState.hunger = player.hunger;
  }
  gameState.selected = gameState.selected ?? 0;
  gameState.time = gameState.time ?? 0.22;
  try {
    writeSave(gameState);
    if (notify) showToast('Mundo salvo neste navegador.');
  } catch (error) {
    console.error('Não foi possível salvar o mundo:', error);
    showToast('Falha ao salvar. Verifique o espaço disponível no navegador.');
  }
}

function disposeGame() {
  if (player) player.dispose();
  player = null;
  if (entityManager) entityManager.dispose();
  entityManager = null;
  if (world) world.dispose();
  world = null;
  for (const particle of particles) {
    scene.remove(particle.points);
    particle.points.geometry.dispose();
    particle.points.material.dispose();
  }
  particles.length = 0;
}

function beginWorld(state) {
  if (!renderer) initializeRenderer();
  disposeGame();
  gameState = state;
  scene = new THREE.Scene();
  scene.background = new THREE.Color('#8ac8dd');
  scene.fog = new THREE.Fog('#8ac8dd', 32, Math.max(70, settings.renderDistance * CHUNK_SIZE * 3.5));
  camera = new THREE.PerspectiveCamera(76, window.innerWidth / window.innerHeight, 0.1, 180);
  hemisphere = new THREE.HemisphereLight('#d9f1ff', '#596047', 1.1);
  scene.add(hemisphere);
  sunlight = new THREE.DirectionalLight('#fff0ce', 2.0);
  sunlight.castShadow = true;
  sunlight.shadow.mapSize.set(1024, 1024);
  sunlight.shadow.camera.left = -34;
  sunlight.shadow.camera.right = 34;
  sunlight.shadow.camera.top = 34;
  sunlight.shadow.camera.bottom = -34;
  sunlight.shadow.camera.far = 100;
  sunlight.shadow.bias = -0.0004;
  scene.add(sunlight);
  scene.add(sunlight.target);
  const atlas = createBlockAtlas();
  world = new VoxelWorld(scene, atlas, {
    seed: state.seed,
    edits: state.edits,
    renderDistance: settings.renderDistance,
    onBlockChange: () => { autosaveTimer = 0; }
  });
  const spawn = state.position || { x: 0.5, y: world.terrain(0, 0).height + 1.05, z: 0.5 };
  world.loadAround(spawn.x, spawn.z);
  player = new Player(camera, {
    position: spawn,
    sensitivity: settings.sensitivity,
    health: state.health,
    hunger: state.hunger,
    pointerLockElement: renderer.domElement,
    isActive: () => mode === 'playing',
    mode: state.mode,
    onDamage: () => showToast('Você sofreu dano!'),
    onDeath: () => showToast('Você renasceu no ponto inicial.')
  });
  entityManager = new EntityManager(scene, world);
  renderer.shadowMap.enabled = true;
  gameState.time = Number.isFinite(state.time) ? state.time : 0.22;
  refreshInventory();
  updateHealthHud();
  setMode('playing');
  saveGame(false);
  startAmbient();
  requestGamePointerLock();
}

function initializeRenderer() {
  renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.6));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  gameRoot.append(renderer.domElement);
  renderer.domElement.addEventListener('contextmenu', event => event.preventDefault());
  renderer.domElement.addEventListener('mousedown', handleMouseAction);
  renderer.domElement.addEventListener('click', () => {
    if (mode === 'playing' && document.pointerLockElement !== renderer.domElement) requestGamePointerLock();
  });
  window.addEventListener('resize', () => {
    if (!camera || !renderer) return;
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });
  requestAnimationFrame(animate);
}

function castBlockRay(maxDistance = 6) {
  if (!camera || !world) return null;
  const direction = new THREE.Vector3();
  camera.getWorldDirection(direction);
  let x = Math.floor(camera.position.x), y = Math.floor(camera.position.y), z = Math.floor(camera.position.z);
  const stepX = Math.sign(direction.x), stepY = Math.sign(direction.y), stepZ = Math.sign(direction.z);
  const deltaX = stepX === 0 ? Infinity : Math.abs(1 / direction.x);
  const deltaY = stepY === 0 ? Infinity : Math.abs(1 / direction.y);
  const deltaZ = stepZ === 0 ? Infinity : Math.abs(1 / direction.z);
  let maxX = stepX > 0 ? (x + 1 - camera.position.x) * deltaX : (camera.position.x - x) * deltaX;
  let maxY = stepY > 0 ? (y + 1 - camera.position.y) * deltaY : (camera.position.y - y) * deltaY;
  let maxZ = stepZ > 0 ? (z + 1 - camera.position.z) * deltaZ : (camera.position.z - z) * deltaZ;
  let distance = 0;
  let previous = null;
  while (distance <= maxDistance) {
    const id = world.getBlock(x, y, z);
    if (id !== BLOCK.AIR) return { x, y, z, id, previous };
    previous = { x, y, z };
    if (maxX < maxY && maxX < maxZ) {
      x += stepX; distance = maxX; maxX += deltaX;
    } else if (maxY < maxZ) {
      y += stepY; distance = maxY; maxY += deltaY;
    } else {
      z += stepZ; distance = maxZ; maxZ += deltaZ;
    }
  }
  return null;
}

function spawnBreakParticles(x, y, z, blockId) {
  const positions = [];
  for (let i = 0; i < 22; i++) positions.push(x + Math.random() * 0.8 - 0.4, y + Math.random() * 0.8 - 0.4, z + Math.random() * 0.8 - 0.4);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  const material = new THREE.PointsMaterial({ color: BLOCKS[blockId]?.color || '#fff', size: 0.09, sizeAttenuation: true });
  const points = new THREE.Points(geometry, material);
  scene.add(points);
  particles.push({ points, age: 0, life: 0.38, velocity: new THREE.Vector3(0, 1.3, 0) });
}

function addItem(blockId) {
  let remaining = 1;
  for (const slot of gameState.inventory) {
    if (slot && slot.id === blockId && slot.count < 64) {
      const added = Math.min(64 - slot.count, remaining);
      slot.count += added;
      remaining -= added;
      if (!remaining) return true;
    }
  }
  for (let i = 0; i < gameState.inventory.length && remaining; i++) {
    if (gameState.inventory[i]) continue;
    gameState.inventory[i] = { id: blockId, count: remaining };
    remaining = 0;
  }
  return remaining === 0;
}

function canAddItem(blockId) {
  return gameState.inventory.some(slot => slot && slot.id === blockId && slot.count < 64) ||
    gameState.inventory.some(slot => !slot);
}

function breakBlock(hit) {
  if (!hit || hit.id === BLOCK.BEDROCK) return;
  const itemId = hit.id;
  if (gameState.mode === 'survival' && itemId !== BLOCK.WATER && !canAddItem(itemId)) {
    showToast('Inventário cheio.');
    return;
  }
  world.setBlock(hit.x, hit.y, hit.z, BLOCK.AIR);
  if (gameState.mode === 'survival' && itemId !== BLOCK.WATER && !addItem(itemId)) showToast('Inventário cheio.');
  if (gameState.mode === 'survival') {
    const toolEntry = Object.values(gameState.tools).find(tool => {
      if (!tool) return false;
      const definition = TOOLS[tool.id];
      return definition?.types.includes(itemId);
    });
    if (toolEntry) {
      toolEntry.durability -= 1;
      if (toolEntry.durability <= 0) {
        const slot = Object.keys(gameState.tools).find(key => gameState.tools[key] === toolEntry);
        if (slot) gameState.tools[slot] = null;
        showToast('Uma ferramenta quebrou.');
      }
    }
  }
  spawnBreakParticles(hit.x + 0.5, hit.y + 0.5, hit.z + 0.5, itemId);
  refreshInventory();
}

function placeBlock(hit) {
  if (!hit?.previous) return;
  const inventory = gameState.mode === 'creative' ? gameState.creativeHotbar : gameState.inventory;
  const slot = inventory[gameState.selected];
  if (!slot || !BLOCKS[slot.id] || slot.id === BLOCK.WATER || slot.id === BLOCK.BEDROCK) {
    showToast('Selecione um bloco para construir.');
    return;
  }
  const { x, y, z } = hit.previous;
  const overlapsPlayer = x + 1 > player.position.x - 0.29 && x < player.position.x + 0.29 &&
    z + 1 > player.position.z - 0.29 && z < player.position.z + 0.29 &&
    y + 1 > player.position.y + 0.025 && y < player.position.y + 1.78 - 0.025;
  if (overlapsPlayer) return;
  if (world.getBlock(x, y, z) !== BLOCK.AIR && world.getBlock(x, y, z) !== BLOCK.WATER) return;
  world.setBlock(x, y, z, slot.id);
  if (gameState.mode === 'survival') {
    slot.count--;
    if (slot.count <= 0) inventory[gameState.selected] = null;
  }
  refreshInventory();
}

function handleMouseAction(event) {
  if (mode !== 'playing' || (document.pointerLockElement && document.pointerLockElement !== renderer.domElement)) return;
  if (event.button === 0 && entityManager?.hit(camera, gameState.mode === 'survival' ? 4 : 20)) return;
  const hit = castBlockRay();
  if (event.button === 0) breakBlock(hit);
  if (event.button === 2) placeBlock(hit);
}

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  if (mode === 'playing' || mode === 'inventory') {
    if (mode === 'playing' && player) {
      player.update(dt, world);
      world.loadAround(player.position.x, player.position.z);
      selectedHit = castBlockRay();
      if (gameState) {
        gameState.time = (gameState.time + dt / 480) % 1;
        gameState.health = player.health;
        gameState.hunger = player.hunger;
      }
      if (world) world.timePhase = gameState?.time;
      if (entityManager) entityManager.update(dt, player, gameState);
      updateHealthHud();
      autosaveTimer += dt;
      if (autosaveTimer >= 45) {
        autosaveTimer = 0;
        saveGame(false);
      }
    }
    if (sunlight && gameState) {
      const angle = gameState.time * Math.PI * 2;
      const daylight = Math.max(0, Math.sin(angle));
      sunlight.position.set(
        player.position.x + Math.cos(angle) * 38,
        player.position.y + Math.sin(angle) * 48,
        player.position.z + 15
      );
      sunlight.target.position.copy(player.position);
      sunlight.intensity = 0.12 + daylight * 1.8;
      hemisphere.intensity = 0.25 + daylight * 0.85;
      const sky = new THREE.Color().setRGB(
        0.018 + daylight * 0.48,
        0.04 + daylight * 0.69,
        0.12 + daylight * 0.78
      );
      scene.background.copy(sky);
      scene.fog.color.copy(sky);
      if (camera) scene.fog.far = Math.max(55, settings.renderDistance * CHUNK_SIZE * 3.5);
    }
    for (let i = particles.length - 1; i >= 0; i--) {
      const particle = particles[i];
      particle.age += dt;
      particle.points.position.addScaledVector(particle.velocity, dt);
      particle.velocity.y -= 3 * dt;
      particle.points.material.opacity = Math.max(0, 1 - particle.age / particle.life);
      particle.points.material.transparent = true;
      if (particle.age >= particle.life) {
        scene.remove(particle.points);
        particle.points.geometry.dispose();
        particle.points.material.dispose();
        particles.splice(i, 1);
      }
    }
    if (scene && camera) renderer.render(scene, camera);
  }
}

function toggleInventory() {
  if (mode === 'playing') {
    setMode('inventory');
    if (document.pointerLockElement) document.exitPointerLock();
    refreshInventory();
    return;
  }
  if (mode === 'inventory') {
    setMode('playing');
    requestGamePointerLock();
    return;
  }
}

function pauseGame() {
  if (mode !== 'playing' && mode !== 'inventory') return;
  setMode('pause');
  if (gameState) $('#pause-mode-button').textContent = `Modo: ${gameState.mode === 'survival' ? 'Sobrevivência' : 'Criativo'} · Alternar`;
  if (document.pointerLockElement) document.exitPointerLock();
  saveGame(false);
}

function resumeGame() {
  setMode('playing');
  requestGamePointerLock();
}

function openSettings(from = mode) {
  previousScreen = from;
  setMode('settings');
}

function closeSettings() {
  setMode(previousScreen);
}

function updateSettingsFromInputs() {
  settings.renderDistance = Number($('#distance-setting').value);
  settings.sensitivity = Number($('#sensitivity-setting').value);
  settings.volume = Number($('#volume-setting').value);
  $('#distance-value').value = `${settings.renderDistance} chunks`;
  $('#sensitivity-value').value = `${settings.sensitivity.toFixed(1)}×`;
  $('#volume-value').value = `${Math.round(settings.volume * 100)}%`;
  if (world) {
    world.renderDistance = settings.renderDistance;
    world.lastCenter = null;
  }
  if (player) player.setSensitivity(settings.sensitivity);
  if (ambientGain && ambientContext) ambientGain.gain.setTargetAtTime(settings.volume, ambientContext.currentTime, 0.1);
  try {
    writeSettings(settings);
  } catch (error) {
    console.error('Não foi possível salvar as configurações:', error);
    showToast('Não foi possível salvar as configurações.');
  }
}

function loadSavedOrNew() {
  let state;
  try {
    state = readSave() || newGameState();
  } catch (error) {
    console.error('Falha ao carregar o mundo salvo:', error);
    showToast('O salvamento está inválido; um mundo novo será iniciado.');
    state = newGameState();
  }
  beginWorld(state);
}

$('#play-button').addEventListener('click', loadSavedOrNew);
$('#new-world-button').addEventListener('click', () => {
  if (localStorage.getItem('blocos-sandbox-save-v1') && !window.confirm('Criar um mundo novo? O mundo salvo atual será substituído.')) return;
  const state = newGameState();
  state.mode = selectedMode;
  beginWorld(state);
});
let selectedMode = 'survival';
$('#mode-button').addEventListener('click', () => {
  selectedMode = selectedMode === 'survival' ? 'creative' : 'survival';
  $('#mode-button').textContent = `Modo: ${selectedMode === 'survival' ? 'Sobrevivência' : 'Criativo'}`;
});
$('#exit-button').addEventListener('click', () => {
  $('#menu-note').textContent = 'Você pode fechar esta aba. Seu mundo salvo permanece neste navegador.';
});
$('#resume-button').addEventListener('click', resumeGame);
$('#pause-mode-button').addEventListener('click', () => {
  if (!gameState) return;
  gameState.mode = gameState.mode === 'survival' ? 'creative' : 'survival';
  player?.setMode(gameState.mode);
  $('#pause-mode-button').textContent = `Modo: ${gameState.mode === 'survival' ? 'Sobrevivência' : 'Criativo'} · Alternar`;
  refreshInventory();
  updateHealthHud();
  showToast(`Modo ${gameState.mode === 'survival' ? 'Sobrevivência' : 'Criativo'} ativado.`);
  saveGame(false);
});
$('#save-menu-button').addEventListener('click', () => {
  saveGame(false);
  if (document.pointerLockElement) document.exitPointerLock();
  setMode('menu');
});
$('#settings-button').addEventListener('click', () => openSettings('menu'));
$('#pause-settings-button').addEventListener('click', () => openSettings('pause'));
$('#close-settings').addEventListener('click', closeSettings);
$('#settings-done').addEventListener('click', closeSettings);
$('#close-inventory').addEventListener('click', toggleInventory);
for (const [id, value] of [['distance-setting', settings.renderDistance], ['sensitivity-setting', settings.sensitivity], ['volume-setting', settings.volume]]) {
  $(`#${id}`).value = value;
  $(`#${id}`).addEventListener('input', updateSettingsFromInputs);
}
updateSettingsFromInputs();

window.addEventListener('keydown', event => {
  if (event.code === 'Escape') {
    if (mode === 'settings') closeSettings();
    else if (mode === 'inventory') toggleInventory();
    else if (mode === 'playing') pauseGame();
    else if (mode === 'pause') resumeGame();
  } else if (event.code === 'KeyE' && (mode === 'playing' || mode === 'inventory')) {
    toggleInventory();
  } else if (mode === 'playing' && /^Digit[1-9]$/.test(event.code)) {
    gameState.selected = Number(event.code.slice(-1)) - 1;
    refreshInventory();
  } else if (mode === 'playing' && event.code === 'Space') {
    event.preventDefault();
  }
});

window.addEventListener('wheel', event => {
  if (mode !== 'playing' || !gameState) return;
  gameState.selected = (gameState.selected + (event.deltaY > 0 ? 1 : 8)) % 9;
  refreshInventory();
}, { passive: true });

document.addEventListener('pointerlockchange', () => {
  const locked = document.pointerLockElement === renderer?.domElement;
  if (lastPointerLocked && !locked && mode === 'playing') pauseGame();
  lastPointerLocked = locked;
});

window.addEventListener('pagehide', () => saveGame(false));

try {
  const saved = readSave();
  $('#play-button').textContent = saved ? 'Continuar' : 'Jogar';
  if (saved?.mode) {
    selectedMode = saved.mode;
    $('#mode-button').textContent = `Modo: ${selectedMode === 'survival' ? 'Sobrevivência' : 'Criativo'}`;
  }
} catch (error) {
  console.error('Falha ao verificar o salvamento:', error);
  $('#menu-note').textContent = 'O salvamento atual não pôde ser lido.';
}
