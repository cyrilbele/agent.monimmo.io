import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const processes = [
  {
    name: "backend",
    cwd: rootDir,
    cmd: ["bun", "run", "dev:backend"],
  },
  {
    name: "front",
    cwd: resolve(rootDir, "front"),
    cmd: ["bun", "run", "start"],
  },
];

const children = [];
let isShuttingDown = false;
let finalExitCode = 0;
let forceExitTimer = null;

const shutdown = (exitCode = 0) => {
  if (isShuttingDown) {
    return;
  }

  isShuttingDown = true;
  finalExitCode = exitCode;

  for (const child of children) {
    if (child.exitCode === null) {
      child.kill("SIGTERM");
    }
  }

  forceExitTimer = setTimeout(() => {
    for (const child of children) {
      if (child.exitCode === null) {
        child.kill("SIGKILL");
      }
    }
    process.exit(finalExitCode);
  }, 1500);
};

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

for (const proc of processes) {
  const child = spawn(proc.cmd[0], proc.cmd.slice(1), {
    cwd: proc.cwd,
    stdio: "inherit",
    env: process.env,
  });

  child.on("exit", (code, signal) => {
    if (!isShuttingDown) {
      const normalizedCode = code ?? 1;
      const reason = signal ? `signal ${signal}` : `code ${normalizedCode}`;
      console.error(`[dev] ${proc.name} arrêté (${reason}).`);
      shutdown(normalizedCode);
    }

    const allExited = children.every((activeChild) => activeChild.exitCode !== null);
    if (isShuttingDown && allExited) {
      if (forceExitTimer) {
        clearTimeout(forceExitTimer);
      }
      process.exit(finalExitCode);
    }
  });

  children.push(child);
}

await new Promise(() => {});
