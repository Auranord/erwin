import fs from "fs";

function writeFatalLogSync(message, errorLike) {
  const errorMessage = String(errorLike?.message || errorLike);
  const entry = {
    time: new Date().toISOString(),
    level: "error",
    message,
    error: errorMessage,
    stack: errorLike?.stack || null
  };
  try {
    fs.writeSync(process.stderr.fd, `${JSON.stringify(entry)}\n`);
  } catch {
    // best effort
  }
}

try {
  await import("./server.js");
} catch (error) {
  writeFatalLogSync("server bootstrap failed", error);
  process.exit(1);
}
