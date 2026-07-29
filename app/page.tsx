"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { INBOUND_DOCUMENT_LINKS } from "./inbound-links";
import { INBOUND_INVOICE_LINKS } from "./inbound-invoice-links";

const SHEET_ID = "1M-vZ24Yw4ZN7R7b_473cVn8kny8DznTakSsD3VQsCzc";
const SHEET_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/edit`;
const NATIONAL_SHEET_ID = "12Aty04yiLPPqz06AFDM8Y1Log2jEOqdXDqwiUV5yVX8";
const NATIONAL_SHEET_URL = `https://docs.google.com/spreadsheets/d/${NATIONAL_SHEET_ID}/edit?gid=99300389#gid=99300389`;
const SALES_SHEET_ID = "14lH9SQzTLj8MR7UbxMfkoTDDlzhPoE8CqHV3IpK450I";
const SALES_SHEET_URL = `https://docs.google.com/spreadsheets/d/${SALES_SHEET_ID}/edit?gid=0#gid=0`;
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
  sourceUrl?: string;
  editable?: boolean;
  customer?: string;
  customerNo?: string;
  po?: string;
  invoice?: string;
  shipmentNo?: string;
  shipmentUrl?: string;
  invoiceUrl?: string;
  container?: string;
  containerUrl?: string;
  mbl?: string;
  hbl?: string;
  pro?: string;
  carrier?: string;
  carrierReference?: string;
  trackingNumber?: string;
  shipDate?: string;
  mode?: string;
  vessel?: string;
  pod?: string;
  eta?: string;
  isSmallParcel?: boolean;
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

function importsCellUrl(row: number, column: string) {
  return `${SHEET_URL}?gid=1497250700&range=${column}${row}#gid=1497250700&range=${column}${row}`;
}

function sourceRowUrl(item: ScheduleItem) {
  if (item.direction === "inbound") {
    if (item.sourceSheet === "INBOUND SHIPMENTS DATA") {
      return `${SHEET_URL}?gid=2026070701&range=A${item.sourceRow}#gid=2026070701&range=A${item.sourceRow}`;
    }
    return importsCellUrl(item.sourceRow, "A");
  }
  if (item.sourceSheet === "Outbound Shipping Schedule") {
    return `${SHEET_URL}?gid=20260708&range=A${item.sourceRow}#gid=20260708&range=A${item.sourceRow}`;
  }
  if (item.sourceSheet === "NATIONAL ORDER PROGRESS") {
    return `https://docs.google.com/spreadsheets/d/${NATIONAL_SHEET_ID}/edit?gid=99300389&range=A${item.sourceRow}#gid=99300389&range=A${item.sourceRow}`;
  }
  if (item.sourceSheet === "Stylekorean") {
    return `https://docs.google.com/spreadsheets/d/${SALES_SHEET_ID}/edit?gid=0&range=A${item.sourceRow}#gid=0&range=A${item.sourceRow}`;
  }
  return item.sourceUrl ?? SHEET_URL;
}

