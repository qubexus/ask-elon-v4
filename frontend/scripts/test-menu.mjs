// Unit tests for src/menu.ts (main menu drawer) + i18n coverage of the menu keys: node scripts/test-menu.mjs
import fs from "fs";
import os from "os";
import path from "path";
import assert from "assert/strict";
import { fileURLToPath, pathToFileURL } from "url";
import ts from "typescript";

const dir = path.dirname(fileURLToPath(import.meta.url));
const src = fs.readFileSync(path.join(dir, "../src/menu.ts"), "utf8");
const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } }).outputText;
const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "menu-")), "menu.mjs");
fs.writeFileSync(tmp, js);
const { MENU_TABS, unreadBadge } = await import(pathToFileURL(tmp).href);

const active = (p) => MENU_TABS.filter((t) => t.match(p)).map((t) => t.key);
assert.deepEqual(MENU_TABS.map((t) => t.key), ["chat", "cases", "templates", "forum", "profile"]);
assert.deepEqual(active("/"), ["chat"]);
assert.deepEqual(active("/chat/abc"), ["chat"]);
assert.deepEqual(active("/cases"), ["cases"]);
assert.deepEqual(active("/case/c_1"), ["cases"]);
assert.deepEqual(active("/templates"), ["templates"]);
assert.deepEqual(active("/template/t1"), ["templates"]);
assert.deepEqual(active("/forum/p1"), ["forum"]);
assert.deepEqual(active("/profile"), ["profile"]);
assert.deepEqual(active("/messages"), []);
assert.deepEqual(active("/paywall"), []);


assert.equal(unreadBadge(0), undefined);
assert.equal(unreadBadge(3), "3");
assert.equal(unreadBadge(12), "9+");

// Every menu* string exists in PL, EN and RO and none mentions unions, legal advice or Gemini.
const i18n = fs.readFileSync(path.join(dir, "../src/i18n.ts"), "utf8");
const keys = [...i18n.matchAll(/^\s+(menu\w+): \[(.*)\],$/gm)];
assert.ok(keys.length >= 20, "menu keys found");
for (const [, k, body] of keys) {
  const parts = JSON.parse(`[${body}]`);
  assert.equal(parts.length, 3, `${k} has PL/EN/RO`);
  parts.forEach((p) => assert.ok(p.trim().length > 0, `${k} not empty`));
  assert.ok(!/union|związk|sindicat|legal advice|porad[ay] prawn|gemini/i.test(body), `${k} wording`);
}
console.log(`menu: all checks passed (${keys.length} i18n keys)`);
