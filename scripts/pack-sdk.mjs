import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { resolve, join, dirname, relative } from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = fileURLToPath(new URL("../", import.meta.url));
const json = (path) => JSON.parse(readFileSync(path, "utf8"));
const libraries = [
  "protocol",
  "provider-sdk",
  "registry",
  "conformance",
  "server",
];
const entries = {
  protocol: "protocol/index.js",
  "provider-sdk": "provider-sdk/index.js",
  registry: "registry/index.js",
  conformance: "conformance/index.js",
  service: "server/service.js",
  tools: "server/tools.js",
  server: "server/index.js",
};
const modules = Object.fromEntries(
  libraries.map((name) => [`@open-giving/${name}`, `${name}/index.js`]),
);
modules["@open-giving/server/service"] = entries.service;
modules["@open-giving/server/tools"] = entries.tools;

/** Relocate exact workspace module specifiers in generated JS/declarations.
 * TypeScript finds string literal spans, so comments and other source text are
 * not rewritten. No bundler, runtime resolver or unpublished package is needed. */
function relocate(text, path, target) {
  const tree = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, false);
  const edits = [];
  function visit(node) {
    if (ts.isStringLiteral(node) && node.text.startsWith("@open-giving/")) {
      const module = modules[node.text];
      if (!module) throw Error("Unknown internal module in release build");
      let destination = relative(dirname(path), join(target, "dist", module))
        .split("\\")
        .join("/");
      if (!destination.startsWith(".")) destination = "./" + destination;
      edits.push({
        start: node.getStart(tree),
        end: node.end,
        text: JSON.stringify(destination),
      });
    }
    ts.forEachChild(node, visit);
  }
  visit(tree);
  for (const edit of edits.sort((a, b) => b.start - a.start))
    text = text.slice(0, edit.start) + edit.text + text.slice(edit.end);
  return text;
}

export function packSdk() {
  const artifacts = join(root, ".artifacts");
  mkdirSync(artifacts, { recursive: true });
  const target = mkdtempSync(join(artifacts, "sdk-"));
  const manifest = json(join(root, "sdk.package.json"));
  manifest.dependencies = {};
  manifest.exports = {};
  for (const name of libraries) {
    const source = join(root, "packages", name),
      lib = json(join(source, "package.json"));
    for (const [dependency, version] of Object.entries(
      lib.dependencies ?? {},
    )) {
      if (dependency.startsWith("@open-giving/")) continue;
      if (
        manifest.dependencies[dependency] &&
        manifest.dependencies[dependency] !== version
      )
        throw Error("Conflicting runtime dependency");
      manifest.dependencies[dependency] = version;
    }
    for (const file of lib.files) {
      if (file.includes("..") || file.startsWith("/"))
        throw Error("Invalid package allowlist");
      const destination = file.startsWith("dist/")
        ? join(target, "dist", name, file.slice(5))
        : join(target, file);
      mkdirSync(dirname(destination), { recursive: true });
      if (/\.(?:js|ts)$/.test(file))
        writeFileSync(
          destination,
          relocate(
            readFileSync(join(source, file), "utf8"),
            destination,
            target,
          ),
        );
      else copyFileSync(join(source, file), destination);
    }
  }
  for (const [name, path] of Object.entries(entries))
    manifest.exports[`./${name}`] = {
      types: `./dist/${path.replace(/\.js$/, ".d.ts")}`,
      default: `./dist/${path}`,
    };
  for (const extension of ["js", "d.ts"])
    writeFileSync(
      join(target, `dist/index.${extension}`),
      ["protocol", "provider-sdk", "registry", "service", "tools"]
        .map((name) => `export * from "./${entries[name]}";`)
        .join("\n") + "\n",
    );
  manifest.exports["."] = {
    types: "./dist/index.d.ts",
    default: "./dist/index.js",
  };
  for (const name of ["LICENSE", "DCO"])
    copyFileSync(join(root, name), join(target, name));
  copyFileSync(join(root, "docs/INSTALL.md"), join(target, "README.md"));
  writeFileSync(
    join(target, "package.json"),
    JSON.stringify(manifest, null, 2) + "\n",
  );
  const lock = json(join(root, "package-lock.json"));
  const locked = Object.fromEntries(
    Object.entries(lock.packages).filter(
      ([path, value]) => path.startsWith("node_modules/") && !value.link,
    ),
  );
  writeFileSync(
    join(target, "npm-shrinkwrap.json"),
    JSON.stringify(
      {
        name: manifest.name,
        version: manifest.version,
        lockfileVersion: 3,
        requires: true,
        packages: { "": manifest, ...locked },
      },
      null,
      2,
    ) + "\n",
  );
  const packed = JSON.parse(
    execFileSync(
      "npm",
      [
        "pack",
        "--ignore-scripts",
        "--offline",
        "--json",
        "--cache",
        join(artifacts, "npm-cache"),
      ],
      { cwd: target, encoding: "utf8" },
    ),
  )[0];
  return {
    packageDirectory: target,
    tarball: join(target, packed.filename),
    integrity: packed.integrity,
    files: packed.files.map((file) => file.path),
  };
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  console.log(JSON.stringify(packSdk(), null, 2));
