// DUSTLINE — tiny static server for local play. Serves game/ on
// http://localhost:8080 with no build step. Usage: node serve.ts
// (or: node serve.ts --port 9000). Standard library only.
import { createReadStream, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL(".", import.meta.url)), "game");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".glb": "model/gltf-binary",
  ".wav": "audio/wav",
  ".ogg": "audio/ogg",
};

function portFromArgs(argv) {
  const i = argv.indexOf("--port");
  if (i >= 0 && argv[i + 1]) {
    const p = Number(argv[i + 1]);
    if (Number.isInteger(p) && p > 0 && p < 65536) return p;
  }
  return 8080;
}

const port = portFromArgs(process.argv.slice(2));

const server = createServer((req, res) => {
  const raw = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
  const rel = normalize(raw === "/" ? "index.html" : raw.replace(/^\/+/, ""));
  const file = resolve(join(root, rel));
  // Refuse anything that escapes game/.
  if (file !== root && !file.startsWith(root + sep)) {
    res.writeHead(403, { "content-type": "text/plain; charset=utf-8" });
    res.end("403 forbidden\n");
    return;
  }
  let stat;
  try {
    stat = statSync(file);
  } catch {
    stat = null;
  }
  if (!stat || !stat.isFile()) {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("404 not found\n");
    return;
  }
  res.writeHead(200, {
    "content-type": MIME[extname(file).toLowerCase()] ?? "application/octet-stream",
    "cache-control": "no-store",
    "content-length": stat.size,
  });
  createReadStream(file).pipe(res);
});

server.listen(port, () => {
  console.log(`DUSTLINE serving game/ at http://localhost:${port}`);
});
