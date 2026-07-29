"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

const SHEET_ID = "1M-vZ24Yw4ZN7R7b_473cVn8kny8DznTakSsD3VQsCzc";
const SHEET_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/edit`;
const WRITE_ENDPOINT =
  "https://script.google.com/a/macros/stylekoreanus.com/s/AKfycbwyVnU2jvOtMFXuY7KtX_8-hHXYVLrc6R2Dr_6akdDaTGQPc8duSo7tpguIuk00MjDl/exec";

type Direction = "inbound" | "outbound";

type ScheduleItem = {
  id: string;
  direction: Direction;
  date: Date;
  dateText: string;
  title: string;
  reference: string;
  secondary: string;
  status: string;
  sourceSheet: string;
  sourceRow: number;
  customer?: string;
  invoice?: string;
  shipmentNo?: string;
  container?: string;
  mbl?: string;
  hbl?: string;
  pro?: string;
  shipDate?: string;
};

const STATUS_OPTIONS = [
  "Scheduled",
  "Work in Progress",
  "Pending",
  "Shipping",
  "Shipped",
  "Delivered",
  "Received",
  "Cancelled",
  "Completed",
];

const INBOUND_STATUS_OPTIONS = [
  ...STATUS_OPTIONS,
  "Customs Clearance",
  "FDA Review/Hold",
  "FWS Review/Hold",
  "Delayed",
];

const finished = new Set(["shipped", "delivered", "received", "cancelled", "completed"]);

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function cell(row: any, index: number) {
  const value = row?.c?.[index];
  return clean(value?.f ?? value?.v ?? "");
}

function parseGviz(text: string) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end < 0) throw new Error("The workbook returned an unreadable response.");
  const payload = JSON.parse(text.slice(start, end + 1));
  if (!payload.table) throw new Error("No schedule data was returned.");
  return payload.table;
}

function parseDate(value: string) {
  const full = value.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (full) {
    let year = Number(full[3]);
    if (year < 100) year += 2000;
    return new Date(year, Number(full[1]) - 1, Number(full[2]));
  }
  const short = value.match(/(\d{1,2})\/(\d{1,2})/);
  if (!short) return null;
  const today = new Date();
  const candidates = [-1, 0, 1].map(
    (offset) => new Date(today.getFullYear() + offset, Number(short[1]) - 1, Number(short[2])),
  );
  return candidates.reduce((best, candidate) =>
    Math.abs(candidate.getTime() - today.getTime()) <
    Math.abs(best.getTime() - today.getTime())
      ? candidate
      : best,
  );
}

function dayKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate(),
  ).padStart(2, "0")}`;
}

function startOfToday() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).formatToParts(new Date());
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return new Date(Number(value.year), Number(value.month) - 1, Number(value.day));
}

function statusClass(status: string) {
  const value = status.toLowerCase();
  if (/delay|hold|review|pending/.test(value)) return "status warning";
  if (/deliver|receive|complete|shipped/.test(value)) return "status done";
  if (/work|shipping|clearance/.test(value)) return "status active";
  return "status";
}

async function fetchTable(gid: number, range: string, headers: number) {
  const url = new URL(`https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq`);
  url.searchParams.set("tqx", "out:json");
  url.searchParams.set("gid", String(gid));
  url.searchParams.set("range", range);
  url.searchParams.set("headers", String(headers));
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error(`Workbook read failed (${response.status}).`);
  return parseGviz(await response.text());
}

