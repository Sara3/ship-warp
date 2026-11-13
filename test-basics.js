// Basics regression test: the checks every buyer re-runs, plus the AI review wiring.
// Run: node test-basics.js (after `npm i`).
const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");

const SRC = fs.readFileSync(path.join(__dirname, "index.html"), "utf8");
const AI_URL = "https://bidbench.pubandsubs.workers.dev/api/review";
let failures = 0, passes = 0;
const ok = (cond, msg) => { if (cond) { passes++; } else { failures++; console.error("FAIL: " + msg); } };
const eq = (a, b, msg) => ok(a === b, `${msg}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);

function boot(fetchImpl) {
  const dom = new JSDOM(SRC, {
    runScripts: "dangerously", url: "http://localhost/", pretendToBeVisual: true,
    beforeParse(window) { if (fetchImpl) window.fetch = fetchImpl; },
  });
  const w = dom.window, d = w.document, $ = (id) => d.getElementById(id);
  const fire = (el, type) => el.dispatchEvent(new w.Event(type, { bubbles: true }));
  const set = (el, v) => { const node = typeof el === "string" ? $(el) : el; node.value = v; fire(node, "input"); fire(node, "change"); };
  const txt = (id) => $(id).textContent.trim();
  return { d, $, set, txt, preset: (p) => d.querySelector(`[data-preset="${p}"]`).click() };
}

{ // contingency is editable and drives the total
  const t = boot();
  eq(t.$("lockCont").value, "0", "contingency starts unlocked");
  eq(t.$("cont").disabled, false, "contingency field is editable");
  t.set("cont", "5");
  ok(t.txt("sCont").startsWith("$483.80"), `5% contingency on $9,676 direct cost (got ${t.txt("sCont")})`);
  ok(t.txt("sMark").startsWith("$2,031.96"), `20% markup on cost + contingency (got ${t.txt("sMark")})`);
  eq(t.txt("sTotal"), "$12,191.76", "total with 5% contingency");
}

{ // blank start with typed lines
  const t = boot();
  t.preset("blank");
  eq(t.$("client").value, "", "Blank clears the client");
  const m = t.d.querySelectorAll("#matTable tbody input");
  t.set(m[0], "Lumber"); t.set(m[1], "10"); t.set(m[3], "4.25");
  const l = t.d.querySelectorAll("#labTable tbody input");
  t.set(l[0], "Carpenter"); t.set(l[1], "8"); t.set(l[2], "50");
  eq(t.txt("sDirect"), "$442.50", "direct cost = materials + labor");
  ok(t.txt("sCont").startsWith("$44.25"), `10% contingency (got ${t.txt("sCont")})`);
  ok(t.txt("sMark").startsWith("$97.35"), `20% markup on cost + contingency (got ${t.txt("sMark")})`);
  eq(t.txt("sTotal"), "$584.10", "bid total");
  eq(t.txt("sMargin"), "16.7%", "margin = profit / bid total");
}

{ // bad input is called out and not counted
  const t = boot();
  const m = t.d.querySelectorAll("#matTable tbody input");
  t.set(m[1], "-400");
  ok(/negative or invalid/.test(t.txt("inputWarn")), "negative quantity is called out");
  eq(t.txt("mt0"), "$0.00", "negative quantity counts as 0");
  t.set(m[1], "400");
  eq(t.txt("inputWarn"), "", "warning clears once fixed");
}

{ // the fit-out template keeps contingency locked
  const t = boot();
  t.preset("fitout");
  eq(t.$("lockCont").value, "1", "fit-out template locks contingency");
  eq(t.$("cont").disabled, true, "locked contingency can't be edited");
  t.set("lockCont", "0");
  eq(t.$("cont").disabled, false, "unlocking makes it editable again");
}

async function aiTests() {
  { // AI suggestions are shown and can be added as lines
    const calls = [];
    const t = boot(async (url, opts) => {
      calls.push({ url, body: JSON.parse(opts.body) });
      return { ok: true, status: 200, json: async () => ({ ok: true, data: { missing: ["Permit fees"] }, error: null }) };
    });
    await t.$("checkBtn").onclick();
    eq(calls.length, 1, "check calls the AI once");
    eq(calls[0] && calls[0].url, AI_URL, "AI worker URL");
    ok(calls[0] && calls[0].body.scope.includes("paver patio"), "scope notes are sent to the AI");
    ok(calls[0] && calls[0].body.lines.includes("Pavers"), "bid lines are sent to the AI");
    const aiFlag = [...t.d.querySelectorAll("#flags .flag")].find((f) => f.textContent.includes("Permit fees"));
    ok(!!aiFlag, "AI suggestion is shown");
    const before = t.d.querySelectorAll("#matTable tbody tr").length;
    if (aiFlag) aiFlag.querySelector("button").click();
    eq(t.d.querySelectorAll("#matTable tbody tr").length, before + 1, "Add line adds the AI suggestion as a material line");
  }
  { // AI down: keyword checks still show, with a visible note
    const t = boot(async () => { throw new TypeError("Failed to fetch"); });
    await t.$("checkBtn").onclick();
    ok(t.txt("flags").includes("AI review unavailable"), "AI failure is explained, not hidden");
    ok(t.d.querySelectorAll("#flags .flag").length > 0, "keyword checks still show when the AI is down");
  }
}

aiTests()
  .catch((err) => { failures++; console.error("FAIL: AI tests threw", err); })
  .finally(() => {
    console.log(`${failures ? "FAILED" : "PASSED"}: ${passes} passed, ${failures} failed`);
    process.exit(failures ? 1 : 0);
  });
