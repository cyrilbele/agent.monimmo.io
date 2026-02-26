import { readFileSync } from "node:fs";

const [,, lcovPath, thresholdRaw, labelRaw] = process.argv;

if (!lcovPath || !thresholdRaw) {
  console.error(
    "Usage: bun scripts/check-lcov-threshold.mjs <lcovPath> <threshold> [label]",
  );
  process.exit(1);
}

const threshold = Number(thresholdRaw);
const label = labelRaw ?? "coverage";

if (Number.isNaN(threshold)) {
  console.error("Le seuil de couverture est invalide.");
  process.exit(1);
}

const content = readFileSync(lcovPath, "utf8");
const coverageLines = content
  .split("\n")
  .filter((line) => line.startsWith("DA:"));

if (coverageLines.length === 0) {
  console.error(`Aucune ligne de couverture détectée pour ${label}.`);
  process.exit(1);
}

let covered = 0;

for (const line of coverageLines) {
  const [, hitsRaw] = line.slice(3).split(",");
  const hits = Number(hitsRaw);
  if (!Number.isNaN(hits) && hits > 0) {
    covered += 1;
  }
}

const total = coverageLines.length;
const ratio = (covered / total) * 100;
const ratioRounded = Number(ratio.toFixed(2));

if (ratio < threshold) {
  console.error(
    `[${label}] coverage lignes ${ratioRounded}% < seuil requis ${threshold}%`,
  );
  process.exit(1);
}

console.info(
  `[${label}] coverage lignes ${ratioRounded}% (seuil requis ${threshold}%)`,
);

