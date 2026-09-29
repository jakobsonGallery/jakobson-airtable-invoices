const AIRTABLE_API = "https://api.airtable.com/v0";

function token() {
  if (!process.env.AIRTABLE_TOKEN) {
    throw new Error("Missing AIRTABLE_TOKEN environment variable.");
  }
  return process.env.AIRTABLE_TOKEN;
}

export async function airtableGet(baseId, tableId, recordId) {
  const url = `${AIRTABLE_API}/${baseId}/${tableId}/${recordId}`;
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

export function firstLinkedRecordId(value) {
  if (!Array.isArray(value) || value.length === 0) return null;
  if (typeof value[0] === "string") return value[0];
  return value[0]?.id || null;
}

export function attachmentUrl(value) {
  if (!Array.isArray(value) || value.length === 0) return null;
  return value[0]?.url || null;
}

export function attachmentFilename(value) {
  if (!Array.isArray(value) || value.length === 0) return null;
  return value[0]?.filename || null;
}

export function asText(value) {
  if (value === null || value === undefined) return "";
  if (Array.isArray(value)) {
    return value
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
