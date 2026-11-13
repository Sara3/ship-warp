// ChurnRadar regression test. Run: node churn-test.js (after `npm i`).
const fs = require("fs");
const path = require("path");
const { JSDOM, VirtualConsole } = require("jsdom");

const SRC = fs.readFileSync(path.join(__dirname, "churnradar", "index.html"), "utf8");
const AI_URL = "https://bidbench.pubandsubs.workers.dev/api/churn";
let failures = 0, passes = 0;
const ok = (c, m) => { if (c) passes++; else { failures++; console.error("FAIL: " + m); } };
const eq = (a, b, m) => ok(a === b, `${m}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
const tick = (ms = 0) => new Promise(r => setTimeout(r, ms));

function boot({ fetch, seed } = {}) {
  const vc = new VirtualConsole();
  vc.on("jsdomError", e => { if (!/Not implemented/.test(e.message)) ok(false, "page script error: " + e.message); });
  const dom = new JSDOM(SRC, { runScripts: "dangerously", url: "http://localhost/churnradar/", pretendToBeVisual: true, virtualConsole: vc,
    beforeParse(w) { if (fetch) w.fetch = fetch; if (seed !== undefined) w.localStorage.setItem("churnradar.accounts.v1", seed); } });
  const w = dom.window, d = w.document, $ = id => d.getElementById(id);
  const set = (el, v) => { const n = typeof el === "string" ? $(el) : el; n.value = v; n.dispatchEvent(new w.Event("input", { bubbles: true })); n.dispatchEvent(new w.Event("change", { bubbles: true })); };
  const txt = id => $(id).textContent.trim();
  const rows = () => [...d.querySelectorAll("#accTable tbody tr")];
  const row = name => rows().find(r => r.querySelector('[data-k="name"]').value === name);
  const add = (name, logins, tickets, days, bill = "", notes = "") => {
    set("aName", name); set("aLogins", String(logins)); set("aTickets", String(tickets)); set("aDays", String(days)); set("aBill", String(bill)); set("aNotes", notes); $("addBtn").click(); };
  const health = name => row(name).querySelector('[data-cell="health"]').textContent.trim();
  const bd = name => row(name).querySelector('[data-cell="bd"]').textContent.trim();
  return { w, d, $, set, txt, rows, row, add, health, bd };
}

// ---------- static guards ----------
{
  const script = SRC.split("<script>").slice(1).join("");
  ok(!/\b(alert|confirm|prompt)\s*\(/.test(script), "no alert/confirm/prompt");
  const urls = [...SRC.matchAll(/https?:\/\/[^\s"'`)<]+/g)].map(m => m[0]);
  ok(urls.every(u => u === AI_URL), `only network URL is the AI endpoint (found ${urls.join(", ")})`);
  ok(!/<script[^>]+src=|<link[^>]+href=["']https?:/i.test(SRC), "no external scripts or styles");
  script.split("\n").filter(l => /localStorage\./.test(l)).forEach(l => ok(/try\s*{/.test(l), "localStorage in try: " + l.trim().slice(0, 60)));
  ok(/0-4/.test(SRC) && /5-14/.test(SRC) && /15 or more/.test(SRC) && /0-1 points = Green, 2-3 = Amber, 4-6 = Red/.test(SRC), "rule written out on the page");
}

// ---------- branding + first visit ----------
{
  const t = boot();
  ok(t.d.querySelector("header").textContent.includes("Ship Warp Sorcery"), "team name in header");
  ok(/ChurnRadar · built by team Ship Warp Sorcery/.test(t.d.querySelector("footer").textContent), "footer text");
  ok(t.rows().length >= 8 && t.rows().length <= 10, "first visit shows sample accounts");
}

// ---------- rule thresholds at every boundary ----------
{
  const t = boot({ seed: "[]" });
  eq(t.rows().length, 0, "empty when storage says empty");
  ok(t.$("emptyMsg").style.display !== "none", "empty message shown");
  // logins boundaries (tickets 0, days 365 -> only login points)
  [[4, 2], [5, 1], [14, 1], [15, 0]].forEach(([n, p]) => { t.add("L" + n, n, 0, 365); ok(t.bd("L" + n).startsWith(`logins ${p} + tickets 0 + renewal 0 = ${p}`), `logins ${n} -> ${p} pts (got ${t.bd("L" + n)})`); });
  // tickets boundaries (logins 50, days 365)
  [[1, 0], [2, 1], [4, 1], [5, 2]].forEach(([n, p]) => { t.add("T" + n, 50, n, 365); ok(t.bd("T" + n).startsWith(`logins 0 + tickets ${p} + renewal 0 = ${p}`), `tickets ${n} -> ${p} pts (got ${t.bd("T" + n)})`); });
  // renewal boundaries (logins 50, tickets 0)
  [[30, 2], [31, 1], [90, 1], [91, 0]].forEach(([n, p]) => { t.add("D" + n, 50, 0, n); ok(t.bd("D" + n).startsWith(`logins 0 + tickets 0 + renewal ${p} = ${p}`), `days ${n} -> ${p} pts (got ${t.bd("D" + n)})`); });
  // R/A/G bands at totals 1/2/3/4
  eq(t.health("L15"), "Green", "0 pts Green"); eq(t.health("L5"), "Green", "1 pt Green");
  eq(t.health("L4"), "Amber", "2 pts Amber");
  t.add("P3", 5, 2, 31); eq(t.health("P3"), "Amber", "3 pts Amber");
  t.add("P4", 4, 2, 31); eq(t.health("P4"), "Red", "4 pts Red");
  t.add("P6", 0, 9, 0); eq(t.health("P6"), "Red", "6 pts Red");
  ok(/= 6 → Red/.test(t.bd("P6")), "breakdown shows total and band");
  // counts: Green = L15,L5,L14,T1,T2,T4,D31,D90,D91 ; Amber = L4,T5,D30,P3 ; Red = P4,P6
  eq(t.txt("cGreen"), "9", "green count"); eq(t.txt("cAmber"), "4", "amber count"); eq(t.txt("cRed"), "2", "red count"); eq(t.txt("cTotal"), "15", "total count");
  t.add("", 1, 1, 1); ok(/name first/.test(t.txt("addMsg")), "add needs a name"); eq(t.txt("cTotal"), "15", "nameless account not added");
}

// ---------- sample load, at-risk ordering, reasons ----------
{
  const t = boot({ seed: "[]" });
  t.$("sampleBtn").click();
  eq(t.rows().length, 10, "sample loads 10 accounts");
  eq(t.txt("cRed"), "3", "sample red"); eq(t.txt("cAmber"), "4", "sample amber"); eq(t.txt("cGreen"), "3", "sample green");
  const order = [...t.d.querySelectorAll("#atRisk [data-risk] strong:first-child")].map(e => e.textContent.replace(/^\d+\.\s*/, ""));
  eq(JSON.stringify(order), JSON.stringify(["Northwind Dental Group", "Meridian Freight", "Orchard Lane Schools", "Kestrel Analytics", "Bluegate Logistics", "Copperleaf Clinics", "Sable Peak Outfitters"]), "at-risk worst first: points desc, renewal asc, name");
  const first = t.d.querySelector("#atRisk [data-risk]").textContent;
  ok(first.includes("only 3 logins in 30 days, 6 open tickets, renews in 21 days"), `reason in words (got ${first})`);
  ok(!/Harbor|Tallow|Fjordline/.test(t.txt("atRisk")), "green accounts not in at-risk list");
  // tie-break by name when points and days match
  t.add("Zed Co", 0, 9, 21); t.add("Abe Co", 0, 9, 21);
  const o2 = [...t.d.querySelectorAll("#atRisk [data-risk] strong:first-child")].map(e => e.textContent.replace(/^\d+\.\s*/, "")).slice(0, 3);
  eq(JSON.stringify(o2), JSON.stringify(["Abe Co", "Northwind Dental Group", "Zed Co"]), "ties (6 pts, 21 days) sorted by name");
  // editing moves an account live
  t.set(t.row("Harbor & Pine Realty").querySelector('[data-k="logins"]'), "2");
  eq(t.health("Harbor & Pine Realty"), "Amber", "edit updates health live");
  ok(t.txt("atRisk").includes("Harbor & Pine Realty"), "edited account joins at-risk list");
  // delete + undo
  t.row("Abe Co").querySelector("[data-del]").click();
  ok(!t.row("Abe Co"), "delete row"); t.$("undoBtn").click(); ok(!!t.row("Abe Co"), "undo delete");
  // persistence
  const t2 = boot({ seed: t.w.localStorage.getItem("churnradar.accounts.v1") });
  eq(t2.rows().length, 12, "accounts remembered in this browser");
  const t3 = boot({ seed: "{broken" });
  ok(t3.rows().length >= 8, "corrupt storage falls back to samples without breaking");
}

// ---------- monthly revenue at risk (Serra Azul) ----------
{
  const t = boot({ seed: "[]" });
  t.$("sampleBtn").click();
  eq(t.txt("rRisk"), "$16,900", "revenue at risk = red bills");
  eq(t.txt("rAmber"), "$9,250", "amber revenue");
  eq(t.txt("rTotal"), "$29,130", "total monthly revenue");
  ok(t.txt("atRisk").includes("$4,800 / month"), "at-risk list shows monthly bill");
  // Kestrel Analytics (Amber, $2,750) -> Red by adding tickets
  eq(t.health("Kestrel Analytics"), "Amber", "Kestrel starts Amber");
  t.set(t.row("Kestrel Analytics").querySelector('[data-k="tickets"]'), "6");
  eq(t.health("Kestrel Analytics"), "Red", "Kestrel now Red");
  eq(t.txt("rRisk"), "$19,650", "Amber->Red adds its bill to revenue at risk");
  eq(t.txt("rAmber"), "$6,500", "and leaves amber");
  // bill edit on a red account
  t.set(t.row("Kestrel Analytics").querySelector('[data-k="bill"]'), "3000");
  eq(t.txt("rRisk"), "$19,900", "bill edit updates live");
  // deleting a red account reduces it
  t.row("Meridian Freight").querySelector("[data-del]").click();
  eq(t.txt("rRisk"), "$13,000", "deleting a red account reduces revenue at risk");
  eq(t.txt("rTotal"), "$22,480", "total drops too");
  // adding a red account
  t.add("Bigco", 1, 6, 10, 1000);
  eq(t.txt("rRisk"), "$14,000", "adding a red account adds its bill");
}

// ---------- CSV import ----------
{
  const t = boot({ seed: "[]" });
  t.set("csvIn", "name,logins,tickets,days,bill\nAcme Corp,3,6,21,4500\n\"Globex, Inc\",20,0,180,1200\nInitech,abc,1,40\nBroken line\nUmbrella,9,2,60");
  t.$("importBtn").click();
  eq(t.rows().length, 3, "CSV imports valid rows, header skipped");
  ok(/Imported 3 accounts/.test(t.txt("csvMsg")) && /Skipped/.test(t.txt("csvMsg")) && /logins not a number/.test(t.txt("csvMsg")), `CSV message (got ${t.txt("csvMsg")})`);
  ok(!!t.row("Globex, Inc"), "quoted name with comma");
  eq(t.health("Acme Corp"), "Red", "imported row scored");
  eq(t.txt("rRisk"), "$4,500", "imported bill counted");
  t.set("csvIn", "Solo,30,0,200"); t.$("importBtn").click();
  eq(t.rows().length, 4, "CSV without header or bill");
  t.set("csvIn", "<img src=x onerror=alert(1)>,1,1,1"); t.$("importBtn").click();
  ok(!t.d.querySelector("#atRisk img") && !t.d.querySelector("#accTable img"), "user text escaped");
}

// ---------- AI read: success, failure fallback, score unchanged ----------
(async () => {
  const good = async (url, opts) => { ok(url === AI_URL && opts.method === "POST" && JSON.parse(opts.body).text, "POSTs {text} to AI_URL");
    return { ok: true, status: 200, json: async () => ({ ok: true, data: { signal: "positive", reason: "sounds happy" } }) }; };
  const t = boot({ seed: "[]", fetch: good });
  t.$("sampleBtn").click();
  const before = t.bd("Northwind Dental Group");
  t.row("Northwind Dental Group").querySelector("[data-ai]").click();
  await tick(10);
  ok(/AI: positive/.test(t.row("Northwind Dental Group").querySelector('[data-cell="ai"]').textContent), "AI signal shown");
  eq(t.bd("Northwind Dental Group"), before, "AI signal does not change score");
  eq(t.health("Northwind Dental Group"), "Red", "still Red after positive AI read");

  for (const [label, f] of [["404", async () => ({ ok: false, status: 404, json: async () => ({}) })], ["reject", async () => { throw new Error("net"); }], ["bad shape", async () => ({ ok: true, json: async () => ({ ok: true, data: { signal: "maybe" } }) })], ["no fetch", null]]) {
    const u = boot({ seed: "[]", fetch: f || undefined });
    if (!f) u.w.fetch = undefined;
    u.$("sampleBtn").click();
    u.row("Northwind Dental Group").querySelector("[data-ai]").click();
    await tick(10);
    const cell = u.row("Northwind Dental Group").querySelector('[data-cell="ai"]').textContent;
    ok(/AI unavailable/.test(cell) && /keyword read: churn risk/.test(cell), `${label}: fallback keyword read (got ${cell})`);
    eq(u.health("Northwind Dental Group"), "Red", `${label}: score unchanged`);
    eq(u.txt("cRed"), "3", `${label}: page still works`);
  }

  console.log(`${failures ? "FAILED" : "PASSED"}: ${passes} passed, ${failures} failed (churn)`);
  process.exit(failures ? 1 : 0);
})();
