// src/bot/stateMachine.js
import { cached, ensurePlaylistLoaded } from "../services/playlist.js";
import {
  printCategories,
  printChannels,
  getSortedCategories,
} from "./menus.js";
import {
  launchWorker,
  startWorkerStream,
  restartWorkerAndStart,
} from "../services/workerControl.js";

/**
 * @param {{ rl, workerRef, onWorkerEvent, env, out?: (msg:string)=>void, render?: {
 *   categories?: (sortedCats:string[]) => void,
 *   channels?: (cat:string, channels:any[]) => void
 * } }} deps
 */
export function createStateMachine({
  rl,
  workerRef,
  onWorkerEvent,
  env,
  out = console.log,
  render = {},
}) {
  let mode = "idle";
  let pendingAction = null;
  const ui = { selectedCategory: null, channels: [] };

  async function startSelection(action) {
    const ok = await ensurePlaylistLoaded();
    if (!ok) {
      out("⚠️ Playlist indisponible. Tape 'refresh' pour réessayer.");
      rl.prompt();
      return;
    }
    pendingAction = action;
    mode = "chooseCategory";
    ui.selectedCategory = null;
    ui.channels = [];
    const sorted = getSortedCategories();
    if (render.categories) render.categories(sorted);
    else printCategories(out);
  }

  async function handleCommand(cmdRaw) {
    const cmd = cmdRaw.trim().toLowerCase();

    if (mode === "idle") {
      if (cmd === "on") {
        if (!workerRef.current) {
          out("🚀 Lancement du worker...");
          const { worker, readyPromise } = launchWorker({
            env,
            onEvent: onWorkerEvent,
          });
          workerRef.current = worker;
          await readyPromise;
        }
        return startSelection("start");
      }
      if (cmd === "switch" || cmd === "s") return startSelection("switch");
      return; 
    }

    if (mode === "chooseCategory") {
      if (cmd === "q") {
        out("⏹️  Sélection annulée.");
        mode = "idle";
        pendingAction = null;
        rl.prompt();
        return;
      }
      const sorted = getSortedCategories();
      const idx = Number(cmd) - 1;
      if (!Number.isNaN(idx) && idx >= 0 && idx < sorted.length) {
        const cat = sorted[idx];
        const channels = cached.groups.get(cat) || [];
        ui.selectedCategory = cat;
        ui.channels = channels;
        mode = "chooseChannel";
        if (render.channels) render.channels(cat, channels);
        else printChannels(cat, channels, out);
        return;
      }
      out("⛔ Entrée invalide, réessaie.");
      if (render.categories) render.categories(sorted);
      else printCategories(out);
      return;
    }

    if (mode === "chooseChannel") {
      if (cmd === "q") {
        out("⏹️  Sélection annulée.");
        mode = "idle";
        pendingAction = null;
        rl.prompt();
        return;
      }
      const idx = Number(cmd) - 1;
      if (!Number.isNaN(idx) && idx >= 0 && idx < ui.channels.length) {
        const channel = ui.channels[idx];
        out(`📺 Lancement sur: ${channel.title}`);

        if (pendingAction === "start") {
          if (!workerRef.current) {
            out("🚀 Lancement du worker...");
            const { worker, readyPromise } = launchWorker({
              env,
              onEvent: onWorkerEvent,
            });
            workerRef.current = worker;
            await readyPromise;
          }
          startWorkerStream(workerRef.current, channel.url);
        } else if (pendingAction === "switch") {
          const { worker: newWorker } = await restartWorkerAndStart(
            workerRef.current,
            channel.url,
            { env, onEvent: onWorkerEvent, backoffMs: 2000 }
          );
          workerRef.current = newWorker;
        }

        mode = "idle";
        pendingAction = null;
        ui.selectedCategory = null;
        ui.channels = [];
        rl.prompt();
        return;
      }
      out("⛔ Entrée invalide, réessaie.");
      if (render.channels) render.channels(ui.selectedCategory, ui.channels);
      else printChannels(ui.selectedCategory, ui.channels, out);
      return;
    }
  }

  return { handleCommand, getMode: () => mode };
}
