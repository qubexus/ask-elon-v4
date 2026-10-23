// Unit tests for src/format.ts without a test runner: node scripts/test-format.mjs  (or: npm run test:format)
import fs from "fs";
import path from "path";
import assert from "assert/strict";
import { fileURLToPath, pathToFileURL } from "url";
import ts from "typescript";

const dir = path.dirname(fileURLToPath(import.meta.url));
const src = fs.readFileSync(path.join(dir, "../src/format.ts"), "utf8");
const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } }).outputText;
const tmp = path.join(fs.mkdtempSync(path.join((await import("os")).tmpdir(), "fmt-")), "format.mjs");
fs.writeFileSync(tmp, js);
const { formatEmploymentLength: f, monthsBetween } = await import(pathToFileURL(tmp).href);

const T = new Date(2026, 9, 23); // 23 Oct 2026
const cases = [
  // [start, pl, en, ro]
  ["2023-10-23", "3 lata", "3 years", "3 ani"],
  ["2024-05-23", "2 lata i 5 miesięcy", "2 years 5 months", "2 ani și 5 luni"],
  ["2025-10-23", "1 rok", "1 year", "1 an"],
  ["2021-10-01", "5 lat", "5 years", "5 ani"],
  ["2025-11-23", "11 miesięcy", "11 months", "11 luni"],
  ["2026-10-01", "<1 miesiąc", "<1 month", "<1 lună"],
  ["2026-10-23", "<1 miesiąc", "<1 month", "<1 lună"],
  ["2026-09-23", "1 miesiąc", "1 month", "1 lună"],
  ["2026-07-23", "3 miesiące", "3 months", "3 luni"],
  ["2025-09-23", "1 rok i 1 miesiąc", "1 year 1 month", "1 an și 1 lună"],
  ["2004-10-23", "22 lata", "22 years", "22 de ani"],
  ["2014-10-23", "12 lat", "12 years", "12 ani"],
  ["2006-10-23", "20 lat", "20 years", "20 de ani"],
  ["2001-08-23", "25 lat i 2 miesiące", "25 years 2 months", "25 de ani și 2 luni"],
];
for (const [s, pl, en, ro] of cases) {
  assert.equal(f(s, "pl", T), pl, `pl ${s}`);
  assert.equal(f(s, "en", T), en, `en ${s}`);
  assert.equal(f(s, "ro", T), ro, `ro ${s}`);
}
// day not yet reached -> previous month
assert.equal(f("2024-05-24", "pl", T), "2 lata i 4 miesiące");
// end of month: 31 Jan -> 28 Feb counts as 1 month
assert.equal(monthsBetween("2026-01-31", new Date(2026, 1, 28)), 1);
// missing / invalid / future -> ""
for (const bad of ["", null, undefined, "2027-01-01", "abc", "2024-02-31", "12/01/2024"]) {
  assert.equal(f(bad, "pl", T), "", `bad ${bad}`);
}
console.log(`format.ts: ${cases.length * 3 + 10} assertions OK`);
