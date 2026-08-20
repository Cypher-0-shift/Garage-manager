import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

// Tailwind class merge helper (your original function)
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// =======================================
// FALLBACK INVOICE GENERATOR (A4 Format)
// =======================================

import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

export const generateFallbackInvoice = ({
  business,
  customer,
  items,
  invoiceNumber,
  date,
  gstEnabled = true,
  notes = "",
  terms = "",
}) => {
  const doc = new jsPDF("p", "mm", "a4");

  // HEADER
  if (business.show_logo && business.logo_url) {
    try {
      doc.addImage(business.logo_url, "PNG", 14, 10, 28, 28);
    } catch {}
    doc.setFontSize(18).setFont("helvetica", "bold");
    doc.text(business.business_name, 45, 18);
  } else {
    doc.setFontSize(20).setFont("helvetica", "bold");
    doc.text(business.business_name, 14, 18);
  }

  doc.setFontSize(10).setFont("helvetica", "normal");
  if (business.address) doc.text(business.address, 14, 26);
  if (business.contact_phone) doc.text(`Phone: ${business.contact_phone}`, 14, 31);
  if (business.contact_email) doc.text(`Email: ${business.contact_email}`, 14, 36);
  if (business.show_gst_details && business.gstin)
    doc.text(`GSTIN: ${business.gstin}`, 14, 41);

  doc.setFontSize(20).setFont("helvetica", "bold");
  doc.text("INVOICE", 160, 18);

  doc.setFontSize(10).setFont("helvetica", "normal");
  doc.text(`Invoice #: ${invoiceNumber}`, 160, 26);
  doc.text(`Date: ${date}`, 160, 31);

  // CUSTOMER DETAILS
  doc.setFont("helvetica", "bold").setFontSize(12);
  doc.text("Bill To:", 14, 55);
  doc.setFont("helvetica", "normal").setFontSize(10);
  doc.text(customer.name || "-", 14, 61);
  if (customer.phone) doc.text(`Phone: ${customer.phone}`, 14, 66);
  if (customer.gstin && business.show_gst_details)
    doc.text(`Customer GSTIN: ${customer.gstin}`, 14, 71);

  // ITEM TABLE
  const rows = items.map((item, i) => [
    i + 1,
    item.name,
    item.hsn || "-",
    item.qty,
    item.rate.toFixed(2),
    (item.qty * item.rate).toFixed(2),
  ]);

  autoTable(doc, {
    startY: 80,
    head: [["S.No", "Description", "HSN", "Qty", "Rate (₹)", "Total (₹)"]],
    body: rows,
    styles: { fontSize: 10 },
    headStyles: { fillColor: [240, 240, 240], fontStyle: "bold" },
    columnStyles: {
      0: { cellWidth: 12 },
      1: { cellWidth: 70 },
      2: { cellWidth: 25 },
      3: { cellWidth: 18, halign: "center" },
      4: { cellWidth: 28, halign: "right" },
      5: { cellWidth: 28, halign: "right" },
    },
  });

  const y = (doc as any).lastAutoTable.finalY + 10;

  // TOTALS
  const subtotal = items.reduce((s, i) => s + i.qty * i.rate, 0);
  const tax = gstEnabled ? subtotal * 0.18 : 0;
  const cgst = tax / 2;
  const sgst = tax / 2;
  const grandTotal = subtotal + tax;

  doc.setFontSize(11).setFont("helvetica", "bold");
  doc.text("Subtotal:", 140, y);
  doc.text(`₹${subtotal.toFixed(2)}`, 175, y, { align: "right" });

  if (gstEnabled) {
    doc.text("CGST (9%):", 140, y + 6);
    doc.text(`₹${cgst.toFixed(2)}`, 175, y + 6, { align: "right" });

    doc.text("SGST (9%):", 140, y + 12);
    doc.text(`₹${sgst.toFixed(2)}`, 175, y + 12, { align: "right" });
  }

  doc.setFontSize(12).setFont("helvetica", "bold");
  doc.text("Grand Total:", 140, y + 20);
  doc.text(`₹${grandTotal.toFixed(2)}`, 175, y + 20, { align: "right" });

  // NOTES / TERMS
  doc.setFontSize(10).setFont("helvetica", "normal");
  if (notes) doc.text(`Notes: ${notes}`, 14, y + 35);
  if (terms) doc.text(`Terms: ${terms}`, 14, y + 43);

  // SIGNATURE
  doc.setFontSize(10);
  doc.text("Authorized Signatory", 150, y + 55);

  doc.save(`invoice-${invoiceNumber}.pdf`);
};
