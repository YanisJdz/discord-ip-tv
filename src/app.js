// src/app.js
import dotenv from "dotenv";
dotenv.config();

import { loadPlaylistOnce } from "./services/playlist.js";
import {
  stopWorker as stopWorkerStream,
  leaveWorker,
} from "./services/workerControl.js";
import { createStateMachine } from "./bot/stateMachine.js";

const TOKEN = process.env.SELFBOT_TOKEN;
const GUILD_ID = process.env.SELFBOT_GUILD_ID;
const VOICE_CHANNEL_ID = process.env.SELFBOT_VOICE_CHANNEL_ID;
const M3U_URL = process.env.M3U_URL;
const PREFIX = process.env.DISCORD_PREFIX ?? "!tv ";

export async function startApp({
  rl,
  send,
  allowProcessExit = true,
  render = {},
}) {
  let workerReady = false;
  const workerRef = { current: null };

  function onWorkerEventFactory() {
    return (type, payload) => {
      if (type === "ready") send(`✅ Worker prêt (${payload.username})`);
      else if (type === "joined") send("🎙️  Salon vocal rejoint");
      else if (type === "started") send("🟢 Stream lancé");
      else if (type === "stopped") send("🔴 Stream arrêté");
      else if (type === "error") send("❌ Worker error: " + payload.text);
      else if (type === "stdout" || type === "stderr") {
        (type === "stdout" ? process.stdout : process.stderr).write(payload);
      } else if (type === "exit") {
        send(`ℹ️ Worker terminé avec code ${payload.code}`);
        workerRef.current = null;
        workerReady = false;
      }
      rl?.prompt?.(true);
    };
  }

  const sm = createStateMachine({
    rl,
    workerRef,
    onWorkerEvent: onWorkerEventFactory(),
    env: { TOKEN, GUILD_ID, VOICE_CHANNEL_ID },
    out: send,
    render,
  });

  await loadPlaylistOnce(M3U_URL);
  rl?.prompt?.();

  rl.on("line", async (line) => {
    const raw = line.trim();
    const cmd = raw.toLowerCase();

    if (cmd === "off") {
      stopWorkerStream(workerRef.current);
      rl.prompt();
      return;
    }

    if (cmd === "r" || cmd === "refresh" ) {
      await loadPlaylistOnce(M3U_URL);
      rl.prompt();
      return;
    }

    if (cmd === "q" || cmd === "quit" || cmd === "exit") {
      // 🔧 NOUVEAU: si la SM est en cours de sélection, on lui laisse gérer "q"
      if (sm.getMode && sm.getMode() !== "idle") {
        await sm.handleCommand("q"); // ← remet la SM à idle et affiche le message d’annulation
        rl.prompt();
        return;
      }

      // sinon: comportement "global" (sortie/leave)
      if (workerRef.current?.connected) {
        leaveWorker(workerRef.current);
        if (allowProcessExit) setTimeout(() => process.exit(0), 300);
      } else if (allowProcessExit) {
        process.exit(0);
      }
      rl.prompt();
      return;
    }

    // Le reste est géré par la SM (on / switch / choix numéros, etc.)
    await sm.handleCommand(raw);
  });

  send(`👋 Prêt. Utilise ${PREFIX} on|off|s(witch)|r(efresh)|q(uit).`);
}
