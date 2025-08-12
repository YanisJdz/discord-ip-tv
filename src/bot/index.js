import { createBotClient } from "./client.js";
import { CONFIG } from "../config/env.js";
import { loadPlaylistOnce } from "../services/playlist.js";

export async function startBot() {
  if (!CONFIG.DISCORD_TOKEN) {
    throw new Error("DISCORD_TOKEN manquant (voir src/config/env.js et .env)");
  }

  const client = createBotClient();

  client.once("ready", async () => {
    console.log(`🤖 Connecté en tant que ${client.user.tag}`);

    // Warm cache de la playlist M3U au démarrage (si URL fournie)
    if (CONFIG.M3U_URL) {
      try {
        console.log("⬇️  Préchargement de la playlist M3U…");
        await loadPlaylistOnce(CONFIG.M3U_URL);
        console.log("✅ Playlist en cache");
      } catch (e) {
        console.warn(
          "⚠️ Échec du préchargement de la playlist:",
          e?.message || e
        );
      }
    }
  });

  // Placeholder: on branchera ici les handlers de slash commands
  client.on("interactionCreate", async (interaction) => {
    // À suivre: router vers src/bot/handlers/commands.js
    // Pour l’instant, on ignore poliment
    if (!interaction.isChatInputCommand()) return;
    await interaction
      .reply({ content: "Les commandes arrivent bientôt 👀", ephemeral: true })
      .catch(() => {});
  });

  await client.login(CONFIG.DISCORD_TOKEN);
  return client;
}
