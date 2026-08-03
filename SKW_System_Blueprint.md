# StyleKorean US — SKWLogistics System Blueprint (v2)
**Dynamic Web App · Google Workspace Backend · Automated Ingestion Pipeline**
*Prepared for: Alex (bobo61480 / skwarehouse) · Repo: github.com/bobo61480/SKWLogistics · Hosting: **GitHub Pages (sole host)** → https://stylekorean.dpdns.org/*

---

## 1. System Architecture & Data Flow

```
                        ┌─────────────────────────────────────────────┐
                        │              GOOGLE WORKSPACE               │
                        │                                             │
  Vendor / Carrier      │  ┌────────┐   time-driven    ┌───────────┐  │
  Emails w/ Packing ───▶│  │ Gmail  │──── trigger ────▶│ Apps      │  │
  Lists, ASNs, BOLs     │  │ (label)│   (every 15 min) │ Script    │  │
                        │  └────────┘                  │ Engine    │  │
                        │                              └─────┬─────┘  │
                        │            ┌───────────────────────┼──────┐ │
                        │            ▼                       ▼      │ │
                        │  ┌──────────────────┐   ┌─────────────────┐│ │
                        │  │  Google Drive     │   │  Google Sheets  ││ │
                        │  │  /SKW-Inbox/      │   │  ┌───────────┐  ││ │
                        │  │   ├─ 2026/08/     │   │  │ Inbound   │  ││ │
                        │  │   ├─ Processed/   │   │  │ Outbound  │  ││ │
                        │  │   └─ Failed/      │   │  │ Inv_Raw_A │  ││ │
                        │  └──────────────────┘   │  │ Inv_Raw_B │  ││ │
                        │                          │  │ Inventory │  ││ │
                        │                          │  │ KPI       │  ││ │
                        │                          │  │ Review ⚑  │  ││ │
                        │                          │  │ Log       │  ││ │
                        │                          │  └─────┬─────┘  ││ │
                        │                          └────────┼────────┘│ │
                        └───────────────────────────────────┼─────────┘
                                                            │
                                          Apps Script Web App (doGet)
                                          → read-only JSON API endpoint
                                                            │
        ┌───────────────────────────┐                       ▼
        │  GitHub: bobo61480/       │  push   ┌──────────────────────────┐
        │  SKWLogistics (main)      │────────▶│  GitHub Actions           │
        │  static HTML/CSS/JS board │         │  deploy-pages.yml         │
        └───────────────────────────┘         │  · sanity gate → deploy   │
                                              └────────────┬─────────────┘
                                                           ▼
                                              ┌──────────────────────────┐
                                              │  GitHub Pages (SOLE HOST) │
                                              │  stylekorean.dpdns.org    │
                                              │  · public build: gviz CSV │
                                              │    direct from Sheets     │
                                              │  · members build: Apps    │
                                              │    Script doGet JSON      │
                                              └──────────────────────────┘
```

### Data flow, end to end

1. **Ingestion.** A Gmail filter auto-applies the label `SKW/Incoming` to emails matching your senders/subjects (e.g., "Packing List", "Delivery Note", "Outbound Order"). Every 15 minutes a time-driven Apps Script trigger scans that label for unprocessed threads.
2. **Archival.** Each attachment is saved untouched to Drive under `/SKW-Inbox/YYYY/MM/`, giving you an immutable audit trail. The message ID is recorded so the same email is never processed twice (idempotency).
3. **Parsing & validation.** CSV attachments are parsed directly; XLSX attachments are converted to a temporary Google Sheet via the Drive Advanced Service, read, then trashed. Every parsed row passes through a validation layer (Section 4). Clean rows append to **Inbound** or **Outbound**; questionable rows go to **Review** with status `PENDING VERIFICATION` and an orange highlight — they are *never* auto-committed to the live schedules.
4. **Inventory & KPI recomputation.** The **Inventory** sheet joins the two raw inventory sheets with Inbound/Outbound movements (Section 3). The **KPI** sheet recalculates on every edit/append via formulas plus an `onChange` trigger for derived metrics.
5. **Serving data to the web — two tiers.** The **public/live build** (current Control Tower board) reads link-readable tabs directly via the gviz CSV endpoint with `cb=Date.now()` + `cache:"no-store"` and tab-name (`sheet=`) addressing. The **members build** uses the Apps Script **Web App (`doGet`)** JSON API (`?view=inbound|outbound|inventory|kpi`), which reads server-side — no share-setting changes, no keys in client code, and internal columns (e.g., `Source_Msg_ID`) stripped from the payload. Anything sensitive (the dims workbook) stays members-tier only until the `loginfo` tab is relocated and credentials rotated.
6. **Frontend.** The static board in `bobo61480/SKWLogistics` (index.html / styles.css / app.js) syncs on load and every 30 minutes, so the dashboard is live without redeploys.
7. **CI/CD.** GitHub Actions (`deploy-pages.yml`) deploys to **GitHub Pages** on every push to `main` — sanity gate first (site files, CNAME, `.nojekyll` present; no vinext-starter remnants), then artifact upload and Pages deploy (~1 min). A weekly scheduled run is the safety net. Because sheet data is fetched at runtime, *data* changes never require a redeploy — only *code* changes do.

