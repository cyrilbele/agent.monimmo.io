import { existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export type QmdCommandResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
};

export const QMD_WORKSPACE_ROOT_DIR = fileURLToPath(new URL("../../../", import.meta.url));
const QMD_SCRIPT_PATH = resolve(QMD_WORKSPACE_ROOT_DIR, "node_modules/@tobilu/qmd/src/qmd.ts");
const QMD_RUNTIME_CONFIG_HOME = resolve(QMD_WORKSPACE_ROOT_DIR, "data/qmd/runtime/config");
const QMD_RUNTIME_CACHE_HOME = resolve(QMD_WORKSPACE_ROOT_DIR, "data/qmd/runtime/cache");

let qmdQueue: Promise<void> = Promise.resolve();

export const withQmdGlobalLock = async <T>(operation: () => Promise<T>): Promise<T> => {
  const waitForPrevious = qmdQueue;
  let releaseCurrent: (() => void) | undefined;
  qmdQueue = new Promise<void>((resolve) => {
    releaseCurrent = resolve;
  });

  await waitForPrevious;

  try {
    return await operation();
  } finally {
    releaseCurrent?.();
  }
};

export const ensureQmdRuntimeDirectories = (): void => {
  mkdirSync(QMD_RUNTIME_CONFIG_HOME, { recursive: true });
  mkdirSync(QMD_RUNTIME_CACHE_HOME, { recursive: true });
};

const toQmdEnv = (): NodeJS.ProcessEnv => ({
  ...process.env,
  XDG_CONFIG_HOME: QMD_RUNTIME_CONFIG_HOME,
  XDG_CACHE_HOME: QMD_RUNTIME_CACHE_HOME,
});

export const runQmdCommand = async (
  args: string[],
  options?: { allowFailure?: boolean },
): Promise<QmdCommandResult> => {
  ensureQmdRuntimeDirectories();

  if (!existsSync(QMD_SCRIPT_PATH)) {
    if (options?.allowFailure) {
      return {
        exitCode: 127,
        stdout: "",
        stderr: `QMD script introuvable: ${QMD_SCRIPT_PATH}`,
      };
    }

    throw new Error(`QMD script introuvable: ${QMD_SCRIPT_PATH}`);
  }

  const processHandle = Bun.spawn([process.execPath, QMD_SCRIPT_PATH, ...args], {
    cwd: QMD_WORKSPACE_ROOT_DIR,
    env: toQmdEnv(),
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
  });

  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(processHandle.stdout).text(),
    new Response(processHandle.stderr).text(),
    processHandle.exited,
  ]);

  if (exitCode !== 0 && !options?.allowFailure) {
    throw new Error(
      `Commande QMD en echec (${args.join(" ")}): ${stderr || stdout || `exit=${exitCode}`}`,
    );
  }

  return {
    exitCode,
    stdout,
    stderr,
  };
};
