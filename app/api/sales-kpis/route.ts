const NATIONAL_SHEET_ID = "12Aty04yiLPPqz06AFDM8Y1Log2jEOqdXDqwiUV5yVX8";
const WMS_SHEET_ID = "14lH9SQzTLj8MR7UbxMfkoTDDlzhPoE8CqHV3IpK450I";

function parseCsv(text: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let value = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        value += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        value += character;
      }
    } else if (character === '"') {
      quoted = true;
    } else if (character === ",") {
      row.push(value);
      value = "";
    } else if (character === "\n") {
      row.push(value.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      value = "";
    } else {
      value += character;
    }
  }

  if (value || row.length) {
    row.push(value.replace(/\r$/, ""));
    rows.push(row);
  }
  return rows;
}

function dateCode(value: string) {
  const match = value.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (!match) return 0;
  let year = Number(match[3]);
  if (year < 100) year += 2000;
  return year * 10_000 + Number(match[1]) * 100 + Number(match[2]);
}

function amount(value: string, allowSuffix: boolean) {
  const text = value.trim().toUpperCase().replace(/[$,\s]/g, "");
  const match = text.match(allowSuffix ? /^(-?\d+(?:\.\d+)?)([KMB])?$/ : /^(-?\d+(?:\.\d+)?)$/);
  if (!match) return null;
  const multiplier =
    match[2] === "K"
      ? 1_000
      : match[2] === "M"
        ? 1_000_000
        : match[2] === "B"
          ? 1_000_000_000
          : 1;
  const parsed = Number(match[1]) * multiplier;
  return Number.isFinite(parsed) ? parsed : null;
}

function pacificDateParts() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, Number(part.value)]));
  return {
    year: values.year,
    month: values.month,
    day: values.day,
    code: values.year * 10_000 + values.month * 100 + values.day,
  };
}

async function fullCsv(spreadsheetId: string, gid: number) {
  const url = new URL(`https://docs.google.com/spreadsheets/d/${spreadsheetId}/export`);
  url.searchParams.set("format", "csv");
  url.searchParams.set("gid", String(gid));
  url.searchParams.set("_", String(Date.now()));
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error(`Sales workbook read failed (${response.status}).`);
  return parseCsv(await response.text());
}

export async function GET() {
  try {
    const [nationalRows, wmsRows] = await Promise.all([
      fullCsv(NATIONAL_SHEET_ID, 99300389),
      fullCsv(WMS_SHEET_ID, 0),
    ]);
    const today = pacificDateParts();
    const yearStart = today.year * 10_000 + 101;
    const monthStart = today.year * 10_000 + today.month * 100 + 1;

    const nationalSales = nationalRows.slice(1).flatMap((row) => {
      if ((row[0] ?? "").trim().toLowerCase() === "cancelled") return [];
      const date = dateCode(row[6] ?? "");
      const value = amount(row[4] ?? "", true);
      return date >= yearStart && date <= today.code && value !== null && value > 0
        ? [{ date, value }]
        : [];
    });
    const wmsSales = wmsRows.slice(2).flatMap((row) => {
      const date = dateCode(row[0] ?? "");
      const value = amount(row[6] ?? "", false);
      return date >= yearStart && date <= today.code && value !== null
        ? [{ date, value }]
        : [];
    });
    const sum = (records: Array<{ date: number; value: number }>, start: number) =>
      records
        .filter((record) => record.date >= start)
        .reduce((total, record) => total + record.value, 0);

    return Response.json(
      {
        nationalsSalesMtd: sum(nationalSales, monthStart),
        nationalsSalesYtd: sum(nationalSales, yearStart),
        wmsSalesMtd: sum(wmsSales, monthStart),
        wmsSalesYtd: sum(wmsSales, yearStart),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Sales KPI calculation failed." },
      { status: 502, headers: { "Cache-Control": "no-store" } },
    );
  }
}