function normalizeStatus(value: string) {
  const normalized = clean(value).toLowerCase();
  if (!normalized) return "Scheduled";
  if (normalized === "wip") return "Work in Progress";
  if (normalized === "ready" || normalized === "routed/booked" || normalized === "picked up") {
    return "Scheduled";
  }
  return normalized.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function inboundItems(table: any): ScheduleItem[] {
  return (table.rows ?? []).flatMap((row: any, index: number) => {
    const eta = cell(row, 12);
    const delivery = cell(row, 15);
    const dateText = delivery || eta;
    const date = parseDate(dateText);
    const sourceRow = Number(cell(row, 17));
    const shipmentNo = cell(row, 1);
    const container = cell(row, 6);
    if (!date || !sourceRow || (!shipmentNo && !container)) return [];
    const status = normalizeStatus(cell(row, 16));
    return [
      {
        id: `inbound-${sourceRow}-${index}`,
        direction: "inbound",
        date,
        dateText,
        title: shipmentNo || container,
        reference: container || cell(row, 3) || "Inbound shipment",
        secondary: [cell(row, 0), cell(row, 10)].filter(Boolean).join(" · "),
        status,
        sourceSheet: "IMPORTS",
        sourceRow,
        shipmentNo,
        container,
        mbl: cell(row, 4),
        hbl: cell(row, 5),
        invoice: cell(row, 3),
      },
    ];
  });
}

function outboundItems(table: any): ScheduleItem[] {
  return (table.rows ?? []).flatMap((row: any, index: number) => {
    const sourceRow = index + 2;
    if (sourceRow < 4) return [];
    const customer = cell(row, 0);
    const invoice = cell(row, 1);
    const shipDate = cell(row, 3);
    const date = parseDate(shipDate);
    if (!date || !customer) return [];
    const status = normalizeStatus(cell(row, 23) || cell(row, 20));
    return [
      {
        id: `outbound-${sourceRow}`,
        direction: "outbound",
        date,
        dateText: shipDate,
        title: customer,
        reference: invoice || cell(row, 18) || "Outbound shipment",
        secondary: [cell(row, 16), cell(row, 18)].filter(Boolean).join(" · "),
        status,
        sourceSheet: "Outbound Shipping Schedule",
        sourceRow,
        customer,
        invoice,
        pro: cell(row, 18),
        shipDate,
      },
    ];
  });
}

async function postStatus(item: ScheduleItem, status: string) {
  const payload = {
    kind: item.direction,
    sourceSheet: item.sourceSheet,
    sourceRow: item.sourceRow,
    shipmentNo: item.shipmentNo ?? "",
    container: item.container ?? "",
    mbl: item.mbl ?? "",
    hbl: item.hbl ?? "",
    pro: item.pro ?? "",
    invoice: item.invoice ?? "",
    customer: item.customer ?? "",
    shipDate: item.shipDate ?? "",
    currentStatus: item.status,
    status,
  };
  const body = JSON.stringify(payload);
  try {
    const response = await fetch(WRITE_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body,
    });
    if (response.ok) {
      const result = await response.json().catch(() => ({ ok: true }));
      if (result?.ok === false) throw new Error(result.error || "The update was rejected.");
      return;
    }
  } catch {
    // Domain-restricted Apps Script endpoints can reject a readable CORS response.
  }
  await fetch(WRITE_ENDPOINT, {
    method: "POST",
    mode: "no-cors",
    headers: { "Content-Type": "text/plain" },
    body,
  });
}

function ScheduleCard({
  item,
  saving,
  onStatus,
}: {
  item: ScheduleItem;
  saving: boolean;
  onStatus: (item: ScheduleItem, status: string) => void;
}) {
  const options = item.direction === "inbound" ? INBOUND_STATUS_OPTIONS : STATUS_OPTIONS;
  return (
    <article className={`schedule-card ${item.direction}`}>
      <div className="card-topline">
        <span className="direction-label">{item.direction === "inbound" ? "IN" : "OUT"}</span>
        <span className={statusClass(item.status)}>{item.status}</span>
      </div>
      <h3>{item.title}</h3>
      <p className="reference">{item.reference}</p>
      <p className="secondary">{item.secondary || item.sourceSheet}</p>
      <label className="status-field">
        <span>Update source status</span>
        <select
          aria-label={`Update ${item.title} status`}
          disabled={saving}
          value={options.includes(item.status) ? item.status : "Scheduled"}
          onChange={(event) => onStatus(item, event.target.value)}
        >
          {options.map((option) => (
            <option key={option}>{option}</option>
          ))}
        </select>
      </label>
    </article>
  );
}

