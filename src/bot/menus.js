// src/bot/menus.js
import { cached } from "../services/playlist.js";

/**
 * Trie les catégories en mettant d'abord celles qui commencent par "EU| FRANCE"
 */
export function getSortedCategories() {
  const favPrefix = "EU| FRANCE";
  const favs = [],
    others = [];
  for (const cat of cached.categories) {
    (cat.toUpperCase().startsWith(favPrefix.toUpperCase())
      ? favs
      : others
    ).push(cat);
  }
  return [...favs, ...others];
}

/**
 * Affiche la liste des catégories disponibles
 * @param {(msg:string)=>void} out - fonction de sortie (console ou Discord)
 */
export function printCategories(out = console.log) {
  const sortedCats = getSortedCategories();
  let buf = `\n=== Catégories ===\n`;
  sortedCats.forEach((c, i) => {
    buf += `${i + 1}. ${c} (${cached.groups.get(c)?.length ?? 0})\n`;
  });
  buf += `\nChoix (1-${sortedCats.length}, q pour annuler) :`;
  out(buf);
}

/**
 * Affiche la liste des chaînes pour une catégorie donnée
 * @param {(msg:string)=>void} out - fonction de sortie (console ou Discord)
 */
export function printChannels(cat, channels, out = console.log) {
  let buf = `\n=== Chaînes dans "${cat}" ===\n`;
  channels.forEach((ch, i) => {
    buf += `${i + 1}. ${ch.title || ch.url}\n`;
  });
  buf += `\nChoix (1-${channels.length}, q pour annuler) :`;
  out(buf);
}
