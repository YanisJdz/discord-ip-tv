// src/index.js
import readline from "readline";
import { stdin as input, stdout as output } from "process";
import { startApp } from "./app.js";

const rl = readline.createInterface({ input, output });
rl.setPrompt("> ");

startApp({
  rl,
  send: (msg) => console.log(msg),
  allowProcessExit: true,
}).catch((err) => {
  console.error(err);
  process.exit(1);
});
