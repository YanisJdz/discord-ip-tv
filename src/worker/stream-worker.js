// stream-worker.js
import { Client } from "discord.js-selfbot-v13";
import {
  Streamer,
  prepareStream,
  playStream,
} from "@dank074/discord-video-stream";
import { spawn, execSync } from "child_process";
import fs from "fs";

// ====== Config via env (index.js les passe au fork) ======
const TOKEN = process.env.TOKEN;
const GUILD_ID = process.env.GUILD_ID;
const VOICE_CHANNEL_ID = process.env.VOICE_CHANNEL_ID;

if (!TOKEN || !GUILD_ID || !VOICE_CHANNEL_ID) {
  process.send?.({
    type: "error",
    text: "Vars manquantes (TOKEN, GUILD_ID, VOICE_CHANNEL_ID)",
  });
  process.exit(1);
}

// ====== Filtre des logs verbeux de la lib ======
{
  const origOut = process.stdout.write.bind(process.stdout);
  const origErr = process.stderr.write.bind(process.stderr);
  const isNoisy = (s) => {
    if (typeof s !== "string") s = String(s);
    return s.includes('"name":"demux') || s.includes('"name":"stream:');
  };
  process.stdout.write = (chunk, enc, cb) => {
    const s = typeof chunk === "string" ? chunk : String(chunk);
    if (isNoisy(s)) return true;
    return origOut(chunk, enc, cb);
  };
  process.stderr.write = (chunk, enc, cb) => {
    const s = typeof chunk === "string" ? chunk : String(chunk);
    if (isNoisy(s)) return true;
    return origErr(chunk, enc, cb);
  };
}
{
  const originalLog = console.log;
  console.log = (...args) => {
    const msg = args
      .map((a) => (typeof a === "string" ? a : JSON.stringify(a)))
      .join(" ");
    if (msg.includes('"name":"demux') || msg.includes('"name":"stream:'))
      return;
    // originalLog(...args);
  };
}

// ====== État ======
let client = null;
let streamer = null;

let isStreaming = false;
let fifoPath = null;
let ffProc = null;
let prepCmd = null;
let prepOutput = null;

let inVoice = false;
let playPromise = null;
let currentAbort = null;
let runId = 0;

let readyResolve;
const readyPromise = new Promise((res) => (readyResolve = res));

// ====== Helpers ======
function ensureFifo(p) {
  try {
    fs.unlinkSync(p);
  } catch {}
  execSync(`mkfifo -m 600 ${p}`);
}

function startFfmpegToFifo(inputUrl, fifo) {
  const args = [
    "-nostdin",
    "-hide_banner",
    "-nostats",
    "-loglevel",
    "error",
    "-y",

    // robustesse input (reco / timeouts / UA)
    "-user_agent",
    "VLC/3.0.18 LibVLC/3.0.18",
    "-reconnect",
    "1",
    "-reconnect_at_eof",
    "1",
    "-reconnect_streamed",
    "1",
    "-reconnect_on_network_error",
    "1",
    "-reconnect_delay_max",
    "2",
    "-rw_timeout",
    "1500000",
    "-timeout",
    "5000000",

    "-re",
    "-i",
    inputUrl,

    "-fflags",
    "+genpts",

    // --- vidéo H.264 "switch-friendly"
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-tune",
    "zerolatency",
    "-pix_fmt",
    "yuv420p",

    // >>> clés régulières et rapides
    "-g",
    "50", // GOP ~ 2s à 25fps
    "-keyint_min",
    "50",
    "-sc_threshold",
    "0",
    "-x264-params",
    "keyint=50:min-keyint=50:scenecut=0",
    // (optionnel débit stable)
    "-b:v",
    "2500k",
    "-maxrate",
    "2500k",
    "-bufsize",
    "5000k",

    // --- audio
    "-c:a",
    "aac",
    "-ar",
    "48000",
    "-ac",
    "2",
    "-b:a",
    "128k",

    // --- latence basse côté mux
    "-fflags",
    "nobuffer",
    "-flags",
    "+low_delay",
    "-flush_packets",
    "1",

    // conteneur
    "-f",
    "matroska", // garde mkv pour l’instant; si besoin, teste mpegts
    fifo,
  ];

  const child = spawn("ffmpeg", args, {
    stdio: ["ignore", "ignore", "ignore"],
  });
  child.once("exit", (code, signal) => {
    process.send?.({
      type: "log",
      text: `ffmpeg exit code=${code} signal=${signal}`,
    });
  });
  return child;
}

