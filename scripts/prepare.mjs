import { execSync } from "node:child_process";

function hasPnpm() {
  try {
    execSync("pnpm -v", { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

const cmd = hasPnpm() ? "pnpm -r build" : "npm run build";
console.log("[prepare] " + cmd);
execSync(cmd, { stdio: "inherit" });
