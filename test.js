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
  const { VirtualConsole } = require("jsdom");
  const vc = new VirtualConsole();
  vc.on("jsdomError", e => { if (!/Not implemented/.test(e.message)) ok(false, "page script error: " + e.message); });
  vc.on("error", e => ok(false, "console.error on page: " + e));
  const dom = new JSDOM(SRC, { runScripts: "dangerously", url: "http://localhost/", pretendToBeVisual: true, virtualConsole: vc });
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

// ---------- P1: AU GST quick toggle + labour spelling ----------
{
  const t = boot();
  t.preset("electrical");
  eq(t.$("cur").value, "AUD", "electrical preset defaults to AUD");
  eq(t.$("gst").value, "10", "electrical preset defaults to GST 10%");
  eq(t.$("auGst").getAttribute("aria-pressed"), "true", "AU toggle on for electrical");
  ok(t.d.querySelector("#labTable").closest(".card").querySelector("h2").textContent === "Labour", "Labour heading in AUD");
  ok(t.$("summary").textContent.includes("Labour"), "Labour in breakdown in AUD");
  t.preset("solar");
  eq(t.$("gst").value, "10", "solar preset defaults to GST 10%");
  t.preset("landscape");
  ok(t.$("summary").textContent.includes("Labor") && !t.$("summary").textContent.includes("Labour"), "Labor spelling in USD");
  eq(t.$("auGst").getAttribute("aria-pressed"), "false", "AU toggle off for USD landscape");
  t.$("auGst").click();
  eq(t.$("cur").value, "AUD", "AU toggle switches to AUD");
  eq(t.txt("sTotal"), "AUD $14,049.55", "AU toggle adds GST 10%");
  eq(t.txt("totalLabel"), "Final total inc. GST", "AU toggle inc GST label");
  t.$("auGst").click();
  eq(t.txt("totalLabel"), "Bid total", "AU toggle off removes GST");
  eq(t.txt("sTotal"), "AUD $12,772.32", "AU toggle off total");
}

// ---------- Recurring vs one-time (Kallang Pacific Telecom) ----------
{
  const t = boot();
  t.preset("landscape");
  ok(!t.shown("rcSummary"), "recurring summary hidden when section empty");
  eq(t.txt("sTotal"), "$12,772.32", "landscape total unaffected by recurring section");
  t.preset("telecom");
  ok(t.shown("rcSummary"), "recurring summary shown for telecom");
  eq(t.$("cur").value, "USD", "telecom USD"); eq(t.$("gst").value, "0", "telecom no GST");
  eq(t.$("rcTerm").value, "36", "telecom term 36");
  eq(t.txt("rcMrc"), "$22,750.00", "MRC");
  eq(t.txt("rcNrc"), "$35,000.00", "NRC (one-time never in monthly)");
  eq(t.txt("rcFy"), "$308,000.00", "first-year = MRC x 12 + NRC");
  eq(t.txt("rcTcv"), "$854,000.00", "TCV = MRC x 36 + NRC");
  ok(t.$("rcSummary").textContent.includes("Total contract value"), "TCV label");
  t.set("rcTerm", "6");
  eq(t.txt("rcFy"), "$171,500.00", "first-year uses min(12, term)");
  eq(t.txt("rcTcv"), "$171,500.00", "TCV at 6 months");
  t.set("rcTerm", "36");
  // edit a recurring qty
  const q = t.d.querySelector('#rcTable input[data-f="1"]'); t.set(q, "10");
  eq(t.txt("rcMrc"), "$5,950.00", "MRC updates on qty edit");
  t.$("addOt").click();
  eq(t.d.querySelectorAll("#otTable tbody tr").length, 3, "add one-time line");
  t.d.querySelector('#otTable [data-del="o"]').click();
  eq(t.txt("rcNrc"), "$2,500.00", "remove one-time line");
  eq(t.txt("rcMrc"), "$5,950.00", "MRC unchanged by one-time edits");
  t.preset("landscape");
  ok(!t.shown("rcSummary"), "switching template clears recurring section");
}

// ---------- P1: per-line markup override + change orders (Kwame) ----------
{
  const t = boot();
  t.preset("landscape");
  ok(!t.shown("coRow"), "no change-order row when none");
  const mo = t.d.querySelector('#matTable input[data-f="4"]');
  eq(mo.placeholder, "20", "override placeholder shows global markup");
  t.set(mo, "30");
  ok(t.txt("sMark").startsWith("$2,326.72"), `override raises markup on that line only (got ${t.txt("sMark")})`);
  ok(t.txt("sMark").includes("blended"), "markup shows blended % with overrides");
  eq(t.txt("sTotal"), "$12,970.32", "total with override");
  t.set(t.d.querySelector('#matTable input[data-f="4"]'), "");
  ok(t.txt("sMark").startsWith("$2,128.72 (20%)"), "clearing override restores global markup");
  eq(t.txt("sTotal"), "$12,772.32", "total restored");
  const lo = t.d.querySelector('#labTable input[data-f="3"]');
  t.set(lo, "10");
  ok(t.txt("sMark").startsWith("$1,957.12"), `labor override (got ${t.txt("sMark")})`);
  t.set(t.d.querySelector('#labTable input[data-f="3"]'), "");
  t.$("addCo").click();
  t.set(t.d.querySelector('#coTable input[data-f="1"]'), "1000");
  ok(t.shown("coRow"), "change-order row shown");
  eq(t.txt("sCO"), "$1,200.00", "change order priced at global markup");
  ok(t.txt("sMark").startsWith("$2,128.72"), "base markup unchanged by change order");
  ok(startsWithMoney(t.txt("sDirect"), "$9,676.00"), "direct unchanged by change order");
  eq(t.txt("sTotal"), "$13,972.32", "total includes change order");
  eq(t.txt("sProfit"), "$2,328.72", "profit includes change-order markup");
  t.set(t.d.querySelector('#coTable input[data-f="2"]'), "30");
  eq(t.txt("sCO"), "$1,300.00", "change order own markup");
  t.d.querySelector('#coTable [data-del="c"]').click();
  ok(!t.shown("coRow"), "change-order row hidden after removal");
  eq(t.txt("sTotal"), "$12,772.32", "total restored after removing change order");
}

// @@NEXT@@

console.log(`${failures ? "FAILED" : "PASSED"}: ${passes} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