function wait(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
function waitChildExit(child, timeoutMs = 1000) {
  return new Promise((r) => {
    if (!child) return r();
    let done = false;
    const doneFn = () => {
      if (!done) {
        done = true;
        r();
      }
    };
    child.once("exit", doneFn);
    child.once("close", doneFn);
    setTimeout(doneFn, timeoutMs);
  });
}

async function stopMediaFull() {
  const hadSomething =
    isStreaming || !!prepOutput || !!prepCmd || !!ffProc || !!fifoPath;

  // 1) annuler play/prepare
  try {
    currentAbort?.abort();
  } catch {}
  try {
    prepOutput?.destroy();
  } catch {}

  // 2) tuer les process ffmpeg
  try {
    prepCmd?.kill("SIGTERM");
  } catch {}
  try {
    ffProc?.kill("SIGTERM");
  } catch {}

  // 3) attendre la fin du play + des process
  try {
    await Promise.race([playPromise?.catch(() => {}), wait(600)]);
  } catch {}
  await Promise.allSettled([
    waitChildExit(prepCmd, 800),
    waitChildExit(ffProc, 800),
  ]);

  // 4) cleanup FIFO
  await wait(150);
  try {
    if (fifoPath) fs.unlinkSync(fifoPath);
  } catch {}

  // 5) reset état
  fifoPath = null;
  ffProc = null;
  prepCmd = null;
  prepOutput = null;
  currentAbort = null;
  playPromise = null;
  isStreaming = false;

  if (hadSomething) process.send?.({ type: "stopped" });
}

async function leaveVoiceAndExit() {
  await stopMediaFull().catch(() => {});
  try {
    await streamer?.leaveVoice();
  } catch {}
  await new Promise((r) => setTimeout(r, 200));
  process.exit(0);
}

// ====== Messages du parent ======
process.on("message", async (msg) => {
  try {
    if (msg?.type === "stop") {
      // OFF
      await stopMediaFull();
      return;
    }

    if (msg?.type === "leave") {
      // Q
      await leaveVoiceAndExit();
      return;
    }

    if (msg?.type === "start" || msg?.type === "switch") {
      const url = msg.url;
      if (!url) {
        process.send?.({ type: "error", text: "URL manquante" });
        return;
      }

      await readyPromise;

      runId += 1;
      const myRun = runId;

      process.send?.({ type: "log", text: "switch/start: stopMediaFull()" });
      await stopMediaFull();

      await wait(350);

      if (!inVoice) {
        process.send?.({
          type: "log",
          text: "switch/start: ensure joinVoice (if needed)",
        });
        await streamer.joinVoice(GUILD_ID, VOICE_CHANNEL_ID);
        inVoice = true;
        process.send?.({
          type: "log",
          text: "switch/start: joined (or already in)",
        });
        process.send?.({ type: "joined" });
      }

      isStreaming = true;

      fifoPath = `/tmp/discord-live-${Date.now()}.mkv`;
      ensureFifo(fifoPath);
      process.send?.({ type: "log", text: "switch/start: spawn ffmpeg" });
      ffProc = startFfmpegToFifo(url, fifoPath);
      process.send?.({ type: "log", text: "switch/start: spawned" });

      currentAbort = new AbortController();
      const thisAbort = currentAbort; // capture locale

      process.send?.({ type: "log", text: "switch/start: prepareStream()" });
      const { command, output } = prepareStream(
        fifoPath,
        { height: 720, streamPreview: false, frameRate: 30 },
        thisAbort.signal
      );
      process.send?.({ type: "log", text: "switch/start: prepareStream() ok" });
      prepCmd = command;
      prepOutput = output;

      await wait(500);

      process.send?.({ type: "log", text: "switch/start: playStream() begin" });
      playPromise = playStream(
        prepOutput,
        streamer,
        { type: "go-live", streamPreview: false, readrateInitialBurst: 2.0 },
        thisAbort.signal
      )
        .catch((e) => {
          process.send?.({ type: "error", text: String(e?.message || e) });
        })
        .finally(() => {
          process.send?.({
            type: "log",
            text: `playStream finally (myRun=${myRun}, runId=${runId}, aborted=${thisAbort.aborted})`,
          });
          if (runId === myRun && !thisAbort.aborted) {
            stopMediaFull().catch(() => {});
          }
        });

      // Ack que le pipeline est lancé (utile côté parent)
      process.send?.({
        type: "log",
        text: "playStream started (pipeline alive)",
      });
      process.send?.({
        type: "started",
      });

      return;
    }
  } catch (e) {
    process.send?.({ type: "error", text: String(e?.message || e) });
    await stopMediaFull().catch(() => {});
    try {
      await streamer?.leaveVoice();
    } catch {}
    process.exit(1);
  }
});

// Si le parent meurt
process.on("disconnect", async () => {
  await leaveVoiceAndExit();
});
process.on("SIGTERM", async () => {
  await leaveVoiceAndExit();
});
process.on("SIGINT", async () => {
  await leaveVoiceAndExit();
});

// ====== Login Discord ======
(async () => {
  client = new Client();
  streamer = new Streamer(client);

  client.on("ready", () => {
    process.send?.({ type: "ready", username: client.user.username });
    readyResolve();
  });

  await client.login(TOKEN);
})();
