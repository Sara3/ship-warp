# BidBench backlog (team Ship Warp Sorcery)

Live: https://sara3.github.io/ship-warp/  (single file: index.html, deployed from `main` via GitHub Pages)

Prioritization rule: (1) don't break what a customer already reviewed, (2) unblock the biggest open deal, (3) cheap asks that close a deal, (4) things the next prospect will ask for.

## Shipped (must keep working: every review re-checks these)
- [x] Material lines (item, qty, unit, unit cost) and labor lines (hours x rate)
- [x] Markup %, contingency %, itemized breakdown, bid total, profit, margin %
- [x] Missing-line check (disposal, delivery, equipment, permits, inspection, drainage, board upgrade, change-order allowance, ICRA)
- [x] Templates: commercial fit-out, landscape, electrical, solar, blank
- [x] Margin floor (default 15%): red + "do not send" + markup needed; no warning when healthy (Kwame, Plumbline)
- [x] Locked contingency (change-order cushion) (Kwame)
- [x] GST: "Total ex GST", GST 10% line, "Final total inc. GST" (Liam, Tallowwood)
- [x] Square-footage line: length x width x $/sq ft, drops into bid (Arne, Brekke); added line stays linked to the helper (Kauri Ridge review)
- [x] Team name in header + footer

## Prioritized to build
| # | Item | Why / customer | Effort |
|---|------|----------------|--------|
| [x] P0 | Regression test (`node test.js`, run `npm i` once) for calc math, GST, margin floor, sq-ft line | Basics are re-checked every review; a broken total loses all deals | S |
| P0 | Real AI on free text: missing-line check reads scope notes with a small fast model behind a serverless function (key on server, keyword rules as fallback, <3s timeout) | Product brief requires real AI wherever free text is judged | M, needs API key + Vercel/Netlify (user) |
| [x] TOP | Event venue (DK): DKK + "Moms 25% (DK)" tax, Guests input driving "per guest" lines, "Event venue (DK)" template, event checks (cloakroom, security, cleaning, AV technician, late-night licence/overtime, terrace heaters/weather backup) | Havnehallen Events (Copenhagen, up to $50K) | S |
| [x] TOP | Recurring vs one-time charges card (term, MRC, one-time/NRC, first-year, total contract value) + "Enterprise telecom quote" template | Kallang Pacific Telecom (sells to banks/government) | S |
| [x] P1+ | Frio Regio (Monterrey HVAC, MXN): crew-days labor builder, MXN + IVA 16% tax option, "HVAC industrial (MX)" template, crane/hoist + startup/commissioning checks, English/Espanol toggle | Frio Regio (48h tenders, rooftop install days underestimated) | S |
| [x] P1 | Electrical/solar templates default to AUD + GST 10% (already), add a visible "AU: GST 10%" quick toggle next to the total; "labour" spelling when AUD/NZD | Liam (up to $45K) | S |
| [x] P1 | Per-line markup override + "change-order" line type that shows separately on the breakdown | Kwame (up to $90K): change orders ate margin on two loss jobs | S |
| [x] P1 | Save / load / duplicate bids in the browser (localStorage, try/catch) | Plumbline prices several hundred bids a year | S |
| [x] P2 | Copy-ready client bid (clean itemized text/HTML without internal margin) | All three need to send it out | S |
| [x] P2 | NZ preset (NZD + GST 15%) roofing/solar template: "Re-roof (NZ)" + area builder ft/m, roof pitch, waste %; scaffolding + flashings checks | Kauri Ridge Roofing (Auckland, up to $70K) | S |
| [x] P2 | Moving/storage quote template (crew hours, truck, materials, storage months) | Brennan & Daughters (prospect) | S |
| [x] P3 | Crew rate library (save named crews with rates) | Repeat use | M |

## Not building (qualified out)
- Telecom churn / care triage (Serra Azul): not a bid problem
- Dental ops (Saltmarsh): not a bid problem
