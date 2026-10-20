import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { packSdk } from "../scripts/pack-sdk.mjs";

test("the standalone SDK installs in an independent consumer without workspace links or registry-only internal packages", () => {
  const packed = packSdk();
  assert.ok(packed.files.includes("dist/server/tools.js"));
  assert.ok(
    packed.files.every(
      (path) => !/(?:examples|tests|scripts|\.env|\.git)\//.test(path),
    ),
  );
  const manifest = JSON.parse(
    readFileSync(join(packed.packageDirectory, "package.json"), "utf8"),
  );
  assert.equal(manifest.private, false);
  assert.ok(
    Object.keys(manifest.dependencies).every(
      (name) => !name.startsWith("@open-giving/"),
    ),
  );
  const consumer = mkdtempSync(join(tmpdir(), "giving-consumer-"));
  writeFileSync(
    join(consumer, "package.json"),
    JSON.stringify({ private: true, type: "module" }),
  );
  execFileSync(
    "npm",
    [
      "install",
      "--prefer-offline",
      "--ignore-scripts",
      "--no-audit",
      "--no-fund",
      packed.tarball,
    ],
    { cwd: consumer, stdio: "pipe" },
  );
  const code = `import {GivingService,ProviderRegistry,createGivingTools} from "${manifest.name}";
    const service=new GivingService(new ProviderRegistry([]));
    const tools=createGivingTools(service,{id:"guest",clientId:"agent",scopes:["opportunities:read"]},"test");
    const result=await tools.find(t=>t.name==="list_providers").call({});
    if(result.structuredContent.providers.length!==0)throw Error("Bad consumer result");`;
  execFileSync(process.execPath, ["--input-type=module", "-e", code], {
    cwd: consumer,
    stdio: "pipe",
  });
  const source = `import {GivingService,ProviderRegistry,type ContributionProviderAdapter} from "${manifest.name}";
    const adapters: ContributionProviderAdapter[]=[];
    const service=new GivingService(new ProviderRegistry(adapters.map(adapter=>({id:"example",adapter,verification:"sandbox"}))));
    void service;`;
  writeFileSync(join(consumer, "consumer.ts"), source);
  execFileSync(
    fileURLToPath(new URL("../node_modules/.bin/tsc", import.meta.url)),
    [
      "--noEmit",
      "--strict",
      "--skipLibCheck",
      "--module",
      "NodeNext",
      "--moduleResolution",
      "NodeNext",
      "--target",
      "ES2022",
      "consumer.ts",
    ],
    { cwd: consumer, stdio: "pipe" },
  );
});
