import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const developmentPreviewMeta =
  /<meta(?=[^>]*\bname=["']codex-preview["'])(?=[^>]*\bcontent=["']development["'])[^>]*>/i;

test("renders development preview metadata", async () => {
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
  assert.match(await response.text(), developmentPreviewMeta);
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
});