---

## 2. Google Sheets Relational Schema

One spreadsheet file (`SKW-Backend`) containing eight tabs. Key columns marked 🔑 (primary) / 🔗 (foreign).

**Inbound** — `IB_ID` 🔑 (e.g., `IB-20260801-001`) | `PO_Number` | `Vendor` | `SKU` 🔗 | `Product_Description` | `Batch_No` | `Expiry_Date` | `Qty_EA` | `Qty_Carton` | `Pallet_No` | `Pallet_Weight_KG` | `ETA_Date` | `Received_Date` | `Status` (Scheduled/In-Transit/Received/Putaway) | `Source_Msg_ID` | `Ingested_At`

**Outbound** — `OB_ID` 🔑 | `Order_Number` | `Customer` | `SKU` 🔗 | `Qty_EA` | `Qty_Carton` | `Ship_Date` | `Carrier` | `Tracking` | `Status` (Pending/Picked/Shipped/Delivered) | `Source_Msg_ID` | `Ingested_At`

**Inv_Raw_A** (e.g., warehouse count export) — `SKU` 🔑 | `Product_Description` | `On_Hand_EA` | `Location` | `Last_Count_Date`

**Inv_Raw_B** (e.g., ERP/3PL export) — `SKU` 🔑 | `Batch_No` | `Expiry_Date` | `System_Qty_EA` | `Unit_Cost` | `Reorder_Point`

**Inventory** (computed, Section 3) — `SKU` 🔑 | `Description` | `Baseline_On_Hand` | `Inbound_Received` | `Outbound_Shipped` | `Live_On_Hand` | `System_Qty` | `Variance` | `Reorder_Point` | `Reorder_Flag` | `Nearest_Expiry`

**KPI** — single-column metric/value pairs (Section 3.3).

**Review** — `Flag_ID` 🔑 | `Direction` (Inbound/Outbound) | `Raw_Row_JSON` | `Issues` | `Status` (PENDING VERIFICATION / APPROVED / REJECTED) | `Source_File` | `Source_Msg_ID` | `Flagged_At` | `Resolved_By`

**Log** — `Timestamp` | `Level` | `Function` | `Message` | `Details`

The `SKU` key is the relational spine of the whole system; `Source_Msg_ID` gives every schedule row full provenance back to the originating email and Drive file.

---

## 3. Inventory Logic — Relational Mapping

### 3.1 Join model

Think of it as: **Inv_Raw_A** = physical baseline (last count), **Inv_Raw_B** = system-of-record enrichment (batch/expiry/cost/reorder), **Inbound/Outbound** = movement ledgers. The Inventory tab computes:

```
Live_On_Hand(SKU) = Baseline_On_Hand(A)
                  + Σ Inbound.Qty_EA  WHERE SKU matches AND Status = "Received" AND Received_Date > Last_Count_Date
                  − Σ Outbound.Qty_EA WHERE SKU matches AND Status ∈ {"Shipped","Delivered"} AND Ship_Date > Last_Count_Date
```

