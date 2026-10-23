// Unit tests for src/caseChat.ts without a test runner: node scripts/test-case-chat.mjs  (or: npm run test:case-chat)
import fs from "fs";
import os from "os";
import path from "path";
import assert from "assert/strict";
import { fileURLToPath, pathToFileURL } from "url";
import ts from "typescript";

const dir = path.dirname(fileURLToPath(import.meta.url));
const src = fs.readFileSync(path.join(dir, "../src/caseChat.ts"), "utf8");
const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } }).outputText;
const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "casechat-")), "caseChat.mjs");
fs.writeFileSync(tmp, js);
const { descriptionIsFirstMessage: dup } = await import(pathToFileURL(tmp).href);

const desc = "Supervisor uciął z grafiku 24h w tygodniu bez uprzedzenia.";
// Case created from the form / seeded at signup: no messages yet -> description must be shown.
assert.equal(dup(desc, []), false);
// Later messages that don't repeat the description -> still shown first.
assert.equal(dup(desc, [{ role: "user", text: "Co mam teraz zrobić?" }, { role: "assistant", text: "..." }]), false);
// Case saved from a chat ("add as case"): description == first user message -> not repeated.
assert.equal(dup(desc, [{ role: "user", text: desc }, { role: "assistant", text: "..." }]), true);
// Long first message: description is its first 1000 chars.
const long = "x".repeat(1500);
assert.equal(dup(long.slice(0, 1000), [{ role: "user", text: long }]), true);
// Assistant-first threads are compared with the first *user* message.
assert.equal(dup(desc, [{ role: "assistant", text: desc }]), false);
// Whitespace differences are ignored; an empty description is never shown.
assert.equal(dup(`  ${desc}\n`, [{ role: "user", text: `${desc}  ` }]), true);
assert.equal(dup("", []), true);
console.log("caseChat: all 7 checks passed");
