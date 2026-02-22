import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { spawnSync } from "child_process";

function writeFatalLogSync(message, errorLike, meta = {}) {
  const errorMessage = String(errorLike?.message || errorLike);
  const entry = {
    time: new Date().toISOString(),
    level: "error",
    message,
    error: errorMessage,
    stack: errorLike?.stack || null,
    ...meta
  };
  try {
    fs.writeSync(process.stderr.fd, `${JSON.stringify(entry)}\n`);
  } catch {
    // best effort
  }
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const serverPath = path.join(__dirname, "server.js");

const syntaxCheck = spawnSync(process.execPath, ["--check", serverPath], {
  encoding: "utf8"
});
if (syntaxCheck.status !== 0) {
  if (syntaxCheck.stderr) {
    try {
      fs.writeSync(process.stderr.fd, syntaxCheck.stderr);
    } catch {
      // best effort
    }
  }
  writeFatalLogSync("server bootstrap syntax check failed", "server.js failed --check", {
    exitCode: syntaxCheck.status,
    signal: syntaxCheck.signal || null
  });
  process.exit(1);
}

try {
  await import("./server.js");
} catch (error) {
  writeFatalLogSync("server bootstrap failed", error);
  process.exit(1);
}
