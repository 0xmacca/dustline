// DUSTLINE — entry program. Hands the game in: copies game/ and
// screenshots/ from beside this file into the output directory and
// writes <out>/dossier.json with buildDossier from vendor/.
// Run locally: mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
// (without MAKEFUN_OUTPUT_DIR it writes to /output, as the grader does).
import { cpSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildDossier } from "./vendor/makefun-threejs.ts";

const root = fileURLToPath(new URL(".", import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? "/output";

mkdirSync(out, { recursive: true });
cpSync(join(root, "game"), join(out, "game"), { recursive: true });

const shots = join(root, "screenshots");
mkdirSync(join(out, "screenshots"), { recursive: true });
if (existsSync(shots)) {
  cpSync(shots, join(out, "screenshots"), { recursive: true });
}

const dossier = buildDossier(out, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
});
writeFileSync(join(out, "dossier.json"), dossier);
