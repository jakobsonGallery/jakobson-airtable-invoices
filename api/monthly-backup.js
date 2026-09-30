import * as XLSX from "xlsx";

const AIRTABLE_API = "https://api.airtable.com/v0";
const AIRTABLE_CONTENT_API = "https://content.airtable.com/v0";

const BACKUP = {
  baseId: "appZQ3yquS8uPXZy6",
  tableId: "tblVK4KJNVLuzslYb",
  nameFieldId: "fldqxaCJMBZap72hj",
  dateFieldId: "fld6N6oXuv77gEhtB",
  fileFieldId: "fldPrbM5WAEvs8jWU"
};

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

// Airtable allows a limited request rate per base. We start requests ~230 ms apart
// for each base, but let their network latency overlap so a full export does not
// need to wait for every table sequentially.
const nextRequestAt = new Map();
const rateLocks = new Map();

async function waitForRateSlot(baseId) {
  const previous = rateLocks.get(baseId) || Promise.resolve();
  let release;
  const current = new Promise((resolve) => {
    release = resolve;
  });
  rateLocks.set(baseId, current);

  await previous;
  try {
    const now = Date.now();
    const target = Math.max(now, nextRequestAt.get(baseId) || now);
    if (target > now) await sleep(target - now);
    nextRequestAt.set(baseId, Date.now() + 230);
  } finally {
    release();
  }
}

async function fetchPage(baseId, url, attempt = 0) {
  await waitForRateSlot(baseId);

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token()}` }
  });

  if (response.status === 429 && attempt < 6) {
    const retryAfter = Number(response.headers.get("retry-after") || "1");
    await sleep(Math.max(1000, retryAfter * 1000));
    return fetchPage(baseId, url, attempt + 1);
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
    const page = await fetchPage(baseId, url);
    records.push(...(page.records || []));
    offset = page.offset || "";
  } while (offset);

  return records;
}

async function createBackupRecord(filename, date) {
  const response = await fetch(`${AIRTABLE_API}/${BACKUP.baseId}/${BACKUP.tableId}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token()}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      records: [{
        fields: {
          [BACKUP.nameFieldId]: filename,
          [BACKUP.dateFieldId]: date
        }
      }]
    })
  });

  if (!response.ok) {
    throw new Error(`Airtable backup record failed: ${response.status} ${await response.text()}`);
  }

  const payload = await response.json();
  const recordId = payload.records?.[0]?.id;
  if (!recordId) throw new Error("Airtable backup record created without record ID.");
  return recordId;
}

async function deleteBackupRecord(recordId) {
  if (!recordId) return;
  try {
    await fetch(`${AIRTABLE_API}/${BACKUP.baseId}/${BACKUP.tableId}/${recordId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token()}` }
    });
  } catch {
    // Best-effort cleanup only.
  }
}

async function uploadBackupAttachment(recordId, bytes, filename) {
  const url = `${AIRTABLE_CONTENT_API}/${BACKUP.baseId}/${recordId}/${BACKUP.fileFieldId}/uploadAttachment`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token()}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      filename,
      file: Buffer.from(bytes).toString("base64")
    })
  });

  if (!response.ok) {
    throw new Error(`Airtable backup upload failed: ${response.status} ${await response.text()}`);
  }

  return response.json();
}

function normalize(value) {
  if (value === null || value === undefined) return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;

  if (Array.isArray(value)) {
    if (value.length === 0) return "";
    if (value.every((x) => x && typeof x === "object" && ("filename" in x || "url" in x))) {
      // Attachment URLs expire; preserve the filename rather than treating the URL as a backup.
      return value.map((x) => x.filename || "").filter(Boolean).join(", ");
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
    if ("filename" in value) return value.filename || "";
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

async function exportOneTable(base, tableId, tableName) {
  try {
    const records = await listAllRecords(base.baseId, tableId);
    return {
      base: base.key,
      baseId: base.baseId,
      tableId,
      tableName,
      records,
      error: null
    };
  } catch (error) {
    return {
      base: base.key,
      baseId: base.baseId,
      tableId,
      tableName,
      records: [],
      error: error.message || String(error)
    };
  }
}

async function collectData() {
  const jobs = BASES.flatMap((base) =>
    base.tables.map(([tableId, tableName]) => exportOneTable(base, tableId, tableName))
  );
  return Promise.all(jobs);
}

export default async function handler(req, res) {
  let backupRecordId = null;

  try {
    if (req.method !== "GET") {
      res.status(405).send("Use GET.");
      return;
    }

    assertSecret(req);
    const url = new URL(req.url, "https://local");

    const startedAt = Date.now();
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
        durationMs: Date.now() - startedAt,
        tables: summary
      });
      return;
    }

    const failed = results.filter((x) => x.error);
    if (failed.length) {
      throw new Error(`Export incomplet: ${failed.map((x) => `${x.base}/${x.tableName}: ${x.error}`).join(" | ")}`);
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
        : [{ "Record ID": "", "Created Time": "", Information: "Aucune donnée" }];
      const sheet = XLSX.utils.json_to_sheet(dataRows);
      sheet["!cols"] = fitColumns(dataRows);
      const prefix = item.base === "PARIS" ? "P" : "ST";
      XLSX.utils.book_append_sheet(workbook, sheet, safeSheetName(prefix, item.tableName, used));
    }

    const bytes = XLSX.write(workbook, {
      type: "buffer",
      bookType: "xlsx",
      compression: true
    });

    if (url.searchParams.get("archive") === "1") {
      backupRecordId = await createBackupRecord(filename, date);
      await uploadBackupAttachment(backupRecordId, bytes, filename);

      res.status(200).json({
        ok: true,
        recordId: backupRecordId,
        filename,
        generatedAt: generatedAt.toISOString(),
        durationMs: Date.now() - startedAt,
        byteLength: bytes.length,
        tables: summary
      });
      return;
    }

    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Cache-Control", "no-store, private");
    res.status(200).send(bytes);
  } catch (error) {
    if (backupRecordId) await deleteBackupRecord(backupRecordId);
    res.status(error.statusCode || 500).send(error.message || "Backup export failed.");
  }
}
