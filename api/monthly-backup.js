import * as XLSX from "xlsx";

const AIRTABLE_API = "https://api.airtable.com/v0";

const BASES = [
  {
    key: "PARIS",
    baseId: "appZQ3yquS8uPXZy6",
    tables: [
      ["tbln43SRK0PdGH9Gi", "ACHATS"],
      ["tblKxwOtgwwt04IA2", "CLIENTS"],
      ["tblPyD8fldWdXOJ9d", "DEMANDES"],
      ["tblwzvPNp07L2pu4Y", "OEUVRES"],
      ["tblFiALuIrG03WtmR", "FACTURES"],
      ["tbljIV4qV8D4VRq18", "PARAMÈTRES GALERIE"],
      ["tbldv3hTlPjJpVkOC", "FORMULAIRE INSCRIPTION"],
      ["tblgXe8z7bWShdhaz", "ENCAISSEMENT SAINT-TROPEZ"],
      ["tblCeMDx1D2dKXeil", "TRANSPORT"],
      ["tblFxXk3xu69fUEaZ", "COMPAS"],
      ["tblj6glicsXERrqJb", "ARTISTES"]
    ]
  },
  {
    key: "SAINT-TROPEZ",
    baseId: "appFdB88AmgomcZWY",
    tables: [
      ["tbln43SRK0PdGH9Gi", "ACHATS"],
      ["tblKxwOtgwwt04IA2", "CLIENTS"],
      ["tblPyD8fldWdXOJ9d", "DEMANDES"],
      ["tblwzvPNp07L2pu4Y", "OEUVRES"],
      ["tbldv3hTlPjJpVkOC", "FORMULAIRE INSCRIPTION"],
      ["tbl3DVOjzQ3so1VAd", "ŒUVRES"],
      ["tbl6R7cQy4TzPX0BP", "PARAMETRES GALERIE"],
      ["tblBjKKLDfnrmUrQp", "FACTURES"]
    ]
  }
];

function token() {
  if (!process.env.AIRTABLE_TOKEN) throw new Error("Missing AIRTABLE_TOKEN.");
  return process.env.AIRTABLE_TOKEN;
}

