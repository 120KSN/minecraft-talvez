import { BLOCK } from './blocks.js';

export const TOOL = Object.freeze({
  NONE: 'none',
  WOOD_PICKAXE: 'wood_pickaxe',
  STONE_PICKAXE: 'stone_pickaxe',
  WOOD_AXE: 'wood_axe',
  STONE_AXE: 'stone_axe'
});

export const TOOLS = Object.freeze({
  [TOOL.WOOD_PICKAXE]: { name: 'Picareta de madeira', icon: '⛏', maxDurability: 40, speed: 1.35, types: [BLOCK.STONE] },
  [TOOL.STONE_PICKAXE]: { name: 'Picareta de pedra', icon: '⛏', maxDurability: 70, speed: 1.8, types: [BLOCK.STONE] },
  [TOOL.WOOD_AXE]: { name: 'Machado de madeira', icon: '╱', maxDurability: 35, speed: 1.45, types: [BLOCK.WOOD] },
  [TOOL.STONE_AXE]: { name: 'Machado de pedra', icon: '╱', maxDurability: 60, speed: 1.9, types: [BLOCK.WOOD] }
});

export const RECIPES = Object.freeze([
  {
    id: 'wood_pickaxe',
    name: 'Picareta de madeira',
    result: TOOL.WOOD_PICKAXE,
    ingredients: [{ id: BLOCK.WOOD, count: 3 }, { id: BLOCK.DIRT, count: 1 }]
  },
  {
    id: 'stone_pickaxe',
    name: 'Picareta de pedra',
    result: TOOL.STONE_PICKAXE,
    ingredients: [{ id: BLOCK.STONE, count: 3 }, { id: BLOCK.WOOD, count: 2 }]
  },
  {
    id: 'wood_axe',
    name: 'Machado de madeira',
    result: TOOL.WOOD_AXE,
    ingredients: [{ id: BLOCK.WOOD, count: 3 }]
  },
  {
    id: 'stone_axe',
    name: 'Machado de pedra',
    result: TOOL.STONE_AXE,
    ingredients: [{ id: BLOCK.STONE, count: 2 }, { id: BLOCK.WOOD, count: 1 }]
  }
]);
