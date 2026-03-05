import { defineConfig } from "tsup";

export default defineConfig({
  entry: { main: "src/main.ts" },
  format: ["esm"],
  dts: true,
  bundle: true,
  noExternal: [/^@zachariahredfield\//],
  target: "es2022",
  clean: true,
  outDir: "dist",
  esbuildOptions(options) {
    options.alias = {
      "@zachariahredfield/playbook-core": "../core/src/index.ts",
      "@zachariahredfield/playbook-engine": "../engine/src/index.ts",
      "@zachariahredfield/playbook-node": "../node/src/index.ts",
    };
  },
  outExtension({ format }) {
    return {
      js: format === "esm" ? ".js" : ".cjs",
    };
  },
  banner: {
    js: "#!/usr/bin/env node",
  },
});
