#!/usr/bin/env bun
import path from "path";
import { existsSync } from "fs";
import { rm } from "fs/promises";
import tailwind from "bun-plugin-tailwind";

const TARGETS = {
  "linux-x64": "bun-linux-x64",
  "linux-arm64": "bun-linux-aarch64",
  "darwin-x64": "bun-darwin-x64",
  "darwin-arm64": "bun-darwin-aarch64",
} as const;

type TargetKey = keyof typeof TARGETS;

const targetArg = process.argv.find((a) => a.startsWith("--target="))?.split("=")[1] as
  | TargetKey
  | undefined;

if (targetArg && !(targetArg in TARGETS)) {
  console.error(`❌ Unknown target: ${targetArg}`);
  console.error(`   Available: ${Object.keys(TARGETS).join(", ")}`);
  process.exit(1);
}

const target = targetArg ? TARGETS[targetArg] : "bun";
const suffix = targetArg ?? "native";

const outdir = path.join(process.cwd(), "dist");
const publicDir = path.join(outdir, "public");
const outfile = path.join(outdir, `alfredo-${suffix}`);
const prodServerPath = path.join(outdir, "_prod-server.ts");

if (existsSync(outdir)) {
  console.log("🗑️  Cleaning previous build...");
  await rm(outdir, { recursive: true, force: true });
}

// Step 1: Build frontend assets with Tailwind plugin
console.log("📦 Building frontend assets...\n");

const htmlEntrypoints = [...new Bun.Glob("**.html").scanSync("src")]
  .map((f) => path.resolve("src", f))
  .filter((f) => !f.includes("node_modules"));

const buildResult = await Bun.build({
  entrypoints: htmlEntrypoints,
  outdir: publicDir,
  plugins: [tailwind],
  minify: true,
  target: "browser",
  sourcemap: "none",
  define: {
    "process.env.NODE_ENV": JSON.stringify("production"),
  },
});

if (!buildResult.success) {
  console.error("❌ Frontend build failed:");
  for (const log of buildResult.logs) {
    console.error(log);
  }
  process.exit(1);
}

console.log("✅ Frontend assets built\n");

// Step 2: Generate production server that embeds pre-built static files
// Using `import ... with { type: "file" }` to embed each asset into the executable,
// avoiding the HTML import mechanism which double-hashes asset filenames.

const MIME_TYPES: Record<string, string> = {
  ".html": "text/html;charset=utf-8",
  ".css": "text/css;charset=utf-8",
  ".js": "application/javascript;charset=utf-8",
  ".mjs": "application/javascript;charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".json": "application/json",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

const builtFiles: string[] = [];
for await (const file of new Bun.Glob("*").scan(publicDir)) {
  builtFiles.push(file);
}

const importLines = builtFiles.map(
  (f, i) => `import f${i} from "./public/${f}" with { type: "file" };`,
);

const htmlIdx = builtFiles.indexOf("index.html");
if (htmlIdx === -1) {
  console.error("❌ index.html not found in build output");
  process.exit(1);
}

const staticRouteLines = builtFiles
  .filter((f) => f !== "index.html")
  .map((f) => {
    const i = builtFiles.indexOf(f);
    const ext = path.extname(f);
    const mime = MIME_TYPES[ext] || "application/octet-stream";
    return `    "/${f}": () => new Response(Bun.file(f${i}), { headers: { "content-type": "${mime}" } }),`;
  });

const prodServerCode = `import "../src/lib/init-env";
import { serve } from "bun";
import { runCLI } from "../src/cli";
import { apiRoutes } from "../src/routes";
${importLines.join("\n")}

const command = process.argv[2];

if (command && command !== "serve") {
  await runCLI(command);
  process.exit(0);
}

const htmlResponse = () => new Response(Bun.file(f${htmlIdx}), { headers: { "content-type": "text/html;charset=utf-8" } });

const server = serve({
  routes: {
    ...apiRoutes,
${staticRouteLines.join("\n")}
    "/": htmlResponse,
    "/*": htmlResponse,
  },
});

console.log(\`Server running at \${server.url}\`);
`;

await Bun.write(prodServerPath, prodServerCode);

// Step 3: Compile the production server into a standalone executable
console.log(`🚀 Compiling single executable (${suffix})...\n`);

const start = performance.now();

const proc = Bun.spawn(
  [
    "bun",
    "build",
    "--compile",
    "--minify",
    "--sourcemap=none",
    `--target=${target}`,
    "--outfile",
    outfile,
    prodServerPath,
  ],
  {
    cwd: process.cwd(),
    stdout: "inherit",
    stderr: "inherit",
    env: {
      ...process.env,
      NODE_ENV: "production",
    },
  },
);

const exitCode = await proc.exited;
const elapsed = (performance.now() - start).toFixed(0);

if (exitCode !== 0) {
  console.error(`\n❌ Compilation failed (exit code ${exitCode})`);
  process.exit(exitCode);
}

// Step 4: Clean up temporary build artifacts
await rm(prodServerPath, { force: true });
await rm(publicDir, { recursive: true, force: true });

for await (const mapFile of new Bun.Glob("**/*.map").scan(outdir)) {
  await rm(path.join(outdir, mapFile));
}

if (existsSync(outfile)) {
  const size = Bun.file(outfile).size;
  const mb = (size / 1024 / 1024).toFixed(2);
  console.log(
    `\n✅ Compiled in ${elapsed}ms → ${path.relative(process.cwd(), outfile)} (${mb} MB)`,
  );
} else {
  console.log(`\n✅ Compiled in ${elapsed}ms`);
}
