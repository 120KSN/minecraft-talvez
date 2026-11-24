import * as THREE from 'three';

export const BLOCK = Object.freeze({
  AIR: 0, GRASS: 1, DIRT: 2, STONE: 3, SAND: 4, WOOD: 5, LEAVES: 6,
  WATER: 7, BEDROCK: 8, SNOW: 9, ICE: 10, COAL: 11, GRAVEL: 12,
  PLANKS: 13, FLOWER: 14, TALL_GRASS: 15
});

export const BLOCKS = Object.freeze({
  [BLOCK.GRASS]: { name: 'Grama', icon: '▰', color: '#80ad43', solid: true, tile: 0 },
  [BLOCK.DIRT]: { name: 'Terra', icon: '▪', color: '#95613e', solid: true, tile: 1 },
  [BLOCK.STONE]: { name: 'Pedra', icon: '◆', color: '#929994', solid: true, tile: 2 },
  [BLOCK.SAND]: { name: 'Areia', icon: '▱', color: '#d9c477', solid: true, tile: 3 },
  [BLOCK.WOOD]: { name: 'Madeira', icon: '▥', color: '#9b6d3e', solid: true, tile: 4 },
  [BLOCK.LEAVES]: { name: 'Folhas', icon: '✦', color: '#51814a', solid: true, tile: 5 },
  [BLOCK.WATER]: { name: 'Água', icon: '≈', color: '#559bd1', solid: false, tile: 6 },
  [BLOCK.BEDROCK]: { name: 'Rocha matriz', icon: '■', color: '#414747', solid: true, tile: 7 },
  [BLOCK.SNOW]: { name: 'Neve', icon: '❄', color: '#edf4ef', solid: true, tile: 8 },
  [BLOCK.ICE]: { name: 'Gelo', icon: '◇', color: '#9edbe8', solid: true, tile: 9 },
  [BLOCK.COAL]: { name: 'Carvão', icon: '●', color: '#555a58', solid: true, tile: 10 },
  [BLOCK.GRAVEL]: { name: 'Cascalho', icon: '⁙', color: '#9e9c92', solid: true, tile: 11 },
  [BLOCK.PLANKS]: { name: 'Tábuas', icon: '▤', color: '#b18555', solid: true, tile: 12 },
  [BLOCK.FLOWER]: { name: 'Flor', icon: '✿', color: '#efb2ca', solid: false, tile: 13 },
  [BLOCK.TALL_GRASS]: { name: 'Grama alta', icon: '♢', color: '#70a64a', solid: false, tile: 14 }
});

const PALETTES = [
  ['#56853c', '#78a947', '#91bc55', '#638e3c'],
  ['#775039', '#926442', '#a9794a', '#84583b'],
  ['#777e7b', '#929995', '#a6aaa5', '#686f6d'],
  ['#c5ad6c', '#dec982', '#ead895', '#cbb773'],
  ['#765034', '#986b40', '#ad7e4c', '#66472f'],
  ['#376c45', '#4b8050', '#609154', '#3d7449'],
  ['#4188c0', '#529bd2', '#66addb', '#367cb6'],
  ['#353b3b', '#454c4b', '#555b59', '#303636'],
  ['#56853c', '#78a947', '#91bc55', '#638e3c'],
  ['#edf1e9', '#f7faf3', '#dfe7dd', '#cdd9d3'],
  ['#78baca', '#91cdd6', '#addbe2', '#69aabd'],
  ['#4b5150', '#5a5f5d', '#777c79', '#343938'],
  ['#87877f', '#9d9b91', '#77786f', '#aaa99f'],
  ['#9b7045', '#b88758', '#c49a69', '#80603f'],
  ['#e8a0bb', '#f2becd', '#c887ad', '#f7d5df'],
  ['#4f8238', '#679846', '#7cab55', '#3d712f']
];

export function createBlockAtlas() {
  const tileSize = 16;
  const canvas = document.createElement('canvas');
  canvas.width = tileSize * 15;
  canvas.height = tileSize;
  const context = canvas.getContext('2d');
  for (let tile = 0; tile < 15; tile++) {
    for (let y = 0; y < tileSize; y++) {
      for (let x = 0; x < tileSize; x++) {
        const noise = ((x * 17 + y * 31 + tile * 13 + (x * y) % 19) % 4);
        context.fillStyle = PALETTES[tile][noise];
        context.fillRect(tile * tileSize + x, y, 1, 1);
      }
    }
    if (tile === 8) {
      context.fillStyle = '#704b34';
      context.fillRect(tile * tileSize, 12, tileSize, 4);
    }
    if (tile === 4) {
      context.fillStyle = '#553d2d';
      context.fillRect(tile * tileSize + 4, 0, 2, tileSize);
      context.fillRect(tile * tileSize + 11, 0, 1, tileSize);
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestMipmapNearestFilter;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.generateMipmaps = true;
  return { texture, tileSize };
}

export function blockItem(id, count = 0) {
  const item = BLOCKS[id];
  return item ? { id, count, name: item.name, icon: item.icon, color: item.color } : null;
}
