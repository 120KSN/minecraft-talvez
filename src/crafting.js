import { RECIPES, TOOLS } from './items.js';

export function countInventoryItem(inventory, id) {
  return inventory.reduce((total, slot) => total + (slot && slot.id === id ? slot.count : 0), 0);
}

export function canCraft(inventory, recipe) {
  return recipe.ingredients.every(ingredient => countInventoryItem(inventory, ingredient.id) >= ingredient.count);
}

export function consumeIngredients(inventory, recipe) {
  for (const ingredient of recipe.ingredients) {
    let needed = ingredient.count;
    for (const slot of inventory) {
      if (!slot || slot.id !== ingredient.id) continue;
      const used = Math.min(slot.count, needed);
      slot.count -= used;
      needed -= used;
      if (slot.count <= 0) Object.assign(slot, { id: null, count: 0 });
    }
  }
}

export function craftTool(gameState, recipeId) {
  const recipe = RECIPES.find(item => item.id === recipeId);
  if (!recipe || !canCraft(gameState.inventory, recipe)) return null;
  consumeIngredients(gameState.inventory, recipe);
  const toolSlot = Object.keys(gameState.tools).find(slot => !gameState.tools[slot]);
  if (toolSlot) gameState.tools[toolSlot] = { id: recipe.result, durability: TOOLS[recipe.result].maxDurability };
  else gameState.tools['3'] = { id: recipe.result, durability: TOOLS[recipe.result].maxDurability };
  const tool = gameState.tools[toolSlot || '3'];
  return { tool, recipe };
}
