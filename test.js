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

function boot(seed) {
  const { VirtualConsole } = require("jsdom");
  const vc = new VirtualConsole();
  vc.on("jsdomError", e => { if (!/Not implemented/.test(e.message)) ok(false, "page script error: " + e.message); });
  vc.on("error", e => ok(false, "console.error on page: " + e));
  const dom = new JSDOM(SRC, { runScripts: "dangerously", url: "http://localhost/", pretendToBeVisual: true, virtualConsole: vc,
    beforeParse: w => { if (seed) Object.entries(seed).forEach(([k, v]) => w.localStorage.setItem(k, v)); } });
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
  script.split("\n").filter(l => l.includes("localStorage")).forEach(l => ok(/try\s*{/.test(l), "localStorage access wrapped in try: " + l.trim().slice(0, 60)));
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

// ---------- P1: save / load / duplicate (Plumbline) ----------
{
  const t = boot();
  const n = () => JSON.parse(t.w.localStorage.getItem("bidbench.bids.v1") || "[]");
  t.preset("landscape");
  t.$("saveBtn").click();
  eq(n().length, 1, "save creates one bid");
  ok(/Saved/.test(t.txt("saveMsg")), "save message");
  t.set("markup", "25"); t.$("saveBtn").click();
  eq(n().length, 1, "second save updates, not duplicates");
  t.set("markup", "20"); t.$("saveBtn").click();
  t.preset("electrical");
  ok(t.txt("sTotal").startsWith("AUD"), "switched to another template");
  t.$("loadBtn").click();
  eq(t.txt("sTotal"), "$12,772.32", "load restores saved bid total");
  eq(t.$("job").value, "Backyard paver patio + retaining wall", "load restores job name");
  t.$("dupBtn").click();
  eq(n().length, 2, "duplicate adds a copy");
  ok(t.$("job").value.endsWith("(copy)"), "duplicate renamed (copy)");
  eq(t.txt("sTotal"), "$12,772.32", "duplicate keeps lines");
  t.$("delBtn").click();
  eq(n().length, 1, "delete removes selected bid");
  t.$("undoDel").click();
  eq(n().length, 2, "undo restores deleted bid");
  // persisted bids survive a reload (pre-seeded storage), and bad JSON never breaks the page
  const t2 = boot({ "bidbench.bids.v1": t.w.localStorage.getItem("bidbench.bids.v1") });
  eq(t2.d.querySelectorAll("#savedSel option").length, 2, "saved bids listed after reload");
  eq(t2.txt("sTotal"), "$12,772.32", "page still opens on landscape default");
  const t3 = boot({ "bidbench.bids.v1": "{not json" });
  eq(t3.txt("sTotal"), "$12,772.32", "corrupt storage does not break page");
  t3.$("loadBtn").click();
  ok(/Nothing to load/.test(t3.txt("saveMsg")), "load with nothing saved shows hint");
}

// ---------- Frio Regio: crew-days, MXN + IVA 16%, HVAC MX template, crane/startup rules ----------
{
  const t = boot();
  t.preset("landscape");
  t.set("gst", "10");
  eq(t.txt("exLabel"), "Total ex GST", "GST ex label unchanged");
  eq(t.txt("gstLabel"), "GST 10%", "GST label unchanged");
  t.set("gst", "0");
  // crew-days builder
  const before = t.d.querySelectorAll("#labTable tbody tr").length;
  t.set("cdName", "Rooftop equipment install"); t.set("cdPeople", "6"); t.set("cdDays", "5"); t.set("cdHours", "9"); t.set("cdRate", "180");
  ok(t.txt("cdOut").includes("270 h"), "crew-days preview shows hours");
  t.$("cdAdd").click();
  const rows = t.d.querySelectorAll("#labTable tbody tr");
  eq(rows.length, before + 1, "crew-days adds a labor line");
  const last = rows[rows.length - 1];
  eq(last.querySelector('input[data-f="0"]').value, "Rooftop equipment install (6 people x 5 days x 9 h)", "crew-days line name");
  eq(last.querySelector('input[data-f="1"]').value, "270", "crew-days hours = N*D*H");
  ok(startsWithMoney(t.txt("sLab"), "$54,480.00"), `labor includes crew-days line (got ${t.txt("sLab")})`);
  // HVAC MX template
  t.preset("hvacmx");
  eq(t.$("cur").value, "MXN", "MXN currency"); eq(t.$("gst").value, "16", "IVA 16%");
  ok(startsWithMoney(t.txt("sMat"), "MXN $1,981,000.00"), `HVAC materials (got ${t.txt("sMat")})`);
  ok(startsWithMoney(t.txt("sLab"), "MXN $172,800.00"), `HVAC labor (got ${t.txt("sLab")})`);
  eq(t.txt("exLabel"), "Total sin IVA", "IVA ex label");
  eq(t.txt("sEx"), "MXN $2,791,324.80", "subtotal sin IVA");
  eq(t.txt("gstLabel"), "IVA 16%", "IVA label");
  eq(t.txt("sGst"), "MXN $446,611.97", "IVA amount");
  eq(t.txt("totalLabel"), "Total con IVA", "Total con IVA label");
  eq(t.txt("sTotal"), "MXN $3,237,936.77", "total con IVA");
  eq(t.txt("marginWarn"), "", "HVAC template above floor");
  t.$("checkBtn").click();
  const f1 = t.txt("flags");
  ok(!/Crane|grúa/i.test(f1), "crane not flagged when crane line present");
  ok(!/commissioning|Arranque/i.test(f1), "startup not flagged when present");
  // remove crane + startup lines -> both flagged
  t.d.querySelectorAll('#matTable [data-del="m"]')[2].click();
  t.d.querySelectorAll('#labTable [data-del="l"]')[2].click();
  t.$("desc").value = "4 rooftop units on techo, ductwork";
  t.$("checkBtn").click();
  const f2 = t.txt("flags");
  ok(/Renta de grúa \/ polipasto/.test(f2), "crane/hoist flagged for rooftop units (es)");
  ok(/Arranque y puesta en marcha/.test(f2), "startup/commissioning flagged (es)");
  t.$("langEn").click(); t.$("checkBtn").click();
  ok(/Crane \/ hoist/.test(t.txt("flags")), "crane/hoist flagged (en)");
  ok(/Startup \/ commissioning \(arranque\)/.test(t.txt("flags")), "startup/commissioning flagged (en)");
  // switching back keeps GST labels exact
  t.preset("electrical");
  eq(t.txt("exLabel"), "Total ex GST", "GST label after IVA");
  eq(t.txt("totalLabel"), "Final total inc. GST", "GST total label after IVA");
  // landscape rule output unchanged by new rules
  t.preset("landscape"); t.$("checkBtn").click();
  ok(!/Crane|commissioning/i.test(t.txt("flags")), "landscape check unaffected by HVAC rules");
  t.preset("solar"); t.$("checkBtn").click();
  ok(!/Crane|commissioning/i.test(t.txt("flags")), "solar check unaffected by HVAC rules");
}

// ---------- English | Espanol toggle ----------
{
  const t = boot();
  const EN = ["Materials", "Direct cost", "Contingency", "Markup", "Profit", "Margin", "Bid total", "Minimum margin floor %", "Did I forget anything?"];
  t.preset("landscape");
  eq(t.$("langEn").getAttribute("aria-pressed"), "true", "English is default");
  EN.forEach(w => ok(t.d.body.textContent.includes(w), `English label "${w}"`));
  t.$("langEs").click();
  const b = t.d.body.textContent;
  ["Materiales", "Mano de obra", "Contingencia", "Margen de ganancia", "Utilidad", "¿Olvidé algo?", "Total del presupuesto", "+ Agregar partida", "Cuadrilla: personas x días x horas"].forEach(w => ok(b.includes(w), `Spanish label "${w}"`));
  ok(t.d.querySelector("header").textContent.includes("Ship Warp Sorcery") && t.d.querySelector("footer").textContent.includes("Ship Warp Sorcery"), "team name stays in Spanish");
  eq(t.txt("sTotal"), "$12,772.32", "numbers unchanged in Spanish");
  t.set("markup", "10");
  ok(/No enviar/.test(t.txt("marginWarn")), "Spanish margin warning");
  t.set("markup", "20");
  eq(t.txt("marginWarn"), "", "Spanish warning clears");
  t.$("checkBtn").click();
  ok(/Falta:/.test(t.txt("flags")), "Spanish missing-line flags");
  t.$("langEn").click();
  EN.forEach(w => ok(t.d.body.textContent.includes(w), `English label "${w}" restored`));
  ok(!t.d.querySelector("main").textContent.includes("Materiales"), "no Spanish left in English mode");
  t.set("gst", "10");
  eq(t.txt("exLabel"), "Total ex GST", "exact GST ex label after toggling back");
  eq(t.txt("totalLabel"), "Final total inc. GST", "exact GST total label after toggling back");
  t.preset("hvacmx");
  eq(t.$("langEs").getAttribute("aria-pressed"), "true", "HVAC MX template switches to Espanol");
  eq(t.txt("exLabel"), "Total sin IVA", "IVA ex label in Spanish");
  eq(t.txt("totalLabel"), "Total con IVA", "IVA total label in Spanish");
}

// ---------- P2: client-ready bid ----------
{
  const t = boot();
  t.preset("landscape");
  t.$("clientBtn").click();
  ok(t.shown("clientOut"), "client bid preview shown");
  const c = t.txt("clientOut");
  ok(c.includes("TOTAL: $12,772.32"), "client bid total matches");
  ok(c.includes("Backyard paver patio"), "client bid has job");
  ok(!/markup|contingency|profit|margin/i.test(c), "client bid hides markup/contingency/profit/margin");
  ok(!c.includes("$4.50"), "client bid hides unit costs");
  const sum = [...c.matchAll(/^  .*\s(\$[\d,]+\.\d\d)$/gm)].reduce((a, m) => a + parseFloat(m[1].replace(/[$,]/g, "")), 0);
  ok(Math.abs(sum - 12772.32) < 0.001, `client line prices sum to total (got ${sum.toFixed(2)})`);
  t.set("gst", "10"); t.$("clientBtn").click();
  const g = t.txt("clientOut");
  ok(g.includes("Total ex GST: $12,772.32") && g.includes("GST 10%: $1,277.23") && g.includes("Final total inc. GST: $14,049.55"), "client bid GST lines");
  t.preset("telecom"); t.$("clientBtn").click();
  const tc = t.txt("clientOut");
  ok(tc.includes("$22,750.00 /mo") && tc.includes("$854,000.00"), "client bid includes recurring + contract value");
  ok(!tc.includes("TOTAL: $0.00"), "telecom client bid has no empty project total");
}

// @@NEXT@@

console.log(`${failures ? "FAILED" : "PASSED"}: ${passes} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
