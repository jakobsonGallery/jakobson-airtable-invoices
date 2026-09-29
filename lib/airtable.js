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

export function firstLinkedRecordId(value) {
  if (!Array.isArray(value) || value.length === 0) return null;
  if (typeof value[0] === "string") return value[0];
  return value[0]?.id || null;
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
