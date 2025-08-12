// src/bot/client.js
import dotenv from "dotenv";
dotenv.config();
import { EventEmitter } from "events";
import {
  Client,
  GatewayIntentBits,
  Partials,
  PermissionFlagsBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
} from "discord.js";
import { startApp } from "../app.js";
import { cached } from "../services/playlist.js";

const PREFIX = process.env.DISCORD_PREFIX ?? "!tv ";
const COMMAND_CHANNEL_ID = process.env.DISCORD_COMMAND_CHANNEL_ID;
const GUILD_ID = process.env.DISCORD_GUILD_ID;
const ALLOWED_ROLE_ID = process.env.DISCORD_ALLOWED_ROLE_ID;

if (!process.env.DISCORD_BOT_TOKEN) {
  console.error("❌ DISCORD_BOT_TOKEN manquant dans l'environnement.");
  process.exit(1);
}
if (!COMMAND_CHANNEL_ID) {
  console.error(
    "❌ DISCORD_COMMAND_CHANNEL_ID manquant. Indique le salon où recevoir les commandes."
  );
  process.exit(1);
}

// --- état pagination en mémoire (simple) ---
const pagingState = {
  categories: { list: [], page: 0, perPage: 25, messageId: null },
  channels: { cat: null, list: [], page: 0, perPage: 25, messageId: null },
};

function buildPage(list, page, perPage) {
  const total = list.length;
  const pages = Math.max(1, Math.ceil(total / perPage));
  const p = Math.min(Math.max(0, page), pages - 1);
  const start = p * perPage;
  const end = Math.min(total, start + perPage);
  return { pages, p, start, end, total, slice: list.slice(start, end) };
}

function makeNavRow(kind, page, pages) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`${kind}:first`)
      .setLabel("⏮️")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page <= 0),
    new ButtonBuilder()
      .setCustomId(`${kind}:prev`)
      .setLabel("◀️")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page <= 0),
    new ButtonBuilder()
      .setCustomId(`${kind}:next`)
      .setLabel("▶️")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page >= pages - 1),
    new ButtonBuilder()
      .setCustomId(`${kind}:last`)
      .setLabel("⏭️")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page >= pages - 1)
  );
}

async function renderCategories(sortedCats) {
  pagingState.categories.list = sortedCats;
  pagingState.categories.page = 0;

  const { list, page, perPage } = pagingState.categories;
  const data = buildPage(list, page, perPage);

  const desc =
    data.slice
      .map((c, i) => {
        const globalIndex = data.start + i + 1;
        const count = cached.groups.get(c)?.length ?? 0;
        return `**${globalIndex}.** ${c} (${count})`;
      })
      .join("\n") || "_Aucune catégorie_";

  const embed = new EmbedBuilder()
    .setTitle("Catégories")
    .setDescription(desc)
    .setFooter({
      text: `Page ${data.p + 1}/${
        data.pages
      } — Tape !tv <num> pour choisir — q pour annuler`,
    });

  const components = [makeNavRow("cat", data.p, data.pages)];

  if (currentTextChannel) {
    // 🔧 NOUVEAU: supprimer l’ancien menu s’il existe, puis envoyer un nouveau message
    const prevId = pagingState.categories.messageId;
    if (prevId) {
      try {
        const prevMsg = await currentTextChannel.messages.fetch(prevId);
        await prevMsg.delete().catch(() => {});
      } catch {}
    }
    const sent = await currentTextChannel.send({ embeds: [embed], components });
    pagingState.categories.messageId = sent.id; // nouveau message
  }
}

async function renderChannels(cat, channels) {
  pagingState.channels.cat = cat;
  pagingState.channels.list = channels;
  pagingState.channels.page = 0;

  const { list, page, perPage } = pagingState.channels;
  const data = buildPage(list, page, perPage);

  const desc =
    data.slice
      .map((ch, i) => {
        const globalIndex = data.start + i + 1;
        const title = ch.title || ch.url;
        return `**${globalIndex}.** ${title}`;
      })
      .join("\n") || "_Aucune chaîne_";

  const embed = new EmbedBuilder()
    .setTitle(`Chaînes — ${cat}`)
    .setDescription(desc)
    .setFooter({
      text: `Page ${data.p + 1}/${
        data.pages
      } — Tape !tv <num> pour choisir — q pour annuler`,
    });

  const components = [makeNavRow("chn", data.p, data.pages)];

  if (currentTextChannel) {
    // 🔧 NOUVEAU: supprimer l’ancien menu s’il existe, puis envoyer un nouveau message
    const prevId = pagingState.channels.messageId;
    if (prevId) {
      try {
        const prevMsg = await currentTextChannel.messages.fetch(prevId);
        await prevMsg.delete().catch(() => {});
      } catch {}
    }
    const sent = await currentTextChannel.send({ embeds: [embed], components });
    pagingState.channels.messageId = sent.id;
  }
}

// ----- Faux Readline -----
class FakeReadline extends EventEmitter {
  setPrompt() {}
  prompt() {}
  close() {}
  feed(line) {
    this.emit("line", line);
  }
}

// ----- Discord Client -----
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent, // à activer dans le Dev Portal
  ],
  partials: [Partials.Channel],
});

let currentTextChannel = null;

