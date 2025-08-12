// --- HTTP ---
async function fetchText(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.text();
}

// --- M3U ---
export function parseM3U(m3uText) {
  const lines = m3uText.split(/\r?\n/);
  const items = [];
  let current = null;

  for (const line of lines) {
    if (!line || line.startsWith("#EXTM3U")) continue;

    if (line.startsWith("#EXTINF:")) {
      const meta = line.substring(8);
      const [attrsPart, ...nameParts] = meta.split(",");
      const title = nameParts.join(",").trim();

      const attrs = {};
      for (const m of attrsPart.matchAll(/([A-Za-z0-9_-]+)="([^"]*)"/g)) {
        const key = m[1].toLowerCase();
        const val = m[2].trim();
        attrs[key] = val;
      }
      current = { title, attrs };
    } else if (!line.startsWith("#")) {
      const url = line.trim();
      if (current) {
        items.push({ ...current, url });
        current = null;
      }
    }
  }
  return items;
}

export function groupByCategory(items) {
  const groups = new Map();
  for (const ch of items) {
    let cat =
      ch.attrs["group-title"] ||
      ch.attrs["group"] ||
      ch.attrs["category"] ||
      "Sans catégorie";

    cat = (cat || "").trim() || "Sans catégorie";
    if (!groups.has(cat)) groups.set(cat, []);
    groups.get(cat).push(ch);
  }
  return groups;
}

// Filtrage: pas de VOD, latin obligatoire, pas arabe/cyrillique
export function filterCategories(categories) {
  return categories.filter((cat) => {
    if (/vod/i.test(cat)) return false;
    const hasLatin = /[A-Za-zÀ-ÖØ-öø-ÿ]/.test(cat);
    const hasArabic =
      /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/.test(cat);
    const hasCyrillic =
      /[\u0400-\u04FF\u0500-\u052F\u2DE0-\u2DFF\uA640-\uA69F]/.test(cat);
    return hasLatin && !hasArabic && !hasCyrillic;
  });
}

// Mise en avant des catégories "EU| FRANCE"
export function orderCategories(categories) {
  const fav = [];
  const rest = [];
  for (const c of categories) {
    if (/^EU\|\s*FRANCE/i.test(c)) fav.push(c);
    else rest.push(c);
  }
  fav.sort((a, b) => a.localeCompare(b));
  rest.sort((a, b) => a.localeCompare(b));
  return [...fav, ...rest];
}

// ===== Cache playlist (chargée 1x) =====
export let cached = {
  loaded: false,
  items: [],
  groups: new Map(),
  categories: [],
  lastError: null,
};

// Charge/rafraîchit le cache (tu passes l’URL ici)
export async function loadPlaylistOnce(m3uUrl) {
  try {
    console.log("⬇️  Téléchargement de la playlist M3U…");
    const text = await fetchText(m3uUrl);
    const items = parseM3U(text);
    const groups = groupByCategory(items);
    let categories = Array.from(groups.keys()).sort((a, b) => a.localeCompare(b));
    categories = filterCategories(categories);
    categories = orderCategories(categories);

    cached = { loaded: true, items, groups, categories, lastError: null };
    console.log(`✅ Playlist chargée (${items.length} entrées, ${categories.length} catégories filtrées)`);
  } catch (e) {
    cached.loaded = false;
    cached.lastError = e;
    console.error("❌ Échec du chargement de la playlist:", e.message || e);
  }
}

export async function ensurePlaylistLoaded(m3uUrl) {
  if (cached.loaded && cached.categories.length) return true;
  await loadPlaylistOnce(m3uUrl);
  return cached.loaded && cached.categories.length;
}
