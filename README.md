# Jakobson Gallery - Airtable Invoice System

This Vercel project generates Jakobson Gallery invoices from Airtable sales records.

## What It Does

- Reads an `ACHATS` record from either `JAKOBSON PARIS` or `JAKOBSON SAINT-TROPEZ`.
- Fetches the linked client and artwork.
- Generates a one-page A4 PDF in the same spirit as `FACT_119_CARAVAGGIO_LARISA_SAFARYAN.pdf`.
- Adds the artwork image when the artwork record contains an attachment.
- Attaches the generated PDF back to the Airtable sale record.
- Marks the invoice as created when the matching checkbox exists.

## Environment Variables

Create these variables in Vercel:

```bash
AIRTABLE_TOKEN=pat_xxxxxxxxxxxxxxxxx
INVOICE_SECRET=change_this_long_secret
PUBLIC_BASE_URL=https://your-vercel-project.vercel.app
```

`AIRTABLE_TOKEN` needs read/write access to:

- `JAKOBSON PARIS`
- `JAKOBSON SAINT-TROPEZ`

## Airtable Automation Setup

Create one automation in each base.

### Paris

Trigger:

- Table: `ACHATS`
- When record matches conditions:
- `Lancer facture` is checked

Action:

- Run script

Script:

```javascript
const recordId = input.config().recordId;
const secret = input.config().secret;
const baseKey = "paris";
const url = `https://YOUR-VERCEL-URL.vercel.app/api/create-invoice?base=${baseKey}&recordId=${recordId}&token=${secret}`;

const response = await fetch(url, { method: "POST" });
if (!response.ok) {
  throw new Error(await response.text());
}
console.log(await response.text());
```

Input variables:

- `recordId` = Airtable record ID from the trigger.
- `secret` = the same value as `INVOICE_SECRET`.

### Saint-Tropez

Trigger:

- Table: `ACHATS`
- When record matches conditions:
- `Créer facture PRO` is checked

Action script:

```javascript
const recordId = input.config().recordId;
const secret = input.config().secret;
const baseKey = "saint-tropez";
const url = `https://YOUR-VERCEL-URL.vercel.app/api/create-invoice?base=${baseKey}&recordId=${recordId}&token=${secret}`;

const response = await fetch(url, { method: "POST" });
if (!response.ok) {
  throw new Error(await response.text());
}
console.log(await response.text());
```

Input variables:

- `recordId` = Airtable record ID from the trigger.
- `secret` = the same value as `INVOICE_SECRET`.

## Direct PDF Preview

Open this URL in a browser:

```text
https://YOUR-VERCEL-URL.vercel.app/api/invoice?base=paris&recordId=recXXXXXXXXXXXXXX&token=YOUR_SECRET
```

For Saint-Tropez:

```text
https://YOUR-VERCEL-URL.vercel.app/api/invoice?base=saint-tropez&recordId=recXXXXXXXXXXXXXX&token=YOUR_SECRET
```

## Notes

- Paris attachment field used: `PDF facture`.
- Saint-Tropez attachment field used: `certif/facture`.
- If no artwork image exists, the invoice is generated without image.
- The invoice number uses `N° FACT` when available. Otherwise it falls back to the Airtable record ID.