Filtering movements to *after* `Last_Count_Date` prevents double-counting units already reflected in the physical count. `Variance = Live_On_Hand − System_Qty(B)` surfaces shrinkage or sync gaps between physical reality and the ERP.

### 3.2 Sheet formulas (row 2 of Inventory, SKU in A2)

```
Baseline_On_Hand:  =IFERROR(VLOOKUP($A2, Inv_Raw_A!$A:$E, 3, FALSE), 0)
Inbound_Received:  =SUMIFS(Inbound!$H:$H, Inbound!$D:$D, $A2, Inbound!$N:$N, "Received",
                           Inbound!$M:$M, ">"&IFERROR(VLOOKUP($A2,Inv_Raw_A!$A:$E,5,FALSE),0))
Outbound_Shipped:  =SUMIFS(Outbound!$E:$E, Outbound!$D:$D, $A2, Outbound!$J:$J, "Shipped",
                           Outbound!$G:$G, ">"&IFERROR(VLOOKUP($A2,Inv_Raw_A!$A:$E,5,FALSE),0))
                   + (same SUMIFS with "Delivered")
Live_On_Hand:      =C2+D2-E2
System_Qty:        =IFERROR(SUMIF(Inv_Raw_B!$A:$A, $A2, Inv_Raw_B!$D:$D), 0)
Variance:          =F2-G2
Reorder_Flag:      =IF(F2<=IFERROR(VLOOKUP($A2,Inv_Raw_B!$A:$F,6,FALSE),0),"⚠ REORDER","OK")
Nearest_Expiry:    =IFERROR(MINIFS(Inv_Raw_B!$C:$C, Inv_Raw_B!$A:$A, $A2),"")
```

The SKU master column A is populated by the Apps Script `rebuildInventorySkuList()` (union of SKUs across A, B, Inbound, Outbound), so new SKUs arriving via email automatically appear.

### 3.3 KPI sheet (live metrics)

| Metric | Formula concept |
|---|---|
| Inbound scheduled today / this week | `COUNTIFS` on `ETA_Date` + `Status` |
| Outbound shipped today / this week | `COUNTIFS` on `Ship_Date` + `Status` |
| Total units on hand | `SUM(Inventory!F:F)` |
| SKUs below reorder point | `COUNTIF(Inventory!J:J,"⚠ REORDER")` |
| Inventory variance (units / %) | `SUM(ABS(Variance))` via `SUMPRODUCT` |
| Pending verification items | `COUNTIF(Review!E:E,"PENDING VERIFICATION")` |
| Inbound on-time % | received-by-ETA count ÷ received count |
| Units expiring < 60 days | `COUNTIFS` on `Nearest_Expiry` |

Because these are formulas over the ledgers, they update the instant Apps Script appends a row — the website simply reads the KPI tab through the JSON endpoint.

---

## 4. Validation & Error Handling Design

The validation layer (implemented in `Code.gs`) applies these rules to every parsed row **before** it can touch the live schedules:

**Hard failures → Review sheet, orange flag, never committed:**
- Missing SKU / item code, or SKU fails format regex
- Quantity missing, non-numeric, zero, or negative
- Date fields unparseable, or dates that are implausible (>1 year past, >2 years future)
- Outbound quantity exceeding current `Live_On_Hand` for that SKU (likely a typo or a sync problem)
- Duplicate: same `PO_Number`+`SKU`+`Qty` (inbound) or `Order_Number`+`SKU` (outbound) already exists

**Soft warnings → committed, but row is annotated and yellow-highlighted:**
- SKU not yet present in Inventory master (new item — plausible but worth eyeing)
- Carton math inconsistent (`Qty_EA ≠ Qty_Carton × units/carton` when both present)

**Pipeline-level protections:** `LockService` prevents overlapping trigger runs; processed-message-ID registry guarantees idempotency; every exception is caught per-attachment (one bad file never kills the batch), logged to the **Log** tab, filed to `/SKW-Inbox/Failed/`, and summarized in a daily digest email to you. Reviewers fix flagged rows directly in the Review sheet and set Status to `APPROVED`; an `onEdit` companion function then promotes the row into the proper schedule.

---

## 5. GitHub Deployment Strategy — GitHub Pages (sole host)

### 5.1 Decision: GitHub Pages only

