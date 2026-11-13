// BidBench regression test. Run: node test.js  (needs jsdom: `npm i` once)
// Loads index.html in jsdom, drives the inputs like a reviewer would, asserts the numbers.
const fs = require("fs");
const path = require("path");
let JSDOM;
try { ({ JSDOM } = require("jsdom")); }
catch (e) { console.error("jsdom not found. Run `npm i` in this folder first."); process.exit(2); }

const SRC = fs.readFileSync(path.join(__dirname, "index.html"), "utf8");
let failures = 0, passes = 0;
function ok(cond, msg) { if (cond) { passes++; } else { failures++; console.error("FAIL: " + msg); } }
function eq(a, b, msg) { ok(a === b, `${msg}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); }

function boot() {
  const dom = new JSDOM(SRC, { runScripts: "dangerously", url: "http://localhost/", pretendToBeVisual: true });
  const w = dom.window, d = w.document;
  const $ = id => d.getElementById(id);
  const set = (id, v) => { const el = typeof id === "string" ? $(id) : id; el.value = v;
    el.dispatchEvent(new w.Event("input", { bubbles: true })); el.dispatchEvent(new w.Event("change", { bubbles: true })); };
  const txt = id => $(id).textContent.trim();
  const shown = id => { let el = $(id); while (el && el !== d.body) { if (w.getComputedStyle(el).display === "none") return false; el = el.parentElement; } return true; };
  const preset = p => d.querySelector(`[data-preset="${p}"]`).click();
  return { dom, w, d, $, set, txt, shown, preset };
}
const startsWithMoney = (s, m) => s === m || s.startsWith(m + " ");

// ---------- static guards ----------
{
  const script = SRC.split("<script>").slice(1).join("");
  ok(!/\b(alert|confirm|prompt)\s*\(/.test(script), "no alert/confirm/prompt calls");
  ok(!/\bfetch\s*\(|XMLHttpRequest|<script[^>]+src=|<link[^>]+href=["']https?:/i.test(SRC), "no external network calls");
  const ls = (script.match(/localStorage/g) || []).length;
  if (ls) ok(/try\s*{[^]*localStorage/.test(script), "localStorage wrapped in try/catch");
}

// ---------- required ids, labels, branding ----------
{
  const t = boot();
  const ids = "job client desc markup cont floor lockCont cur gst matTable labTable addMat addLab aName aLen aWid aPrice aAdd checkBtn flags summary sMat sLab sDirect sCont sMark sEx sGst sTotal sProfit sMargin marginWarn copyBtn".split(" ");
  ids.forEach(id => ok(!!t.$(id), `element #${id} exists`));
  const body = t.d.body.textContent;
  ["Total ex GST", "Final total inc. GST", "Minimum margin floor %", "Bid total", "Margin", "Profit"].forEach(l => ok(SRC.includes(l), `label "${l}" present`));
  ok(t.d.querySelector("header").textContent.includes("Ship Warp Sorcery"), "team name in header");
  ok(t.d.querySelector("footer").textContent.includes("Ship Warp Sorcery"), "team name in footer");
  eq(t.$("floor").value, "15", "default margin floor");
  ok(body.length > 0, "page renders");
}

// ---------- landscape preset math ----------
{
  const t = boot();
  t.preset("landscape");
  ok(startsWithMoney(t.txt("sMat"), "$3,796.00"), `materials $3,796.00 (got ${t.txt("sMat")})`);
  ok(startsWithMoney(t.txt("sLab"), "$5,880.00"), `labor $5,880.00 (got ${t.txt("sLab")})`);
  ok(startsWithMoney(t.txt("sDirect"), "$9,676.00"), `direct $9,676.00 (got ${t.txt("sDirect")})`);
  ok(t.txt("sCont").startsWith("$967.60"), `contingency $967.60 (got ${t.txt("sCont")})`);
  ok(t.txt("sMark").startsWith("$2,128.72"), `markup $2,128.72 (got ${t.txt("sMark")})`);
  eq(t.txt("sTotal"), "$12,772.32", "bid total");
  eq(t.txt("sProfit"), "$2,128.72", "profit");
  eq(t.txt("sMargin"), "16.7%", "margin");
  eq(t.txt("totalLabel"), "Bid total", "total label without tax");
  ok(!t.shown("sGst"), "GST row hidden when no tax");
  eq(t.txt("marginWarn"), "", "no margin warning when healthy");
  const b = t.w.__bid;
  ok(Math.abs(b.total - 12772.32) < 0.005, "__bid.total");

  // ---------- GST 10% ----------
  t.set("gst", "10");
  ok(t.shown("sEx") && t.shown("sGst"), "ex GST and GST rows shown at 10%");
  ok(t.$("summary").textContent.includes("Total ex GST"), "Total ex GST label");
  eq(t.txt("sEx"), "$12,772.32", "total ex GST");
  eq(t.txt("gstLabel"), "GST 10%", "GST label");
  eq(t.txt("sGst"), "$1,277.23", "GST amount");
  eq(t.txt("totalLabel"), "Final total inc. GST", "inc GST label");
  eq(t.txt("sTotal"), "$14,049.55", "total inc GST");
  eq(t.txt("sMargin"), "16.7%", "margin unchanged by GST");
  t.set("gst", "0");
  eq(t.txt("sTotal"), "$12,772.32", "total back without GST");
  ok(!t.shown("sGst"), "GST row hidden again");

  // ---------- margin floor ----------
  t.set("markup", "10");
  const warn = t.txt("marginWarn");
  ok(/do not send/i.test(warn), `below-floor warning says do not send (got "${warn}")`);
  ok(/15%/.test(warn), "warning names the 15% floor");
  ok(/17\.6%/.test(warn), "warning gives markup needed (17.6%)");
  ok(t.$("summary").style.outline.includes("solid"), "summary outlined red when below floor");
  t.set("markup", "20");
  eq(t.txt("marginWarn"), "", "warning disappears when healthy");
  ok(!t.$("summary").style.outline.includes("solid"), "red outline removed when healthy");

  // ---------- sq-ft line ----------
  const rowsBefore = t.$("matTable").querySelectorAll("tbody tr").length;
  t.set("aLen", "20"); t.set("aWid", "20"); t.set("aPrice", "12");
  t.$("aAdd").click();
  const rows = t.$("matTable").querySelectorAll("tbody tr");
  eq(rows.length, rowsBefore + 1, "sq-ft line adds one material row");
  const last = rows[rows.length - 1];
  ok(last.textContent.includes("$4,800.00"), `sq-ft row total $4,800.00 (got ${last.textContent.replace(/\s+/g, " ")})`);
  ok(startsWithMoney(t.txt("sMat"), "$8,596.00"), `materials include sq-ft line (got ${t.txt("sMat")})`);
}

// @@NEXT@@

console.log(`${failures ? "FAILED" : "PASSED"}: ${passes} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