function chunk2000(s) {
  const MAX = 1900;
  const out = [];
  let i = 0;
  const str = String(s ?? "");
  while (i < str.length) {
    out.push("```\n" + str.slice(i, i + MAX) + "\n```");
    i += MAX;
  }
  return out.length ? out : ["``` \n```"];
}

function makeSend() {
  return (msg) => {
    if (currentTextChannel) {
      for (const c of chunk2000(msg)) currentTextChannel.send(c);
    } else {
      console.log(msg);
    }
  };
}

const rl = new FakeReadline();
const send = makeSend();

startApp({
  rl,
  send,
  allowProcessExit: false,
  render: {
    categories: renderCategories,
    channels: renderChannels,
  },
}).catch((err) => {
  console.error("App error:", err);
  process.exit(1);
});

client.on("ready", async () => {
  console.log(`✅ Connecté en tant que ${client.user.tag}`);
  // mémorise le channel de commandes
  try {
    const ch = await client.channels.fetch(COMMAND_CHANNEL_ID);
    if (!ch?.isTextBased?.()) {
      console.error(
        "❌ DISCORD_COMMAND_CHANNEL_ID ne pointe pas vers un salon texte."
      );
      process.exit(1);
    }
    currentTextChannel = ch;
    send(`⌛ Téléchargement des chaînes en cours...`);
  } catch (e) {
    console.error("❌ Impossible de récupérer le salon de commandes:", e);
    process.exit(1);
  }
});

// gérer les clics des boutons
client.on("interactionCreate", async (interaction) => {
  if (!interaction.isButton()) return;
  if (interaction.channelId !== COMMAND_CHANNEL_ID) return;

  // cat:* pour catégories, chn:* pour chaînes
  const [kind, action] = interaction.customId.split(":");

  if (kind === "cat") {
    const state = pagingState.categories;
    const totalPages = Math.max(
      1,
      Math.ceil(state.list.length / state.perPage)
    );
    if (action === "first") state.page = 0;
    else if (action === "prev") state.page = Math.max(0, state.page - 1);
    else if (action === "next")
      state.page = Math.min(totalPages - 1, state.page + 1);
    else if (action === "last") state.page = totalPages - 1;

    const data = buildPage(state.list, state.page, state.perPage);
    const desc =
      data.slice
        .map((c, i) => {
          const globalIndex = data.start + i + 1;
          const count = cached.groups.get(c)?.length ?? 0;
          return `**${globalIndex}.** ${c} (${count})`;
        })
        .join("\n") || "_Aucune catégorie_";

    const embed = new EmbedBuilder()
      .setTitle("Catégories")
      .setDescription(desc)
      .setFooter({
        text: `Page ${data.p + 1}/${
          data.pages
        } — Tape !tv <num> pour choisir — q pour annuler`,
      });

    await interaction.update({
      embeds: [embed],
      components: [makeNavRow("cat", data.p, data.pages)],
    });
    return;
  }

  if (kind === "chn") {
    const state = pagingState.channels;
    const totalPages = Math.max(
      1,
      Math.ceil(state.list.length / state.perPage)
    );
    if (action === "first") state.page = 0;
    else if (action === "prev") state.page = Math.max(0, state.page - 1);
    else if (action === "next")
      state.page = Math.min(totalPages - 1, state.page + 1);
    else if (action === "last") state.page = totalPages - 1;

    const data = buildPage(state.list, state.page, state.perPage);
    const desc =
      data.slice
        .map((ch, i) => {
          const globalIndex = data.start + i + 1;
          const title = ch.title || ch.url;
          return `**${globalIndex}.** ${title}`;
        })
        .join("\n") || "_Aucune chaîne_";

    const embed = new EmbedBuilder()
      .setTitle(`Chaînes — ${state.cat ?? ""}`)
      .setDescription(desc)
      .setFooter({
        text: `Page ${data.p + 1}/${
          data.pages
        } — Tape !tv <num> pour choisir — q pour annuler`,
      });

    await interaction.update({
      embeds: [embed],
      components: [makeNavRow("chn", data.p, data.pages)],
    });
    return;
  }
});

client.on("messageCreate", async (msg) => {
  // 1) ne traite que le salon choisi
  if (msg.channelId !== COMMAND_CHANNEL_ID) return;

  // 2) filtre bots / guild (optionnel)
  if (msg.author.bot) return;
  if (GUILD_ID && msg.guildId !== GUILD_ID) return;

  // 3) vérifie le préfixe
  if (!msg.content.startsWith(PREFIX)) return;

  // 4) (optionnel) vérifie rôle autorisé
  if (ALLOWED_ROLE_ID && !msg.member?.roles?.cache?.has(ALLOWED_ROLE_ID)) {
    return msg.reply(
      "⛔ Tu n’as pas la permission d’exécuter cette commande ici."
    );
  }

  const commandStr = msg.content.slice(PREFIX.length).trim();
  if (!commandStr) {
    await msg.reply(`Utilisation: \`${PREFIX} on|off|switch|refresh|q\``);
    return;
  }

  const ack = await msg.reply("⏳ Exécution…");
  try {
    rl.feed(commandStr);
    await ack.edit("✅ Reçu.");
  } catch (e) {
    await ack.edit("❌ " + (e?.message || String(e)));
  }
});

client.login(process.env.DISCORD_BOT_TOKEN);
