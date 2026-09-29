import { createInvoicePdf } from "../lib/pdf.js";
import { invoiceFilename, loadInvoiceData } from "../lib/invoice-data.js";

function assertSecret(req) {
  const url = new URL(req.url, "https://local");
  const token = url.searchParams.get("token");
  if (!process.env.INVOICE_SECRET || token !== process.env.INVOICE_SECRET) {
    const error = new Error("Unauthorized");
    error.statusCode = 401;
    throw error;
  }
}

export default async function handler(req, res) {
  try {
    assertSecret(req);

    const url = new URL(req.url, "https://local");
    const base = url.searchParams.get("base") || "paris";
    const recordId = url.searchParams.get("recordId");

    if (!recordId) {
      res.status(400).send("Missing recordId.");
      return;
    }

    const data = await loadInvoiceData(base, recordId);
    const pdf = await createInvoicePdf(data);
    const filename = invoiceFilename(data);

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="${filename}"`);
    res.setHeader("Cache-Control", "no-store");
    res.status(200).send(Buffer.from(pdf));
  } catch (error) {
    res.status(error.statusCode || 500).send(error.message || "Invoice generation failed.");
  }
}
