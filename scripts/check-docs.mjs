import { readFileSync, readdirSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
function markdownFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if ([".git", "node_modules", "dist"].includes(entry.name)) return [];
    const path = resolve(directory, entry.name);
    return entry.isDirectory()
      ? markdownFiles(path)
      : entry.name.endsWith(".md")
        ? [path]
        : [];
  });
}
const missing = [];
for (const file of markdownFiles(process.cwd())) {
  const source = readFileSync(file, "utf8").replace(/```[\s\S]*?```/g, "");
  for (const [, link] of source.matchAll(/\]\(([^\s)]+)(?:\s+"[^"]*")?\)/g)) {
    if (/^(?:https?:|mailto:|#)/.test(link)) continue;
    const target = decodeURIComponent(link.split("#")[0]);
    if (!existsSync(resolve(dirname(file), target)))
      missing.push(`${file}: ${target}`);
  }
}
if (missing.length) {
  console.error(missing.join("\n"));
  process.exitCode = 1;
} else console.log("Local Markdown links resolve");
