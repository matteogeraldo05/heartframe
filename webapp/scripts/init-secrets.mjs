#!/usr/bin/env node
// Creates the secret files the server reads (run once, on the server):
//   secrets/message_key          32 random bytes (base64) - also provisioned into the frame
//   secrets/admin_password_hash  scrypt hash of the web UI password
// You add secrets/github_token yourself (the fine-grained WRITE token, see the guide).
import { randomBytes, scryptSync } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline";

const dir = new URL("../secrets/", import.meta.url).pathname;
mkdirSync(dir, { recursive: true, mode: 0o700 });

function write(name, value) {
  const file = dir + name;
  if (existsSync(file)) { console.log(`keep   ${file} (already exists)`); return; }
  writeFileSync(file, value + "\n", { mode: 0o600 });
  chmodSync(file, 0o600);
  console.log(`wrote  ${file}`);
}

function askHidden(prompt) {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    rl._writeToOutput = (s) => { if (s.includes(prompt)) rl.output.write(s); };
    rl.question(prompt, (a) => { rl.close(); process.stdout.write("\n"); resolve(a); });
  });
}

write("message_key", randomBytes(32).toString("base64"));

if (!existsSync(dir + "admin_password_hash")) {
  const pw = await askHidden("Web UI password (12+ characters): ");
  const again = await askHidden("Again: ");
  if (pw !== again || pw.length < 12) { console.error("passwords differ or too short"); process.exit(1); }
  const salt = randomBytes(16);
  const N = 32768, r = 8, p = 1;
  const hash = scryptSync(pw, salt, 32, { N, r, p, maxmem: 256 * 1024 * 1024 });
  write("admin_password_hash", `scrypt$${N}$${r}$${p}$${salt.toString("base64")}$${hash.toString("base64")}`);
} else {
  console.log("keep   admin_password_hash (already exists)");
}

if (!existsSync(dir + "github_token")) {
  console.log(`\nNext: paste the fine-grained WRITE token into ${dir}github_token (one line), then chmod 600 it.`);
}
console.log("Back up secrets/message_key somewhere safe (password manager): the frame needs the same key.");
