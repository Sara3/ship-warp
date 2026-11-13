// SpendWise regression test. Run: node spend-test.js (after `npm i`).
const fs = require("fs");
const path = require("path");
const { JSDOM, VirtualConsole } = require("jsdom");
const SRC = fs.readFileSync(path.join(__dirname, "spendwise", "index.html"), "utf8");
let failures = 0, passes = 0;
const ok = (c, m) => { if (c) passes++; else { failures++; console.error("FAIL: " + m); } };
const eq = (a, b, m) => ok(a === b, `${m}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);

function boot(seed) {
  const vc = new VirtualConsole();
  vc.on("jsdomError", e => { if (!/Not implemented/.test(e.message)) ok(false, "page script error: " + e.message); });
  const dom = new JSDOM(SRC, { runScripts: "dangerously", url: "http://localhost/spendwise/", pretendToBeVisual: true, virtualConsole: vc,
    beforeParse(w) { if (seed !== undefined) w.localStorage.setItem("spendwise.v1", seed); } });
  const w = dom.window, d = w.document, $ = id => d.getElementById(id);
  const set = (el, v) => { const n = typeof el === "string" ? $(el) : el; n.value = v; n.dispatchEvent(new w.Event("input", { bubbles: true })); };
  const txt = id => $(id).textContent.trim();
  const add = (desc, cat, amt, date = "") => { set("eDesc", desc); set("eCat", cat); set("eAmt", String(amt)); set("eDate", date); $("addBtn").click(); };
  const row = cat => [...d.querySelectorAll("#budTable tbody tr")].find(r => r.dataset.cat === cat);
  const cell = (cat, k) => row(cat).querySelector(`[data-cell="${k}"]`).textContent.trim();
  const budget = (cat, v) => set(row(cat).querySelector("[data-bud]"), String(v));
  return { w, d, $, set, txt, add, row, cell, budget };
}
const EMPTY = JSON.stringify({ expenses: [], budgets: {} });

// static guards
{
  const script = SRC.split("<script>").slice(1).join("");
  ok(!/\b(alert|confirm|prompt)\s*\(/.test(script), "no alert/confirm/prompt");
  ok(!/https?:\/\//.test(script) && !/\bfetch\s*\(|XMLHttpRequest/.test(script), "no network calls");
  ok(!/<script[^>]+src=|<link[^>]+href=["']https?:/i.test(SRC), "no external libs");
  script.split("\n").filter(l => /localStorage\./.test(l)).forEach(l => ok(/try\s*{/.test(l), "localStorage in try: " + l.trim().slice(0, 50)));
}
// branding + first visit
{
  const t = boot();
  ok(t.d.querySelector("header").textContent.includes("Ship Warp Sorcery"), "team name in header");
  ok(/SpendWise · built by team Ship Warp Sorcery/.test(t.d.querySelector("footer").textContent), "footer text");
  ok(t.d.querySelectorAll("#expTable tbody tr").length >= 8, "first visit shows sample data");
}
// add expense with a new category, totals, validation
{
  const t = boot(EMPTY);
  eq(t.txt("gTotal"), "$0.00", "starts at $0.00");
  t.add("", "", "");
  ok(/description/.test(t.txt("eErr")) && /category/.test(t.txt("eErr")) && /more than \$0/.test(t.txt("eErr")), "inline errors");
  t.add("Coffee", "Meals", "0");
  ok(/more than \$0/.test(t.txt("eErr")), "amount 0 rejected"); eq(t.d.querySelectorAll("#expTable tbody tr").length, 0, "nothing added on error");
  t.add("Coffee", "Meals", "-5"); ok(/more than \$0/.test(t.txt("eErr")), "negative rejected");
  t.add("Figma", "Software", "45.5", "2026-11-03");
  eq(t.txt("eErr"), "", "error clears");
  ok(!!t.row("Software"), "new category created automatically");
  t.add("Slack", "software", "54.5"); // case-insensitive same bucket
  eq(t.d.querySelectorAll("#budTable tbody tr").length, 1, "same category regardless of case");
  t.add("Flight", "Travel", 300.25);
  eq(t.cell("Software", "spent"), "$100.00", "category total");
  eq(t.cell("Travel", "spent"), "$300.25", "second category total");
  eq(t.txt("gTotal"), "$400.25", "grand total"); eq(t.txt("ftSpent"), "$400.25", "table grand total");
  ok([...t.d.querySelectorAll("#catList option")].map(o => o.value).includes("Software"), "datalist offers existing categories");
}
// budgets: remaining, near limit, over budget banner appears/disappears
{
  const t = boot(EMPTY);
  t.add("Paper", "Office supplies", 75);
  eq(t.cell("Office supplies", "status"), "No budget set", "no budget yet");
  t.budget("Office supplies", "100");
  eq(t.cell("Office supplies", "left"), "$25.00 left", "remaining");
  eq(t.cell("Office supplies", "status"), "On track", "on track below 80%");
  t.add("Pens", "Office supplies", 10);
  ok(/Near limit/.test(t.cell("Office supplies", "status")), "near limit at 80%");
  eq(t.$("overBanner").style.display, "none", "no banner when not over");
  t.add("Toner", "Office supplies", 30.5);
  eq(t.cell("Office supplies", "status"), "OVER BUDGET by $15.50", "over budget warning");
  eq(t.cell("Office supplies", "left"), "over by $15.50", "remaining shows over");
  ok(t.$("overBanner").style.display !== "none" && t.txt("overBanner").includes("Office supplies (by $15.50)"), "top banner lists over-budget category");
  t.budget("Office supplies", "200");
  eq(t.$("overBanner").style.display, "none", "banner disappears when budget raised");
  eq(t.cell("Office supplies", "status"), "On track", "status back to on track");
  // budget before spending
  t.set("bCat", "Marketing"); t.set("bAmt", "500"); t.$("bAdd").click();
  ok(!!t.row("Marketing") && t.cell("Marketing", "left") === "$500.00 left", "budget set before spending");
  eq(t.txt("gBudget"), "$700.00", "total budget");
  // delete + undo
  const n = t.d.querySelectorAll("#expTable tbody tr").length;
  t.d.querySelector("#expTable [data-del]").click();
  eq(t.d.querySelectorAll("#expTable tbody tr").length, n - 1, "delete expense");
  t.$("undoBtn").click();
  eq(t.d.querySelectorAll("#expTable tbody tr").length, n, "undo restores");
  eq(t.txt("gTotal"), "$115.50", "total after undo");
  // escaping
  t.add("<img src=x onerror=alert(1)>", "<b>Hack</b>", 1);
  ok(!t.d.querySelector("#expTable img") && !t.d.querySelector("#budTable b img"), "user text escaped");
  // persistence
  const t2 = boot(t.w.localStorage.getItem("spendwise.v1"));
  eq(t2.txt("gTotal"), "$116.50", "remembered in this browser");
  const t3 = boot("{bad json");
  ok(t3.d.querySelectorAll("#expTable tbody tr").length >= 8, "corrupt storage falls back to sample");
}
// sample data + clear + suggestion
{
  const t = boot(EMPTY);
  t.$("sampleBtn").click();
  const rows = t.d.querySelectorAll("#expTable tbody tr").length;
  ok(rows >= 8 && rows <= 12, "8-12 sample expenses");
  ok(t.d.querySelectorAll("#budTable tbody tr").length >= 4, "4-5 categories");
  eq(t.txt("gTotal"), "$2,669.39", "sample grand total");
  // Hollow Oak: per-category warn threshold
  eq(t.cell("Ads", "status"), "Near limit: 78% of budget used (warns at 75%)", "Ads warns at 75% in sample");
  eq(t.row("Ads").querySelector("[data-warn]").value, "75", "Ads warn input shows 75");
  eq(t.row("Travel").querySelector("[data-warn]").value, "80", "default warn 80%");
  eq(t.cell("Travel", "status"), "Near limit: 87% of budget used (warns at 80%)", "Travel 87% over default 80%");
  eq(t.cell("Office supplies", "status"), "Near limit: 90% of budget used (warns at 80%)", "default 80% near-limit text");
  t.set(t.row("Ads").querySelector("[data-warn]"), "80");
  eq(t.cell("Ads", "status"), "On track", "raising warn to 80% clears the warning");
  t.set(t.row("Travel").querySelector("[data-warn]"), "85");
  eq(t.cell("Travel", "status"), "Near limit: 87% of budget used (warns at 85%)", "lowering warn triggers near limit");
  t.set(t.row("Travel").querySelector("[data-warn]"), "40");
  ok(t.row("Travel").querySelector("[data-warn]").classList.contains("bad"), "out-of-range warn flagged");
  eq(t.cell("Travel", "status"), "Near limit: 87% of budget used (warns at 50%)", "warn clamped to 50-100");
  t.set(t.row("Travel").querySelector("[data-warn]"), "90");
  const t4 = boot(t.w.localStorage.getItem("spendwise.v1"));
  eq(t4.row("Ads").querySelector("[data-warn]").value, "80", "warn threshold remembered");
  eq(t.cell("Software", "status"), "OVER BUDGET by $38.50", "one category over budget in sample");
  ok(/Near limit/.test(t.cell("Office supplies", "status")), "near-limit category in sample");
  t.$("clearBtn").click();
  eq(t.txt("gTotal"), "$0.00", "clear all");
  t.$("undoBtn").click(); eq(t.txt("gTotal"), "$2,669.39", "undo clear");
  t.set("eDesc", "Uber to airport");
  ok(/suggested:/.test(t.txt("eSuggest")) && t.txt("eSuggest").includes("Travel"), "local keyword suggestion labelled suggested");
  t.$("useSug").click(); eq(t.$("eCat").value, "Travel", "use suggestion fills category");
}
// Ocotillo: property tag + subtotals
{
  const t = boot(EMPTY);
  t.set("eProp", "Desert Palms"); t.add("Plumbing repair", "Plumbing", 400);
  t.set("eProp", "Desert Palms"); t.add("AC fix", "HVAC", 250);
  t.set("eProp", "Saguaro Point"); t.add("Unit turn paint", "Turns", 300);
  eq(t.d.querySelector('#propTable tr[data-prop="Desert Palms"] [data-cell="pspent"]').textContent, "$650.00", "property subtotal");
  eq(t.d.querySelector('#propTable tr[data-prop="Saguaro Point"] [data-cell="pspent"]').textContent, "$300.00", "second property subtotal");
  ok(t.txt("expTable").includes("Desert Palms"), "property shown on expense row");
  const t2 = boot(t.w.localStorage.getItem("spendwise.v1"));
  ok(!!t2.d.querySelector('#propTable tr[data-prop="Desert Palms"]'), "property remembered");
}
console.log(`${failures ? "FAILED" : "PASSED"}: ${passes} passed, ${failures} failed (spend)`);
process.exit(failures ? 1 : 0);
