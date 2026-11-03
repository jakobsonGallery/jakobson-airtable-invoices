const AIRTABLE_API = "https://api.airtable.com/v0";
const AIRTABLE_CONTENT_API = "https://content.airtable.com/v0";

function token() {
  if (!process.env.AIRTABLE_TOKEN) {
    throw new Error("Missing AIRTABLE_TOKEN environment variable.");
  }
  return process.env.AIRTABLE_TOKEN;
}

export async function airtableGet(baseId, tableId, recordId) {
  const url = `${AIRTABLE_API}/${baseId}/${tableId}/${recordId}?returnFieldsByFieldId=true`;
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token()}`
    }
  });

  if (!response.ok) {
    throw new Error(`Airtable GET failed: ${response.status} ${await response.text()}`);
  }

  return response.json();
}

export async function airtableListFields(baseId, tableId, fieldIds) {
  const records = [];
  let offset = "";

  do {
    const params = new URLSearchParams();
    params.set("returnFieldsByFieldId", "true");
    params.set("pageSize", "100");
    for (const fieldId of fieldIds) params.append("fields[]", fieldId);
    if (offset) params.set("offset", offset);

    const url = `${AIRTABLE_API}/${baseId}/${tableId}?${params.toString()}`;
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token()}`
      }
    });

    if (!response.ok) {
      throw new Error(`Airtable LIST failed: ${response.status} ${await response.text()}`);
    }

    const page = await response.json();
    records.push(...(page.records || []));
    offset = page.offset || "";
  } while (offset);

  return records;
}

export async function airtableListField(baseId, tableId, fieldId) {
  return airtableListFields(baseId, tableId, [fieldId]);
}

export async function airtablePatch(baseId, tableId, recordId, fields) {
  const url = `${AIRTABLE_API}/${baseId}/${tableId}/${recordId}`;
  const response = await fetch(url, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token()}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ fields })
  });

  if (!response.ok) {
    throw new Error(`Airtable PATCH failed: ${response.status} ${await response.text()}`);
  }

  return response.json();
}

export async function airtableUploadAttachment(baseId, recordId, fieldId, bytes, filename, contentType = "application/pdf") {
  const url = `${AIRTABLE_CONTENT_API}/${baseId}/${recordId}/${fieldId}/uploadAttachment`;
  const file = Buffer.from(bytes).toString("base64");

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token()}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      contentType,
      filename,
      file
    })
  });

  if (!response.ok) {
    throw new Error(`Airtable attachment upload failed: ${response.status} ${await response.text()}`);
  }

  return response.json();
}

export function linkedRecordIds(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === "string" ? item : item?.id))
    .filter(Boolean);
}

export function firstLinkedRecordId(value) {
  return linkedRecordIds(value)[0] || null;
}

function flatten(value) {
  if (!Array.isArray(value)) return [value];
  return value.flatMap((item) => flatten(item));
}

export function attachmentUrl(value) {
  const attachments = flatten(value).filter((item) => item && typeof item === "object");
  return attachments.find((item) => item.url)?.url || null;
}

export function attachmentFilename(value) {
  const attachments = flatten(value).filter((item) => item && typeof item === "object");
  return attachments.find((item) => item.filename)?.filename || null;
}

export function asText(value) {
  if (value === null || value === undefined) return "";
  if (Array.isArray(value)) {
    return flatten(value)
      .map((item) => {
        if (typeof item === "string") return item;
        if (typeof item === "number") return String(item);
        return item?.name || item?.filename || "";
      })
      .filter(Boolean)
      .join(", ");
  }
  if (typeof value === "object") {
    return value.name || value.filename || "";
  }
  return String(value);
}

/**
 * Upload the replacement first, then remove only the superseded certificates.
 * All unrelated attachments (including invoices) are preserved.
 */
export async function airtableReplaceAttachment(baseId, tableId, recordId, fieldId, bytes, filename) {
  const before = await airtableGet(baseId, tableId, recordId);
  const existing = Array.isArray(before.fields?.[fieldId]) ? before.fields[fieldId] : [];
  const oldIds = new Set(existing.filter(item => item.filename === filename).map(item => item.id));

  await airtableUploadAttachment(baseId, recordId, fieldId, bytes, filename);
  if (oldIds.size === 0) return;

  const after = await airtableGet(baseId, tableId, recordId);
  const attachments = Array.isArray(after.fields?.[fieldId]) ? after.fields[fieldId] : [];
  const replacementExists = attachments.some(item => item.filename === filename && !oldIds.has(item.id));
  if (!replacementExists) throw new Error("Replacement certificate was not confirmed in Airtable; originals preserved.");

  await airtablePatch(baseId, tableId, recordId, {
    [fieldId]: attachments.filter(item => !oldIds.has(item.id)).map(item => ({ id: item.id }))
  });
}
