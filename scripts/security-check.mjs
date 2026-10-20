import { execFileSync } from "node:child_process";
import { readFileSync, statSync, existsSync } from "node:fs";
const files = execFileSync(
  "git",
  ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
  { encoding: "utf8" },
)
  .split("\0")
  .filter(Boolean);
const patterns = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{24,}\b/,
  /\bwhsec_[A-Za-z0-9]{32,}\b/,
  /\bgh[pousr]_[A-Za-z0-9]{30,}\b/,
];
const failures = [];
for (const file of new Set(files)) {
  if (
    !existsSync(file) ||
    !statSync(file).isFile() ||
    statSync(file).size > 5_000_000
  )
    continue;
  if (patterns.some((pattern) => pattern.test(readFileSync(file, "utf8"))))
    failures.push(file);
}
if (failures.length) {
  console.error(
    "Potential credentials found in files (values withheld):",
    failures.join(", "),
  );
  process.exitCode = 1;
} else
  console.log(
    "High-confidence credential-pattern check passed. This is not a complete Git-history or privacy review.",
  );
