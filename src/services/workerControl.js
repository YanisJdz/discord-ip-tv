import { fork } from "child_process";

/**
 * Lance le worker et câble les events.
 * @param {Object} options
 * @param {Object} options.env         - Variables d'env à passer au worker
 * @param {Function} options.onEvent   - callback(eventName, payload) pour propager les events du worker
 * @returns {{ worker: ChildProcess, readyPromise: Promise<void> }}
 */
export function launchWorker({ env = {}, onEvent } = {}) {
  const worker = fork("src/worker/stream-worker.js", [], {
    env: { ...process.env, ...env },
    stdio: ["ignore", "pipe", "pipe", "ipc"],
  });

  let readyResolve;
  const readyPromise = new Promise((res) => (readyResolve = res));

  // Relais des events du worker
  worker.on("message", (msg) => {
    if (!msg || typeof msg !== "object") return;
    if (msg.type === "ready") {
      onEvent?.("ready", msg);
      readyResolve();
    } else if (msg.type === "joined") {
      onEvent?.("joined", msg);
    } else if (msg.type === "started") {
      onEvent?.("started", msg);
    } else if (msg.type === "stopped") {
      onEvent?.("stopped", msg);
    } else if (msg.type === "error") {
      onEvent?.("error", msg);
    } else if (msg.type === "log") {
      onEvent?.("log", msg);
    }
  });

  // Logs du worker (filtrage de bruit fait côté worker)
  worker.stdout?.setEncoding("utf8");
  worker.stdout?.on("data", (chunk) => onEvent?.("stdout", chunk));
  worker.stderr?.setEncoding("utf8");
  worker.stderr?.on("data", (chunk) => onEvent?.("stderr", chunk));

  worker.on("exit", (code) => {
    onEvent?.("exit", { code });
  });

  return { worker, readyPromise };
}

/** Démarrer un stream sur une URL */
export function startWorkerStream(worker, url) {
  if (!worker?.connected) return;
  worker.send({ type: "start", url });
}

/** Stopper le flux (rester dans le vocal) */
export function stopWorker(worker) {
  if (!worker?.connected) return;
  worker.send({ type: "stop" });
}

/** Quitter le vocal et terminer le worker proprement */
export function leaveWorker(worker) {
  if (!worker?.connected) return;
  worker.send({ type: "leave" });
}

/** Tuer le worker immédiatement (hard kill) */
export function killWorker(worker) {
  try {
    worker?.kill("SIGTERM");
  } catch {}
}

/** Petite util */
export function wait(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Redémarre le worker et démarre un stream sur l'URL donnée.
 * - kill l’ancien worker
 * - attend backoffMs
 * - relance un worker
 * - attend 'ready'
 * - start(url)
 *
 * @param {ChildProcess|null} currentWorker
 * @param {string} url
 * @param {{ env?: Object, onEvent?: Function, backoffMs?: number }} options
 * @returns {Promise<{ worker: ChildProcess }>}
 */
export async function restartWorkerAndStart(
  currentWorker,
  url,
  { env = {}, onEvent, backoffMs = 2000 } = {}
) {
  if (currentWorker) {
    try {
      currentWorker.kill("SIGTERM");
    } catch {}
  }
  await wait(backoffMs);

  const { worker, readyPromise } = launchWorker({ env, onEvent });
  await readyPromise; // attendre le "ready" du worker
  startWorkerStream(worker, url);
  return { worker };
}
