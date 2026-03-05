import { runInit } from "./commands/init.js";
import { runAnalyze } from "./commands/analyze.js";
import { runVerify } from "./commands/verify.js";
import { runDoctor } from "./commands/doctor.js";
import { runDiagram } from "./commands/diagram.js";

const VERSION = "0.1.0";

function printHelp(): void {
  console.log(`Usage: playbook <command> [options]

Commands:
  init                          Initialize playbook docs/config
  analyze [--ci] [--json]       Analyze project stack
  verify [--ci] [--json]        Verify governance rules
  doctor                        Check local setup
  diagram [--repo <path>] [--out <path>] [--deps] [--structure]
                                Generate deterministic architecture Mermaid diagrams

Options:
  -h, --help     Show help
  -v, --version  Show version`);
}

const args = process.argv.slice(2);
const [command, ...rest] = args;

if (!command || command === "-h" || command === "--help") {
  printHelp();
  process.exit(0);
}

if (command === "-v" || command === "--version") {
  console.log(VERSION);
  process.exit(0);
}

if (command === "init") {
  runInit(process.cwd());
  process.exit(0);
}

if (command === "doctor") {
  process.exit(runDoctor(process.cwd()));
}

if (command === "analyze" || command === "verify") {
  const ci = rest.includes("--ci");
  const json = rest.includes("--json");
  const code = command === "analyze"
    ? runAnalyze(process.cwd(), { ci, json })
    : runVerify(process.cwd(), { ci, json });
  process.exit(code);
}

if (command === "diagram") {
  let repo = ".";
  let out = "docs/ARCHITECTURE_DIAGRAMS.md";
  let deps = false;
  let structure = false;

  for (let i = 0; i < rest.length; i += 1) {
    const arg = rest[i];
    if (arg === "--repo") {
      repo = rest[i + 1] ?? repo;
      i += 1;
    } else if (arg === "--out") {
      out = rest[i + 1] ?? out;
      i += 1;
    } else if (arg === "--deps") {
      deps = true;
    } else if (arg === "--structure") {
      structure = true;
    }
  }

  process.exit(runDiagram(process.cwd(), { repo, out, deps, structure }));
}

printHelp();
process.exit(1);
