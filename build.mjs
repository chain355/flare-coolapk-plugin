import { execFileSync } from "node:child_process";
import { cp, mkdir, mkdtemp, readdir, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { build, context } from "esbuild";

const root = fileURLToPath(new URL(".", import.meta.url));
const mode = process.argv[2];
if ((mode && !["--watch", "--package", "--package-v2"].includes(mode)) || process.argv.length > 3) {
  throw new Error("Usage: node build.mjs [--watch|--package|--package-v2]");
}
// API v1 (Flare 1.8.x / Play) has no media custom headers and approves only the
// account origin, so it needs a proxy for images. API v2 (Flare master) does not.
const v2 = mode === "--package-v2";
const imageProxy = v2 ? "" : "https://wsrv.nl/?url=";

const options = {
  absWorkingDir: root,
  entryPoints: ["src/plugin.ts"],
  outfile: "plugin.js",
  bundle: true,
  format: "iife",
  platform: "neutral",
  mainFields: ["module", "main"],
  target: "es2020",
  logLevel: "info",
  write: false,
  define: {
    __V2__: JSON.stringify(v2),
    __IMAGE_PROXY__: JSON.stringify(imageProxy),
  },
};

if (mode === "--watch") {
  await (
    await context({
      ...options,
      plugins: [
        {
          name: "plugin-output",
          setup(builder) {
            builder.onEnd(async (result) => {
              if (!result.errors.length) await writeScript(singleScript(result));
            });
          },
        },
      ],
    })
  ).watch();
} else if (mode === "--package" || mode === "--package-v2") {
  const result = await build(options);
  const script = singleScript(result);
  if (!v2) await writeScript(script);
  const staging = await mkdtemp(join(tmpdir(), "flare-plugin-package-"));
  try {
    await writeFile(join(staging, "plugin.js"), script, { flag: "wx" });
    await cp(join(root, v2 ? "manifest.v2.json" : "manifest.json"), join(staging, "manifest.json"));
    await mkdir(join(staging, "assets"));
    for (const name of await readdir(join(root, "assets"))) {
      if (/^icon\.(?:png|jpe?g|webp|gif|ico)$/.test(name)) {
        await cp(join(root, "assets", name), join(staging, "assets", name));
      }
    }
    const catalogs = await readdir(join(root, "locales")).catch((error) => {
      if (error.code !== "ENOENT") throw error;
      return [];
    });
    if (catalogs.length) {
      await mkdir(join(staging, "locales"));
      for (const name of catalogs.filter((name) => name.endsWith(".json"))) {
        await cp(join(root, "locales", name), join(staging, "locales", name));
      }
    }
    await cp(join(root, "settings"), join(staging, "settings"), { recursive: true }).catch((error) => {
      if (error.code !== "ENOENT") throw error;
    });
    const packer = fileURLToPath(import.meta.resolve("flare-plugin-sdk/skill/flare-plugin/pack.mjs"));
    const target = join(root, v2 ? "plugin-v2.fpp" : "plugin.fpp");
    execFileSync(process.execPath, [packer, staging, target], { stdio: "inherit" });
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
} else {
  await writeScript(singleScript(await build(options)));
}

function singleScript(result) {
  if (result.errors.length) throw new Error("Build failed");
  if (result.outputFiles.length !== 1) throw new Error("A plugin build must emit one JavaScript file");
  return result.outputFiles[0].contents;
}

/** Preserve the installable script while edits are invalid or a build is interrupted. */
async function writeScript(contents) {
  const temporary = await mkdtemp(join(root, ".plugin-build-"));
  try {
    await writeFile(join(temporary, "plugin.js"), contents, { flag: "wx" });
    await rename(join(temporary, "plugin.js"), join(root, "plugin.js"));
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}