**Decided 2026-08-02.** GitHub Pages on `bobo61480/SKWLogistics` is the single production host for `stylekorean.dpdns.org`. Rationale: the board is pure static HTML/CSS/JS with zero build step and zero server-side needs (data comes from gviz / Apps Script at runtime), so Pages covers 100% of requirements for free — one platform, one DNS record, one workflow, nothing to keep in sync. Vercel is retired from the stack; the earlier Vercel workflow is superseded and should not be committed.

**Decoupling insight (unchanged):** because the frontend fetches sheet data at *runtime*, you do **not** need to redeploy when data changes — only when code changes.

### 5.2 GitHub Actions workflow — `deploy-pages.yml`

Lives at `.github/workflows/deploy-pages.yml` in `bobo61480/SKWLogistics` (shipped in `skwlogistics-pages-v1.zip`). It:
- Deploys to Pages on every push to `main` (event-driven "repo scanning" — no polling needed), plus manual dispatch and a weekly Monday 06:00 PT safety-net run
- Runs a sanity gate before deploying: `index.html`/`app.js`/`styles.css` present, `CNAME` contains `stylekorean.dpdns.org`, `.nojekyll` present, and no vinext-starter remnants (`app/`, `vite.config.ts`, `wrangler.jsonc`)
- Uses the official `configure-pages` → `upload-pages-artifact` → `deploy-pages` chain; requires the one-time repo setting **Settings → Pages → Source: GitHub Actions**
- Needs **no secrets** — Pages deploys use the built-in `GITHUB_TOKEN` via OIDC (`permissions: pages: write, id-token: write`)

Repo must also carry: `CNAME` (custom-domain binding), `.nojekyll` (disables Jekyll, which was rendering the starter README), `robots.txt` + noindex 404 (internal tool). Cutover/rollback sequence is in `MIGRATE.md`; post-deploy checks in `smoke-test.sh`.

### 5.3 Frontend data adapter (vanilla JS, matches the existing app.js patterns)

```javascript
// data.js — two-tier fetch: public gviz CSV, members Apps Script JSON
const GVIZ = (sheetId, tab) =>
  `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv` +
  `&sheet=${encodeURIComponent(tab)}&cb=${Date.now()}`;          // cb + no-store: BOTH required

async function fetchGvizCsv(sheetId, tab) {
  const res = await fetch(GVIZ(sheetId, tab), { cache: "no-store" });
  const text = await res.text();
  if (text.trim().startsWith("<"))                                // HTML = not link-readable
    throw new Error(`Sheet not publicly shared: ${tab}`);
  return text;                                                    // hand to existing CSV parser
}

const MEMBERS_API = "PASTE_APPS_SCRIPT_EXEC_URL";                 // members build only
async function fetchMembersView(view) {                          // inbound|outbound|inventory|kpi
  const res = await fetch(`${MEMBERS_API}?view=${view}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}
```

---

## 6. Implementation Checklist (in order)

1. Create the `SKW-Backend` spreadsheet with the eight tabs and headers from Section 2; paste Inventory/KPI formulas.
2. Create Drive folder `/SKW-Inbox/` with `Processed/` and `Failed/` subfolders.
3. In Gmail, create label `SKW/Incoming` + filters (e.g., `subject:("packing list" OR "delivery note" OR "outbound") has:attachment → apply label`).
4. New Apps Script project → paste `Code.gs` → fill the `CONFIG` block IDs → enable **Drive API** under Services (needed for XLSX conversion).
5. Run `setup()` once (authorizes scopes, installs the 15-min trigger and daily digest).
6. Deploy → **Web App** → Execute as *Me*, access *Anyone with the link* → copy the `/exec` URL.
7. Run the Pages migration per `MIGRATE.md`: clean `bobo61480/SKWLogistics`, add site files + `skwlogistics-pages` package, push; set Pages Source = GitHub Actions; release the domain from `tokkiboi/stylekorean`, bind it to SKWLogistics, flip the dpdns CNAME to `bobo61480.github.io`; run `smoke-test.sh`.
8. Send yourself a test packing-list email; verify Drive filing, Inbound append, a deliberately-broken row landing in Review, and the KPI tile updating on the live site.
