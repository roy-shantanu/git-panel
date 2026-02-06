import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceCandidates = [
  path.join(root, "node_modules", "vscode-material-icons", "generated", "icons"),
  path.join(root, "node_modules", "vscode-material-icons", "icons"),
  path.join(root, "node_modules", "vscode-material-icons", "dist", "icons")
];

const source = sourceCandidates.find((candidate) => fs.existsSync(candidate));
if (!source) {
  console.error("Material icons source not found. Looked in:", sourceCandidates);
  process.exit(1);
}

const destination = path.join(root, "public", "material-icons");
fs.rmSync(destination, { recursive: true, force: true });
fs.mkdirSync(destination, { recursive: true });
fs.cpSync(source, destination, { recursive: true });

console.log(`Copied material icons from ${source} to ${destination}`);
