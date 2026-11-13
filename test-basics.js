// Basics regression test: the checks every buyer re-runs. Run: node test-basics.js (after `npm i`).
const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");

const SRC = fs.readFileSync(path.join(__dirname, "index.html"), "utf8");
let failures = 0, passes = 0;
const ok = (cond, msg) => { if (cond) { passes++; } else { failures++; console.error("FAIL: " + msg); } };
const eq = (a, b, msg) => ok(a === b, `${msg}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);

function boot() {
  const dom = new JSDOM(SRC, { runScripts: "dangerously", url: "http://localhost/", pretendToBeVisual: true });
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

console.log(`${failures ? "FAILED" : "PASSED"}: ${passes} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