function assertSecret(req) {
  const url = new URL(req.url, "https://local");
  const supplied = url.searchParams.get("token");
  if (!process.env.INVOICE_SECRET || supplied !== process.env.INVOICE_SECRET) {
    const err = new Error("Unauthorized");
    err.statusCode = 401;
    throw err;
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchPage(url, attempt = 0) {
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token()}` }
  });

  if (response.status === 429 && attempt < 5) {
    const retryAfter = Number(response.headers.get("retry-after") || "1");
    await sleep(Math.max(1000, retryAfter * 1000));
    return fetchPage(url, attempt + 1);
  }

  if (!response.ok) {
    throw new Error(`Airtable export failed: ${response.status} ${await response.text()}`);
  }
  return response.json();
}

async function listAllRecords(baseId, tableId) {
  const records = [];
  let offset = "";

  do {
    const params = new URLSearchParams();
    params.set("pageSize", "100");
    if (offset) params.set("offset", offset);

    const url = `${AIRTABLE_API}/${baseId}/${tableId}?${params.toString()}`;
    const page = await fetchPage(url);
    records.push(...(page.records || []));
    offset = page.offset || "";
    if (offset) await sleep(240);
  } while (offset);

  return records;
}

function normalize(value) {
  if (value === null || value === undefined) return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;

  if (Array.isArray(value)) {
    if (value.length === 0) return "";
    if (value.every((x) => x && typeof x === "object" && ("filename" in x || "url" in x))) {
      return value
        .map((x) => [x.filename || "", x.url || ""].filter(Boolean).join(" — "))
        .join("\n");
    }
    if (value.every((x) => x && typeof x === "object" && "name" in x)) {
      return value.map((x) => x.name || "").filter(Boolean).join(", ");
    }
    if (value.every((x) => typeof x !== "object")) return value.join(", ");
    return JSON.stringify(value);
  }

  if (typeof value === "object") {
    if ("name" in value && value.name) return value.name;
    if ("email" in value && value.email) return value.email;
    if ("filename" in value || "url" in value) {
      return [value.filename || "", value.url || ""].filter(Boolean).join(" — ");
    }
    return JSON.stringify(value);
  }

  return String(value);
}

function rowsFromRecords(records) {
  return records.map((record) => {
    const row = {
      "Record ID": record.id,
      "Created Time": record.createdTime || ""
    };
    for (const [field, value] of Object.entries(record.fields || {})) {
      row[field] = normalize(value);
    }
    return row;
  });
}

function safeSheetName(prefix, name, used) {
  const cleaned = `${prefix} - ${name}`
    .replace(/[\\/?*\[\]:]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
  let candidate = cleaned.slice(0, 31) || "Sheet";
  let i = 2;
  while (used.has(candidate)) {
    const suffix = ` ${i++}`;
    candidate = cleaned.slice(0, 31 - suffix.length) + suffix;
  }
  used.add(candidate);
  return candidate;
}

function fitColumns(rows) {
  const keys = new Set();
  for (const row of rows) for (const key of Object.keys(row)) keys.add(key);
  return [...keys].map((key) => {
    let max = Math.max(10, String(key).length + 2);
    for (const row of rows.slice(0, 200)) {
      const len = String(row[key] ?? "").length;
      if (len > max) max = Math.min(45, len + 2);
    }
    return { wch: max };
  });
}

async function collectData() {
  const results = [];
  for (const base of BASES) {
    for (const [tableId, tableName] of base.tables) {
      try {
        const records = await listAllRecords(base.baseId, tableId);
        results.push({
          base: base.key,
          baseId: base.baseId,
          tableId,
          tableName,
          records,
          error: null
        });
      } catch (error) {
        results.push({
          base: base.key,
          baseId: base.baseId,
          tableId,
          tableName,
          records: [],
          error: error.message || String(error)
        });
      }
      await sleep(240);
    }
  }
  return results;
}

export default async function handler(req, res) {
  try {
    if (req.method !== "GET") {
      res.status(405).send("Use GET.");
      return;
    }

    assertSecret(req);
    const url = new URL(req.url, "https://local");
    const results = await collectData();
    const generatedAt = new Date();
    const date = generatedAt.toISOString().slice(0, 10);
    const filename = `SAUVEGARDE_JAKOBSON_${date}.xlsx`;

    const summary = results.map((item) => ({
      Base: item.base,
      Table: item.tableName,
      "Table ID": item.tableId,
      Lignes: item.records.length,
      Erreur: item.error || ""
    }));

    if (url.searchParams.get("check") === "1") {
      res.status(200).json({
        ok: !results.some((x) => x.error),
        filename,
        generatedAt: generatedAt.toISOString(),
        tables: summary
      });
      return;
    }

    const workbook = XLSX.utils.book_new();

    const infoRows = [
      { Information: "Fichier", Valeur: filename },
      { Information: "Généré le", Valeur: generatedAt.toISOString() },
      { Information: "Destination e-mail", Valeur: "paris@jakobsongallery.com" },
      { Information: "Contenu", Valeur: "Export mensuel des bases Paris et Saint-Tropez" }
    ];
    const infoSheet = XLSX.utils.json_to_sheet(infoRows);
    infoSheet["!cols"] = [{ wch: 24 }, { wch: 65 }];
    XLSX.utils.book_append_sheet(workbook, infoSheet, "INFO");

    const summarySheet = XLSX.utils.json_to_sheet(summary);
    summarySheet["!cols"] = [{ wch: 16 }, { wch: 32 }, { wch: 20 }, { wch: 10 }, { wch: 45 }];
    XLSX.utils.book_append_sheet(workbook, summarySheet, "SOMMAIRE");

    const used = new Set(["INFO", "SOMMAIRE"]);
    for (const item of results) {
      const rows = rowsFromRecords(item.records);
      const dataRows = rows.length
        ? rows
        : [{ "Record ID": "", "Created Time": "", Information: item.error ? `ERREUR: ${item.error}` : "Aucune donnée" }];
      const sheet = XLSX.utils.json_to_sheet(dataRows);
      sheet["!cols"] = fitColumns(dataRows);
      const prefix = item.base === "PARIS" ? "P" : "ST";
      XLSX.utils.book_append_sheet(workbook, sheet, safeSheetName(prefix, item.tableName, used));
    }

    const bytes = XLSX.write(workbook, { type: "buffer", bookType: "xlsx", compression: true });

    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Cache-Control", "no-store, private");
    res.status(200).send(bytes);
  } catch (error) {
    res.status(error.statusCode || 500).send(error.message || "Backup export failed.");
  }
}
