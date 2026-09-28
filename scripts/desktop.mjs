import { spawn } from "node:child_process";
import { homedir } from "node:os";
import { delimiter, join } from "node:path";
import { fileURLToPath } from "node:url";
const project = fileURLToPath(new URL("../", import.meta.url));
const child = spawn(
  process.execPath,
  [
    join(project, "node_modules/@tauri-apps/cli/tauri.js"),
    ...process.argv.slice(2),
  ],
  {
    cwd: project,
    stdio: "inherit",
    env: {
      ...process.env,
      PATH:
        join(homedir(), ".cargo", "bin") + delimiter + (process.env.PATH || ""),
    },
  },
);
child.on("error", (error) => {
  console.error(error.message);
  process.exitCode = 1;
});
child.on("exit", (code) => {
  process.exitCode = code ?? 1;
});
