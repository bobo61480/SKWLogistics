import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("renders production metadata", async () => {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  const response = await worker.fetch(
    new Request("http://localhost/", {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );

  assert.equal(response.status, 200);
  assert.match(
    response.headers.get("content-type") ?? "",
    /^text\/html\b/i,
  );
  const html = await response.text();
  assert.match(html, /<title>StyleKorean Logistics Planner<\/title>/i);
  assert.match(
    html,
    /<meta(?=[^>]*\bname=["']description["'])(?=[^>]*\bcontent=["']Live inbound and outbound shipment planning,[^"']*["'])[^>]*>/i,
  );
  assert.doesNotMatch(html, /\bcodex-preview\b/i);
});

test("keeps the requested schedule order and KPI controls", async () => {
  const source = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const sections = [
    "<ImportSchedules",
    '<ScheduleBoard\n          direction="inbound"',
    '<SmallParcelSchedule\n          direction="inbound"',
    '<ScheduleBoard\n          direction="outbound"',
    '<SmallParcelSchedule\n          direction="outbound"',
  ];
  let lastIndex = -1;
  for (const section of sections) {
    const index = source.indexOf(section, lastIndex + 1);
    assert.ok(index > lastIndex, `${section} must follow the prior schedule section`);
    lastIndex = index;
  }
  assert.match(source, /KPI Control Tower/);
  assert.match(source, /Show completed entries/);
  assert.match(source, /TRANSFER SHIPPING/);
  assert.match(source, /AVG TRUCKING COST · YTD/);
  assert.match(source, /never shipment Invoice Amount/);
  assert.match(source, /!record\.isTransfer/);
  assert.match(source, /parseFreightCost/);
  assert.match(source, /amount <= 250_000/);
  assert.match(source, /SALES_SNAPSHOT/);
  assert.match(source, /2_209_375\.46/);
  assert.match(source, /6_244_884\.52/);
  assert.match(source, /3_601_652\.95/);
  assert.match(source, /15_591_074\.08/);
  assert.match(source, /numericCell/);
  assert.match(source, /nationalOrderAmounts/);
  assert.match(source, /wmsInvoiceAmounts/);
  assert.match(source, /INVOICE AMOUNT \(column G\)/);
  assert.match(source, /Order Date \(column G\)/);
  assert.match(source, /Date \(column A\)/);
  assert.match(source, /FREE SAMPLE/);
  assert.match(source, /SALES · NATIONALS/);
  assert.match(source, /SALES · WMS WHOLESALE/);
  assert.doesNotMatch(source, /National Total Order Amount plus every Stylekorean/);
  assert.match(source, /Outbound departments/);
  assert.match(source, /B2B\/E-Com/);
  assert.match(source, /departmentClass/);
  assert.doesNotMatch(source, /\.\.\.truckingCostRecords\(currentOutbound/);
});

test("uses the complete-ledger sales KPI endpoint", async () => {
  const source = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");

  assert.match(source, /fetch\("\/api\/sales-kpis"/);
  assert.match(source, /\.\.\.salesKpis/);
});

test("calculates MTD and YTD from every source row", async () => {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("sales-test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  const response = await worker.fetch(
    new Request("http://localhost/api/sales-kpis"),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
  const kpis = await response.json();

  assert.equal(response.status, 200);
  assert.equal(kpis.nationalsSalesMtd, 2_209_375.46);
  assert.equal(kpis.nationalsSalesYtd, 6_244_884.52);
  assert.ok(Math.abs(kpis.wmsSalesMtd - 3_601_652.95) < 0.001);
  assert.ok(Math.abs(kpis.wmsSalesYtd - 15_591_074.08) < 0.001);
});

test("preserves physical Google Sheet rows for every editable write-back", async () => {
  const source = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(source, /function parseCsv\(/);
  assert.match(source, /fetchCsvRows\(SHEET_ID, 1497250700\)/);
  assert.match(source, /fetchCsvRows\(SHEET_ID, 20260708\)/);
  assert.match(source, /function inboundParcelItems\(rows: string\[\]\[\]\)/);
  assert.match(source, /\.\.\.inboundParcelItems\(imports\)/);
  assert.match(source, /const status = normalizeStatus\(cell\(row, 29\)\)/);
  assert.match(source, /const overdue = unfinished && sourceDate\.getTime\(\) < today\.getTime\(\)/);
  assert.match(source, /record\.sourceRow === item\.sourceRow/);
  assert.match(source, /const sourceRow = index \+ 1/);
  assert.match(source, /did not contain one unique matching shipment row/);
  assert.doesNotMatch(source, /Number\(cell\(row, 17\)\)/);
  assert.doesNotMatch(source, /fetchTable\(SHEET_ID, 1497250700, "A1:AF1200", 1\)/);
  assert.doesNotMatch(source, /fetchTable\(SHEET_ID, 20260708, "A2:X1000", 0\)/);
});

test("routes status writes through the site and preserves POST redirects", async () => {
  const pageSource = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const workerSource = await readFile(new URL("../worker/index.ts", import.meta.url), "utf8");
  assert.match(pageSource, /const WRITE_ENDPOINT = "\/api\/status"/);
  assert.doesNotMatch(pageSource, /mode: "no-cors"/);
  assert.match(workerSource, /url\.pathname === "\/api\/status"/);
  assert.match(workerSource, /redirect: "manual"/);
  assert.match(workerSource, /await upstreamRequest\(new URL\(location/);
  assert.match(workerSource, /result\?\.ok !== true/);
});
