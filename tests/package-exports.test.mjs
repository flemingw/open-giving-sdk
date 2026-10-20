import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";

test("private library package surfaces allowlist built exports, not local source/config/state", () => {
  for (const path of [
    "packages/protocol",
    "packages/provider-sdk",
    "packages/conformance",
    "packages/registry",
    "packages/server",
  ]) {
    const root = new URL(`../${path}/`, import.meta.url);
    const manifest = JSON.parse(
      readFileSync(new URL("package.json", root), "utf8"),
    );
    assert.equal(manifest.private, true, path);
    assert.equal(manifest.type, "module", path);
    assert.ok(manifest.files?.length, path);
    for (const exported of [
      manifest.exports["."].types,
      manifest.exports["."].default,
    ]) {
      const relative = exported.replace(/^\.\//, "");
      assert.ok(manifest.files.includes(relative), path + ": " + relative);
      assert.ok(
        existsSync(new URL(relative, root)),
        path + ": built export missing",
      );
    }
    assert.ok(
      manifest.files.every(
        (file) =>
          /^dist\/[a-z]+\.(?:js|d\.ts)$/.test(file) ||
          (path === "packages/protocol" &&
            ["schemas/v1.json", "openapi.json"].includes(file)),
      ),
      path,
    );
  }
});