export default function Home() {
  const [items, setItems] = useState<ScheduleItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [query, setQuery] = useState("");
  const [direction, setDirection] = useState<"all" | Direction>("all");
  const [includeFinished, setIncludeFinished] = useState(false);
  const [savingId, setSavingId] = useState("");
  const [notice, setNotice] = useState("");

  const days = useMemo(() => {
    const today = startOfToday();
    return Array.from({ length: 14 }, (_, index) => {
      const date = new Date(today);
      date.setDate(today.getDate() + index);
      return date;
    });
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [inbound, outbound] = await Promise.all([
        fetchTable(2026070701, "A3:S1200", 1),
        fetchTable(20260708, "A2:X1000", 0),
      ]);
      setItems([...inboundItems(inbound), ...outboundItems(outbound)]);
      setUpdatedAt(new Date());
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "The live schedule could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const timer = window.setInterval(load, 10 * 60 * 1000);
    return () => window.clearInterval(timer);
  }, [load]);

  const visibleItems = useMemo(() => {
    const first = days[0].getTime();
    const last = days[days.length - 1].getTime();
    const needle = query.trim().toLowerCase();
    return items.filter((item) => {
      const stamp = new Date(item.date.getFullYear(), item.date.getMonth(), item.date.getDate()).getTime();
      if (stamp < first || stamp > last) return false;
      if (direction !== "all" && item.direction !== direction) return false;
      if (!includeFinished && finished.has(item.status.toLowerCase())) return false;
      if (!needle) return true;
      return [item.title, item.reference, item.secondary, item.status, item.sourceSheet]
        .join(" ")
        .toLowerCase()
        .includes(needle);
    });
  }, [days, direction, includeFinished, items, query]);

  const counts = useMemo(() => {
    const today = dayKey(days[0]);
    const inbound = visibleItems.filter((item) => item.direction === "inbound").length;
    const outbound = visibleItems.filter((item) => item.direction === "outbound").length;
    const dueToday = visibleItems.filter((item) => dayKey(item.date) === today).length;
    const exceptions = visibleItems.filter((item) =>
      /pending|delay|hold|review/i.test(item.status),
    ).length;
    return { inbound, outbound, dueToday, exceptions };
  }, [days, visibleItems]);

  const handleStatus = async (item: ScheduleItem, status: string) => {
    setSavingId(item.id);
    setNotice(`Saving ${item.title}…`);
    try {
      await postStatus(item, status);
      setItems((current) =>
        current.map((record) => (record.id === item.id ? { ...record, status } : record)),
      );
      setNotice(`${item.title} updated to ${status}.`);
      window.setTimeout(() => setNotice(""), 4500);
    } catch (statusError) {
      setNotice(
        statusError instanceof Error
          ? statusError.message
          : "Status was not saved. Sign in with your StyleKorean Google account and try again.",
      );
    } finally {
      setSavingId("");
    }
  };

  return (
    <main className="site-shell">
      <header className="manifest">
        <div className="route-strip">
          <span>KRPUS ⚓ USLAX</span>
          <i />
          <span>ICN ✈ LAX</span>
          <i />
          <span>5609 RIVERWAY · BUENA PARK CA</span>
        </div>
        <div className="manifest-main">
          <div>
            <p className="eyebrow">LOGISTICS MASTER 2026 · LIVE TWO-WEEK FORECAST</p>
            <h1>
              Inbound <em>+</em> Outbound
              <br />
              Schedule Control
            </h1>
            <p className="intro">
              One rolling 14-day operating view for containers, air freight, and outbound
              customer shipments—with approved status changes written back to Google Sheets.
            </p>
          </div>
          <div className="manifest-actions">
            <button className="button primary" onClick={load} disabled={loading}>
              {loading ? "SYNCING…" : "↻ REFRESH DATA"}
            </button>
            <a className="button secondary" href={SHEET_URL} target="_blank" rel="noreferrer">
              OPEN SOURCE SHEET ↗
            </a>
          </div>
        </div>
        <div className="sync-strip" role="status" aria-live="polite">
          <span>
            <b className={error ? "sync-dot error" : loading ? "sync-dot loading" : "sync-dot"} />
            {error ? "Workbook connection needs attention" : loading ? "Syncing live records…" : "Live workbook connected"}
          </span>
          <span className="mono">
            LAST SYNC {updatedAt ? updatedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", timeZone: "America/Los_Angeles" }) : "—"}
          </span>
        </div>
      </header>

      {error && (
        <div className="alert" role="alert">
          <strong>Schedule unavailable.</strong> {error} Confirm the workbook is link-readable or
          open it while signed in to your StyleKorean Google account.
        </div>
      )}

      <section className="metrics" aria-label="Two-week schedule totals">
        <article>
          <span>INBOUND</span>
          <strong>{counts.inbound}</strong>
          <small>arrivals in view</small>
        </article>
        <article>
          <span>OUTBOUND</span>
          <strong>{counts.outbound}</strong>
          <small>shipments in view</small>
        </article>
        <article>
          <span>DUE TODAY</span>
          <strong>{counts.dueToday}</strong>
          <small>combined moves</small>
        </article>
        <article className={counts.exceptions ? "metric-alert" : ""}>
          <span>EXCEPTIONS</span>
          <strong>{counts.exceptions}</strong>
          <small>pending / hold / delayed</small>
        </article>
      </section>

      <section className="control-panel" aria-label="Schedule filters">
        <label className="search">
          <span>⌕</span>
          <input
            type="search"
            placeholder="Search shipment, customer, invoice, container, carrier…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <div className="segmented" aria-label="Direction filter">
          {(["all", "inbound", "outbound"] as const).map((value) => (
            <button
              key={value}
              className={direction === value ? "selected" : ""}
              onClick={() => setDirection(value)}
            >
              {value}
            </button>
          ))}
        </div>
        <label className="finished-toggle">
          <input
            type="checkbox"
            checked={includeFinished}
            onChange={(event) => setIncludeFinished(event.target.checked)}
          />
          Show finished
        </label>
      </section>

      <section className="schedule-panel" aria-labelledby="schedule-heading">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">ROLLING WINDOW · PACIFIC TIME</p>
            <h2 id="schedule-heading">Next 14 days</h2>
          </div>
          <div className="legend" aria-label="Schedule legend">
            <span><i className="legend-in" />Inbound</span>
            <span><i className="legend-out" />Outbound</span>
          </div>
        </div>
        <div className="board-wrap">
          <div className="board">
            {days.map((day, index) => {
              const dayItems = visibleItems
                .filter((item) => dayKey(item.date) === dayKey(day))
                .sort((a, b) => a.direction.localeCompare(b.direction));
              return (
                <section className={index === 0 ? "day-column today" : "day-column"} key={dayKey(day)}>
                  <header>
                    <span>{day.toLocaleDateString("en-US", { weekday: "short" }).toUpperCase()}</span>
                    <strong>{day.getDate()}</strong>
                    <small>{day.toLocaleDateString("en-US", { month: "short" }).toUpperCase()}</small>
                    <b>{dayItems.length}</b>
                  </header>
                  <div className="day-items">
                    {dayItems.map((item) => (
                      <ScheduleCard
                        key={item.id}
                        item={item}
                        saving={savingId === item.id}
                        onStatus={handleStatus}
                      />
                    ))}
                    {!loading && dayItems.length === 0 && (
                      <div className="empty-day">
                        <span>—</span>
                        No scheduled moves
                      </div>
                    )}
                    {loading && <div className="loading-card" />}
                  </div>
                </section>
              );
            })}
          </div>
        </div>
      </section>

      <footer>
        <p><strong>SK</strong> STYLEKOREAN LOGISTICS · COMPANY OPERATIONS</p>
        <p className="mono">AUTO-REFRESH 10 MIN · STATUS EDITS SYNC TO SOURCE ROWS</p>
      </footer>

      {notice && <div className="toast" role="status">{notice}</div>}
    </main>
  );
}