function officialTrackingUrl(container: string, carrierKey: string, fallback: string) {
  const value = clean(container)
    .replace(/^(TRACKING|TRACK|PRO)\s*#?\s*/i, "")
    .replace(/\s+/g, "")
    .toUpperCase();
  const carrier = clean(carrierKey).toUpperCase();
  if (!value) return "";
  if (/^1Z/.test(value)) return `https://www.ups.com/track?loc=en_US&tracknum=${encodeURIComponent(value)}`;
  if (/^(94|92|93)/.test(value)) {
    return `https://tools.usps.com/go/TrackConfirmAction?tLabels=${encodeURIComponent(value)}`;
  }
  if (/^(JD|JJD)/.test(value)) {
    return `https://www.dhl.com/us-en/home/tracking/tracking-express.html?submit=1&tracking-id=${encodeURIComponent(value)}`;
  }
  if (/FEDEX|FDX/.test(carrier)) {
    return `https://www.fedex.com/fedextrack/?trknbr=${encodeURIComponent(value)}`;
  }
  if (/AMAZON/.test(carrier) || /^TBA/.test(value)) return "https://track.amazon.com/";
  if (/^(SMCU)|SMLM|SM LINES?/.test(`${value} ${carrier}`)) {
    return `https://esvc.smlines.com/smline/CUP_HOM_3301GS.do?_search=false&f_cmd=121&page=1&rows=10000&search_name=${encodeURIComponent(value)}&search_type=C&sidx=&sord=asc`;
  }
  if (/^(HDMU)|(^| )HMM( |$)/.test(`${value} ${carrier}`)) {
    return "https://www.hmm21.com/e-service/general/trackNTrace/TrackNTrace.do";
  }
  if (/^(MAEU|MRSU|MSKU)|MAERSK/.test(`${value} ${carrier}`)) {
    return `https://www.maersk.com/tracking/${encodeURIComponent(value)}`;
  }
  if (/^(KMTU|KORP)|KMTC/.test(`${value} ${carrier}`)) return "https://www.ekmtc.com/index.html";
  if (/^(PUSM)|(^| )ONE( |$)/.test(`${value} ${carrier}`)) {
    return `https://ecomm.one-line.com/one-ecom/manage-shipment/cargo-tracking?ctrack-field=${encodeURIComponent(value)}&trakNoParam=${encodeURIComponent(value)}`;
  }
  if (/^(COSU|CSLU)/.test(value)) {
    return `https://elines.coscoshipping.com/ebusiness/cargotracking?trackingType=CONTAINER&number=${encodeURIComponent(value)}`;
  }
  return fallback;
}

function correctedInboundInvoice(shipmentNo: string, value: string) {
  if (/^OSL10(?:\s*-\s*2026)?$/i.test(clean(shipmentNo))) {
    return clean(value).replace(/\bN00451013\b/g, "IN00451013");
  }
  return clean(value);
}

function parcelCarrier(value: string) {
  const match = clean(value).match(/\b(UPS|FEDEX|DHL|USPS|AMAZON)\b/i);
  return match ? match[1].toUpperCase().replace("FEDEX", "FedEx") : "";
}

function trackingCandidate(...values: string[]) {
  const candidates = values
    .flatMap((value) => clean(value).split(/\r?\n|,\s*/))
    .map((value) => value.replace(/^(TRACKING|TRACK|PRO)\s*#?\s*/i, "").trim())
    .filter(Boolean);
  return (
    candidates.find((value) =>
      /^(1Z[A-Z0-9]{10,}|TBA[A-Z0-9]{8,}|JJD[A-Z0-9]{8,}|\d{10,22})$/i.test(
        value.replace(/\s+/g, ""),
      ),
    ) ?? ""
  ).replace(/\s+/g, "");
}

function firstDatedValue(...values: string[]) {
  for (const value of values) {
    const date = parseDate(clean(value));
    if (date) {
      const text = clean(value).match(/\d{1,2}\/\d{1,2}(?:\/\d{2,4})?/)?.[0] ?? clean(value);
      return { date, text };
    }
  }
  return null;
}

function sanitizeSecondary(value: string) {
  return clean(value)
    .split(/\s*·\s*/)
    .filter((part) => part && !/^imported from\b/i.test(part))
    .join(" · ");
}

function splitValues(value: string) {
  return clean(value)
    .split(/\r?\n|,\s*/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function driveInvoiceSearchUrl(invoice: string) {
  return `https://drive.google.com/drive/u/0/search?q=${encodeURIComponent(invoice)}`;
}

function invoiceFileUrl(invoice: string) {
  return INBOUND_INVOICE_LINKS[invoice] ?? driveInvoiceSearchUrl(invoice);
}

function classifyOutboundReference(value: string) {
  const text = clean(value);
  if (!text) return { carrierReference: "", trackingNumber: "" };
  if (/booking|pickup|pick-up|load|bol|bold/i.test(text)) {
    return { carrierReference: text, trackingNumber: "" };
  }
  return { carrierReference: "", trackingNumber: text };
}

async function fetchTable(
  spreadsheetId: string,
  gid: number,
  range: string,
  headers: number,
) {
  const url = new URL(`https://docs.google.com/spreadsheets/d/${spreadsheetId}/gviz/tq`);
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
    const expectedDelivery = cell(row, 14);
    const importsSourceRow = Number(cell(row, 17));
    const shipmentNo = cell(row, 1);
    const container = cell(row, 6);
    const mode = cell(row, 0);
    const smallParcelCarrier = parcelCarrier([mode, shipmentNo].join(" "));
    const isSmallParcel = Boolean(smallParcelCarrier);
    const parcelTracking = isSmallParcel
      ? trackingCandidate(container, shipmentNo, cell(row, 2), cell(row, 5), cell(row, 4))
      : "";
    const datedValue = isSmallParcel
      ? firstDatedValue(expectedDelivery, eta, cell(row, 9), cell(row, 5), cell(row, 2))
      : firstDatedValue(expectedDelivery, eta);
    if (
      !datedValue ||
      (!importsSourceRow && !isSmallParcel) ||
      (!shipmentNo && !container && !parcelTracking)
    ) {
      return [];
    }
    const { date, text: dateText } = datedValue;
    const sourceRow = importsSourceRow || index + 4;
    const status = normalizeStatus(cell(row, 16));
    const folderUrl = INBOUND_DOCUMENT_LINKS[shipmentNo] ?? importsCellUrl(sourceRow, "B");
    const carrierKey = [cell(row, 0), cell(row, 4), cell(row, 5), cell(row, 10), shipmentNo]
      .filter(Boolean)
      .join(" ");
    const invoice = correctedInboundInvoice(shipmentNo, cell(row, 3));
    const trackingNumber = parcelTracking || container;
    return [
      {
        id: `inbound-${sourceRow}-${index}`,
        direction: "inbound",
        date,
        dateText,
        title: isSmallParcel ? trackingNumber || shipmentNo : shipmentNo || container,
        reference: trackingNumber || invoice || "Inbound shipment",
        secondary: [cell(row, 0), cell(row, 10)].filter(Boolean).join(" · "),
        status,
        sourceSheet: importsSourceRow ? "IMPORTS" : "INBOUND SHIPMENTS DATA",
        sourceRow,
        sourceUrl: SHEET_URL,
        editable: Boolean(importsSourceRow),
        shipmentNo,
        shipmentUrl: folderUrl,
        container,
        containerUrl: officialTrackingUrl(
          trackingNumber,
          `${carrierKey} ${smallParcelCarrier}`,
          importsCellUrl(sourceRow, "H"),
        ),
        mbl: cell(row, 4),
        hbl: cell(row, 5),
        invoice,
        invoiceUrl: invoiceFileUrl(splitValues(invoice)[0] ?? ""),
        mode,
        vessel: cell(row, 10),
        pod: /^OSL/i.test(shipmentNo) ? "LGB" : "LAX",
        eta: expectedDelivery || (isSmallParcel ? dateText : eta),
        carrier: smallParcelCarrier,
        trackingNumber: isSmallParcel ? trackingNumber : "",
        pro: isSmallParcel ? trackingNumber : "",
        isSmallParcel,
      },
    ];
  });
}

function ImportSchedules({
  items,
  loading,
}: {
  items: ScheduleItem[];
  loading: boolean;
}) {
  const sortedItems = [...items].sort((a, b) => a.date.getTime() - b.date.getTime());
  const oceanCount = sortedItems.filter((item) => item.mode === "Ocean").length;
  const airCount = sortedItems.filter((item) => item.mode === "Air").length;

  const linkValue = (value: string, href?: string) =>
    value ? (
      href ? (
        <a href={href} target="_blank" rel="noreferrer">
          {value} <span aria-hidden="true">↗</span>
        </a>
      ) : (
        value
      )
    ) : (
      "—"
    );

  return (
    <section className="import-schedules" aria-labelledby="import-schedules-heading">
      <div className="panel-heading import-heading">
        <div>
          <p className="eyebrow">CURRENT + UPCOMING · OCEAN / AIR</p>
          <h2 id="import-schedules-heading">Import Schedules</h2>
        </div>
        <div className="import-totals" aria-label="Import schedule totals">
          <span><b>{oceanCount}</b> Ocean</span>
          <span><b>{airCount}</b> Air</span>
          <strong>{sortedItems.length}</strong>
        </div>
      </div>
      <div className="import-table-wrap">
        <table className="import-table">
          <thead>
            <tr>
              <th>Mode</th>
              <th>Shipment</th>
              <th>Invoice</th>
              <th>MBL</th>
              <th>HBL</th>
              <th>Container #</th>
              <th>VSL</th>
              <th>POD</th>
              <th>ETA</th>
            </tr>
          </thead>
          <tbody>
            {sortedItems.map((item) => (
              <tr key={`import-${item.id}`}>
                <td><span className={`mode-pill ${item.mode?.toLowerCase()}`}>{item.mode || "—"}</span></td>
                <td>{linkValue(item.shipmentNo ?? item.title, item.shipmentUrl)}</td>
                <td>
                  <div className="multi-links">
                    {splitValues(item.invoice ?? "").length
                      ? splitValues(item.invoice ?? "").map((invoice) => (
                          <a
                            key={invoice}
                            href={invoiceFileUrl(invoice)}
                            target="_blank"
                            rel="noreferrer"
                          >
                            {invoice} <span aria-hidden="true">↗</span>
                          </a>
                        ))
                      : "—"}
                  </div>
                </td>
                <td>{item.mbl || "—"}</td>
                <td>{item.hbl || "—"}</td>
                <td>{linkValue(item.container ?? "", item.containerUrl)}</td>
                <td>{item.vessel || "—"}</td>
                <td>{item.pod || "—"}</td>
                <td><time dateTime={dayKey(item.date)}>{item.eta || item.dateText || "—"}</time></td>
              </tr>
            ))}
            {!loading && sortedItems.length === 0 && (
              <tr>
                <td className="import-empty" colSpan={9}>No current or upcoming imports match the active filters.</td>
              </tr>
            )}
            {loading && (
              <tr>
                <td className="import-empty" colSpan={9}>Syncing import schedules…</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
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
    const carrier = cell(row, 16);
    const carrierRefs = classifyOutboundReference(cell(row, 18));
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
        sourceUrl: SHEET_URL,
        editable: true,
        customer,
        customerNo: customer,
        invoice,
        pro: carrierRefs.trackingNumber,
        carrier,
        carrierReference: carrierRefs.carrierReference || cell(row, 19),
        trackingNumber: carrierRefs.trackingNumber,
        shipDate,
      },
    ];
  });
}

function nationalOutboundItems(table: any): ScheduleItem[] {
  return (table.rows ?? []).flatMap((row: any, index: number) => {
    const pickupDate = cell(row, 9);
    const startShip = cell(row, 7);
    const cancelDate = cell(row, 8);
    const dateText = pickupDate || startShip || cancelDate;
    const date = parseDate(dateText);
    const channel = cell(row, 1);
    if (!date || !channel) return [];
    const sourceRow = index + 2;
    const order = cell(row, 3);
    const po = cell(row, 5);
    return [
      {
        id: `national-outbound-${sourceRow}`,
        direction: "outbound",
        date,
        dateText,
        title: channel,
        reference: order || po || "National order",
        secondary: [cell(row, 2), cell(row, 11), cell(row, 12)]
          .filter(Boolean)
          .join(" · "),
        status: normalizeStatus(cell(row, 0)),
        sourceSheet: "NATIONAL ORDER PROGRESS",
        sourceRow,
        sourceUrl: NATIONAL_SHEET_URL,
        editable: false,
        customer: channel,
        customerNo: channel,
        po,
        invoice: order,
        carrier: cell(row, 11),
        carrierReference: cell(row, 10),
        shipDate: dateText,
      },
    ];
  });
}

function salesOutboundItems(table: any): ScheduleItem[] {
  return (table.rows ?? []).flatMap((row: any, index: number) => {
    const shipDate = cell(row, 4);
    const date = parseDate(shipDate);
    const customer = cell(row, 2);
    if (!date || !customer) return [];
    const sourceRow = index + 3;
    const issue = cell(row, 7);
    const status = /yes|issue|hold|pending/i.test(issue) ? "Pending" : "Scheduled";
    return [
      {
        id: `sales-outbound-${sourceRow}`,
        direction: "outbound",
        date,
        dateText: shipDate,
        title: customer,
        reference: cell(row, 1) || "Sales shipment",
        secondary: [cell(row, 3), cell(row, 5), issue && `Issue: ${issue}`]
          .filter(Boolean)
          .join(" · "),
        status,
        sourceSheet: "Stylekorean",
        sourceRow,
        sourceUrl: SALES_SHEET_URL,
        editable: false,
        customer,
        customerNo: customer,
        invoice: cell(row, 1),
        carrier: cell(row, 5),
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
  const sourceCellUrl = sourceRowUrl(item);
  const valueLink = (label: string, value: string, href?: string, blankWhenMissing = false) => (
    <div className="data-field">
      <dt>{label}</dt>
      <dd>
        {href ? (
          <a href={href} target="_blank" rel="noreferrer">
            {value} <span aria-hidden="true">↗</span>
          </a>
        ) : (
          value || (blankWhenMissing ? "" : "—")
        )}
      </dd>
    </div>
  );
  const invoiceLinks = (item.invoice ? splitValues(item.invoice) : []).map((invoice) =>
    item.direction === "inbound" ? (
      <a key={invoice} href={invoiceFileUrl(invoice)} target="_blank" rel="noreferrer">
        {invoice} <span aria-hidden="true">↗</span>
      </a>
    ) : (
      <span key={invoice}>{invoice}</span>
    ),
  );
  const summaryPrimary =
    item.direction === "outbound"
      ? item.customerNo ?? item.customer ?? item.title
      : item.isSmallParcel
        ? item.trackingNumber ?? item.pro ?? item.title
        : item.shipmentNo ?? item.title;
  const summaryHref =
    item.direction === "inbound"
      ? item.isSmallParcel
        ? item.containerUrl
        : item.shipmentUrl
      : undefined;
  const secondary = sanitizeSecondary(item.secondary);

  return (
    <details className={`schedule-card ${item.direction}`}>
      <summary className="card-summary">
        <span className="summary-primary">
          <small>{item.isSmallParcel ? "TRACKING" : item.direction === "inbound" ? "SHIPMENT" : "CUSTOMER"}</small>
          {summaryHref ? (
            <a href={summaryHref} target="_blank" rel="noreferrer">{summaryPrimary} ↗</a>
          ) : (
            <strong>{summaryPrimary}</strong>
          )}
        </span>
        <span className="summary-invoices">
          <small>INVOICE #</small>
          <span>{invoiceLinks.length ? invoiceLinks : "—"}</span>
        </span>
        <span className="expand-mark" aria-hidden="true">＋</span>
      </summary>

      <div className="card-detail">
        <div className="card-topline">
          <span className="direction-label">
            {item.isSmallParcel ? item.carrier || "PARCEL" : item.direction === "inbound" ? "IN" : "OUT"}
          </span>
          <span className={statusClass(item.status)}>{item.status}</span>
        </div>
        {item.direction === "inbound" ? (
          item.isSmallParcel ? (
            <dl className="data-grid inbound-data">
              {valueLink("Tracking / PRO #", item.trackingNumber ?? item.pro ?? "", item.containerUrl)}
              {valueLink("Invoice #", splitValues(item.invoice ?? "").join(" · "), item.invoiceUrl)}
              {valueLink("Carrier", item.carrier ?? "")}
              {valueLink("ETA", item.eta ?? item.dateText)}
            </dl>
          ) : (
            <dl className="data-grid inbound-data">
              {valueLink("Shipment", item.shipmentNo ?? item.title, item.shipmentUrl)}
              {valueLink("Invoice #", splitValues(item.invoice ?? "").join(" · "), item.invoiceUrl)}
              {valueLink("Container #", item.container ?? "", item.containerUrl)}
              {valueLink("MBL", item.mbl ?? "")}
              {valueLink("HBL", item.hbl ?? "")}
              {valueLink("VSL", item.vessel ?? "")}
              {valueLink("POD", item.pod ?? "")}
              {valueLink("ETA", item.eta ?? item.dateText)}
            </dl>
          )
        ) : (
          <dl className="data-grid outbound-data">
            {valueLink("Customer #", item.customerNo ?? item.customer ?? item.title)}
            {valueLink("PO # / Invoice #", [item.po, item.invoice].filter(Boolean).join(" · "), undefined, true)}
            {item.carrier ? valueLink("Carrier", item.carrier) : null}
            {item.carrierReference
              ? valueLink("Booking / Pickup / Load / BOL #", item.carrierReference)
              : null}
            {item.trackingNumber || item.pro
              ? valueLink("Tracking # / PRO #", item.trackingNumber ?? item.pro ?? "")
              : null}
          </dl>
        )}
        {secondary ? <p className="secondary">{secondary}</p> : null}
        <div className="card-actions">
          {item.editable ? (
            <label className="status-field">
              <span>Status</span>
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
          ) : (
            <span className="read-only-label">READ ONLY</span>
          )}
          <a
            className="source-link"
            href={sourceCellUrl}
            target="_blank"
            rel="noreferrer"
            aria-label={`Open ${item.sourceSheet} source row`}
          >
            SOURCE · ROW {item.sourceRow} ↗
          </a>
        </div>
      </div>
    </details>
  );
}

function ScheduleBoard({
  direction,
  days,
  items,
  loading,
  savingId,
  onStatus,
}: {
  direction: Direction;
  days: Date[];
  items: ScheduleItem[];
  loading: boolean;
  savingId: string;
  onStatus: (item: ScheduleItem, status: string) => void;
}) {
  const isInbound = direction === "inbound";
  return (
    <section
      className={`schedule-panel ${direction}-panel`}
      aria-labelledby={`${direction}-schedule-heading`}
    >
      <div className="panel-heading">
        <div>
          <p className="eyebrow">{isInbound ? "ARRIVALS" : "DEPARTURES"}</p>
          <h2 id={`${direction}-schedule-heading`}>
            {isInbound ? "Inbound schedule" : "Outbound schedule"}
          </h2>
        </div>
        <div className={`board-total ${direction}`}>
          <span>{isInbound ? "INBOUND" : "OUTBOUND"}</span>
          <strong>{items.length}</strong>
          <small>next 14 days</small>
        </div>
      </div>
      <div className="board-wrap">
        <div className="board">
          {days.map((day, index) => {
            const dayItems = items.filter((item) => dayKey(item.date) === dayKey(day));
            return (
              <section
                className={index === 0 ? "day-column today" : "day-column"}
                key={`${direction}-${dayKey(day)}`}
              >
                <header>
                  <span>
                    {day.toLocaleDateString("en-US", { weekday: "short" }).toUpperCase()}
                  </span>
                  <strong>{day.getDate()}</strong>
                  <small>
                    {day.toLocaleDateString("en-US", { month: "short" }).toUpperCase()}
                  </small>
                  <b>{dayItems.length}</b>
                </header>
                <div className="day-items">
                  {dayItems.map((item) => (
                    <ScheduleCard
                      key={item.id}
                      item={item}
                      saving={savingId === item.id}
                      onStatus={onStatus}
                    />
                  ))}
                  {!loading && dayItems.length === 0 && (
                    <div className="empty-day">
                      <span>—</span>
                      No {direction} moves
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
  );
}

export default function Home() {
  const [items, setItems] = useState<ScheduleItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [query, setQuery] = useState("");
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
      const [inbound, outbound, nationalOutbound, salesOutbound] = await Promise.all([
        fetchTable(SHEET_ID, 2026070701, "A3:S1200", 1),
        fetchTable(SHEET_ID, 20260708, "A2:X1000", 0),
        fetchTable(NATIONAL_SHEET_ID, 99300389, "A1:U3500", 1),
        fetchTable(SALES_SHEET_ID, 0, "A2:AF4200", 1),
      ]);
      setItems([
        ...inboundItems(inbound),
        ...outboundItems(outbound),
        ...nationalOutboundItems(nationalOutbound),
        ...salesOutboundItems(salesOutbound),
      ]);
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
      if (!includeFinished && finished.has(item.status.toLowerCase())) return false;
      if (!needle) return true;
      return [
        item.title,
        item.reference,
        item.secondary,
        item.status,
        item.sourceSheet,
        item.customerNo,
        item.po,
        item.invoice,
        item.shipmentNo,
        item.container,
        item.carrier,
        item.carrierReference,
        item.trackingNumber,
        item.mode,
        item.vessel,
        item.pod,
        item.eta,
      ]
        .join(" ")
        .toLowerCase()
        .includes(needle);
    });
  }, [days, includeFinished, items, query]);

  const inboundVisibleItems = useMemo(
    () => visibleItems.filter((item) => item.direction === "inbound"),
    [visibleItems],
  );

  const outboundVisibleItems = useMemo(
    () => visibleItems.filter((item) => item.direction === "outbound"),
    [visibleItems],
  );

  const importScheduleItems = useMemo(
    () =>
      inboundVisibleItems.filter(
        (item) => !item.isSmallParcel && !finished.has(item.status.toLowerCase()),
      ),
    [inboundVisibleItems],
  );

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
            <p className="eyebrow">LOGISTICS MASTER 2026 · LIVE 14-DAY FORECAST</p>
            <h1>
              Inbound <em>+</em> Outbound Schedule
            </h1>
            <p className="intro">
              Compact live view for inbound documents and container tracking, plus outbound
              customer, carrier, booking, and PRO references.
            </p>
          </div>
          <div className="manifest-actions">
            <button className="button primary" onClick={load} disabled={loading}>
              {loading ? "SYNCING…" : "↻ REFRESH DATA"}
            </button>
            <div className="source-buttons" aria-label="Source workbooks">
              <a className="button secondary" href={SHEET_URL} target="_blank" rel="noreferrer">
                MASTER
              </a>
              <a className="button secondary" href={NATIONAL_SHEET_URL} target="_blank" rel="noreferrer">
                NATIONAL
              </a>
              <a className="button secondary" href={SALES_SHEET_URL} target="_blank" rel="noreferrer">
                SALES
              </a>
            </div>
          </div>
        </div>
        <div className="sync-strip" role="status" aria-live="polite">
          <span>
            <b className={error ? "sync-dot error" : loading ? "sync-dot loading" : "sync-dot"} />
            {error ? "Workbook connection needs attention" : loading ? "Syncing live records…" : "3 live workbooks connected"}
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
        <label className="finished-toggle">
          <input
            type="checkbox"
            checked={includeFinished}
            onChange={(event) => setIncludeFinished(event.target.checked)}
          />
          Show finished
        </label>
      </section>

      <ImportSchedules items={importScheduleItems} loading={loading} />

      <div className="schedule-stack" aria-label="Separate inbound and outbound schedules">
        <ScheduleBoard
          direction="inbound"
          days={days}
          items={inboundVisibleItems}
          loading={loading}
          savingId={savingId}
          onStatus={handleStatus}
        />
        <ScheduleBoard
          direction="outbound"
          days={days}
          items={outboundVisibleItems}
          loading={loading}
          savingId={savingId}
          onStatus={handleStatus}
        />
      </div>

      <footer>
        <p><strong>SK</strong> STYLEKOREAN LOGISTICS · COMPANY OPERATIONS</p>
        <p className="mono">AUTO-REFRESH 10 MIN · STATUS EDITS SYNC TO SOURCE ROWS</p>
      </footer>

      {notice && <div className="toast" role="status">{notice}</div>}
    </main>
  );
}
