// lib/pdf-generator.ts
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { db, storage, auth } from "@/integrations/firebase/client";
import { doc, getDoc } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { format } from "date-fns";

const PAGE_MARGIN = { left: 15, right: 15, top: 18, bottom: 18 };

// --- TYPE DEFINITIONS (from Bills.tsx/Cart.tsx) ---
// (These should ideally be in a shared types file)
interface Order {
  id: string;
  user_id?: string;
  customer_id: string;
  // --- UPDATED Customer Fields ---
  customer_name: string; // Contact person name
  customer_title: string | null; // NEW
  customer_business_name: string | null; // NEW
  // -------------------------------
  customer_identifier: string;
  total_amount: number;
  total_parts_subtotal?: number;
  labor_cost?: number;
  other_costs?: { description: string, amount: number }[];
  discount_amount?: number;
  discount_percentage?: number;
  // Handle both Timestamp objects and Date objects
  invoice_date?: { toDate: () => Date } | null;
  bill_type?: "normal" | "gst";
  payment_method?: "cash" | "card" | "credit";
  customer_gst_number?: string | null;
}

interface OrderItem {
  part_name: string;
  hsn_code?: string | null;
  quantity: number;
  price: number; // This is the final price per unit (incl. tax if applicable)
  selling_price: number; // This is the base price per unit (excl. tax)
  sgst_percentage: number;
  cgst_percentage: number;
}

// --- UPDATED: Customer Interface ---
interface Customer {
  id: string;
  customer_id: string | null;
  title: string | null; // e.g., Mr., Mrs.
  name: string; // This is now the Contact Person's Name
  phone: string | null;
  email: string | null;
  address: string | null;
  is_business: boolean; // Toggle
  business_name: string | null; // Business Name
  gst_number: string | null; // This is now Business GST
  created_at?: { toDate: () => Date };
  user_id: string;
}

interface BusinessSettings {
  business_name?: string;
  owner_name?: string;
  address?: string;
  gstin?: string;
  contact_phone?: string;
  contact_email?: string;
  logo_url?: string | null;
  bill_notes?: string;
  bill_terms?: string;
  show_logo?: boolean;
  show_gst_details?: boolean;
}

// --- HELPER FUNCTIONS ---

/**
 * Sanitizes a string by removing newlines and trimming whitespace.
 * @param str The string to sanitize
 * @returns A cleaned string
 */
const s = (str: any): string => {
  return str ? String(str).replace(/(\r\n|\n|\r)/gm, " ").trim() : "";
};

/**
 * A safe way to format currency
 * @param num The number to format
 * @returns A string formatted as "1,234.00"
 */
const fNum = (num: any): string => {
  return Number(num || 0).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

/**
 * Fetches an image from a URL and converts it to a Base64 string.
 * This is necessary for jsPDF to embed the image.
 * @param url The URL of the image
 * @returns A promise that resolves with the Base64 data URL or null
 */
const getLogoBase64 = (url: string): Promise<string | null> => {
  return new Promise((resolve) => {
    // Use fetch to get the image as a blob
    fetch(url)
      .then(response => {
        if (!response.ok) {
          throw new Error(`Failed to fetch logo, status ${response.status}`);
        }
        return response.blob();
      })
      .then(blob => {
        // Use FileReader to convert blob to Base64
        const reader = new FileReader();
        reader.onloadend = () => {
          resolve(reader.result as string);
        };
        reader.onerror = (error) => {
          console.error("FileReader error:", error);
          resolve(null);
        };
        reader.readAsDataURL(blob);
      })
      .catch(error => {
        console.error("Error fetching or reading logo:", error);
        resolve(null); // Resolve with null on any error
      });
  });
};


/**
 * Fetches the user's business settings from Firestore
 */
const getBusinessSettings = async (userId: string): Promise<BusinessSettings> => {
  if (!userId) return {};
  try {
    const docRef = doc(db, "business_settings", userId);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      return docSnap.data() as BusinessSettings;
    }
    return {};
  } catch (error) {
    console.error("Error fetching business settings:", error);
    return {}; // Return empty object on error
  }
};

/**
 * REFACTORED: Adds the main header (Logo on Left, Business Details on Right)
 */
const addHeader = async (
  doc: jsPDF,
  settings: BusinessSettings
) => {
  const pageWidth = doc.internal.pageSize.width;
  const pageHeight = doc.internal.pageSize.height;
  let logoEndY = PAGE_MARGIN.top;

  // --- 1. LOGO (Left Aligned) ---
  const hasLogo = settings.show_logo && settings.logo_url;
  if (hasLogo) {
    const logoData = await getLogoBase64(settings.logo_url!);
    if (logoData) {
      try {3
        // --- MODIFIED: Increased logo size ---
        const logoWidth = 55;
        const logoHeight = 25;
        doc.addImage(logoData, 'JPEG', PAGE_MARGIN.left, PAGE_MARGIN.top, logoWidth, logoHeight);
        logoEndY = PAGE_MARGIN.top + logoHeight;
      } catch (e) {
        console.error("Error adding logo to PDF:", e);
      }
    }
  }

  // --- 2. BUSINESS DETAILS (Right Aligned) ---
  const rightAlignX = pageWidth - PAGE_MARGIN.right;
  let textEndY = PAGE_MARGIN.top;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  doc.text(s(settings.business_name || "My Garage"), rightAlignX, textEndY, { align: "right" });
  textEndY += 8; // Extra space after name

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);

  // Add Owner Name
  if (settings.owner_name) {
    doc.text(s(settings.owner_name), rightAlignX, textEndY, { align: "right" });
    textEndY += 4;
  }
  
  // Add Owner Phone
  if (settings.contact_phone) {
    doc.text(`Phone: ${s(settings.contact_phone)}`, rightAlignX, textEndY, { align: "right" });
    textEndY += 4;
  }

  // Add Address
  const addressLines = doc.splitTextToSize(s(settings.address), 80); // 80mm width
  doc.text(addressLines, rightAlignX, textEndY, { align: "right" });
  textEndY += (addressLines.length * 4);

  // Add GSTIN
  if (settings.gstin && settings.show_gst_details) {
    doc.setFont("helvetica", "bold");
    doc.text(`GSTIN: ${s(settings.gstin)}`, rightAlignX, textEndY, { align: "right" });
    textEndY += 4;
  }

  // --- 3. SLEEK LINE BREAK ---
  const finalHeaderY = Math.max(logoEndY, textEndY) + 5; // Find lowest point + 5mm padding
  // --- MODIFIED: Bolder, black line ---
  doc.setDrawColor(0); // Black line
  doc.setLineWidth(0.5); // Bolder
  doc.line(PAGE_MARGIN.left, finalHeaderY, pageWidth - PAGE_MARGIN.right, finalHeaderY);

  // --- MODIFIED: Added more space after line ---
  return finalHeaderY + 12; // Return Y pos after the line + 12mm padding
};

/**
 * REFACTORED: Adds Customer Details (Left) and Invoice Details (Right)
 */
const addMetaInfo = (
  doc: jsPDF,
  customer: Customer,
  order: Order,
  startY: number
) => {
  const pageWidth = doc.internal.pageSize.width;
  
  // --- 1. CUSTOMER DETAILS (Left Aligned) ---
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.text("BILL TO:", PAGE_MARGIN.left, startY);

  doc.setFont("helvetica", "normal");
  let customerInfoY = startY + 5;
  
  // --- UPDATED: Show Business Name or Contact Name ---
  if (customer.is_business && customer.business_name) {
    doc.setFont("helvetica", "bold");
    doc.text(s(customer.business_name), PAGE_MARGIN.left, customerInfoY);
    customerInfoY += 5;
    doc.setFont("helvetica", "normal");
    doc.text(`Attn: ${s(customer.title)} ${s(customer.name)}`, PAGE_MARGIN.left, customerInfoY);
    customerInfoY += 5;
  } else {
    doc.setFont("helvetica", "bold");
    doc.text(`${s(customer.title)} ${s(customer.name)}`, PAGE_MARGIN.left, customerInfoY);
    customerInfoY += 5;
  }

  doc.setFont("helvetica", "normal");
  doc.text(`ID: ${s(customer.customer_id)}`, PAGE_MARGIN.left, customerInfoY);
  customerInfoY += 5;

  if (customer.phone) {
    doc.text(`Phone: ${s(customer.phone)}`, PAGE_MARGIN.left, customerInfoY);
    customerInfoY += 5;
  }
  if (customer.address) {
    const addressLines = doc.splitTextToSize(s(customer.address), 80); // Wrap at 80 units
    doc.text(`Address: ${(addressLines)}`, PAGE_MARGIN.left, customerInfoY);
    customerInfoY += addressLines.length * 5; // Adjust Y based on address lines
  }
  if (customer.gst_number) {
    doc.setFont("helvetica", "bold");
    doc.text(`GSTIN: ${s(customer.gst_number)}`, PAGE_MARGIN.left, customerInfoY);
    customerInfoY += 5;
  }

  // --- 2. INVOICE DETAILS (Right Aligned) ---
  const rightAlignX = pageWidth - PAGE_MARGIN.right;
  let invoiceInfoY = startY;

  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  const billTitle = order.bill_type === 'gst' ? "TAX INVOICE" : "INVOICE";
  doc.text(billTitle, rightAlignX, invoiceInfoY, { align: "right" });
  invoiceInfoY += 9; // +9mm gap

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text(`Invoice #: ${s(order.id)}`, rightAlignX, invoiceInfoY, { align: "right" });
  invoiceInfoY += 5;
  
  const invoiceDate = order.invoice_date?.toDate
    ? format(order.invoice_date.toDate(), "dd/MM/yyyy")
    : "N/A";
  doc.text(`Date: ${invoiceDate}`, rightAlignX, invoiceInfoY, { align: "right" });
  
  // Return the lowest Y point from both columns
  return Math.max(customerInfoY, invoiceInfoY) + 6; // +6mm padding
};


/**
 * Adds the main table of items
 */
const addItemsTable = (
  doc: jsPDF,
  order: Order,
  items: OrderItem[],
  startY: number
) => {
  if (!items || items.length === 0) {
    return startY;
  }

  const isGstBill = order.bill_type === "gst";
  
  let head: string[][];
  let columnStyles: any;

  if (!isGstBill) {
    // --- Non-GST Bill ---
    head = [["S.No.", "Description", "HSN", "Qty", "Rate", "Amount"]];
    // Total usable width = 210 - 15 - 15 = 180mm
    columnStyles = {
        0: { halign: "center", cellWidth: 12 },  // S.No.
        1: { cellWidth: 75 },                   // Description
        2: { cellWidth: 25, halign: "center" }, // HSN
        3: { cellWidth: 15, halign: "center" }, // Qty
        4: { cellWidth: 25, halign: "right" },  // Rate
        5: { cellWidth: 30, halign: "right" },  // Amount
    }; // Total: 180mm
  } else {
    // --- GST Bill ---
    head = [[
      "S.NO.",
      "Description",
      "HSN",
      "Qty",
      "Rate",
      "Taxable Amount",
      "SGST",
      "CGST",
      "Amount",
    ]];
    // --- FIX: Re-calibrated widths to fit 180mm and fix cutoff ---
    columnStyles = {
      0: {cellWidth: 12, halign: "center"},   // S.NO. (10)
      1: { cellWidth: 42 },                   // Description (42)
      2: { cellWidth: 20, halign: "center" }, // HSN (20)
      3: { cellWidth: 10, halign: "center" }, // Qty (10)
      4: { cellWidth: 20, halign: "right" },  // Rate (20)
      5: { cellWidth: 22, halign: "right" },  // Taxable Amount (22)
      6: { cellWidth: 15, halign: "right" },  // SGST (15)
      7: { cellWidth: 15, halign: "right" },  // CGST (15)
      8: { cellWidth: 26, halign: "right" },  // Amount (26)
    }; // Total: 180mm
  }

  // Prepare body data
  const body = items.map((item, index) => {
    const basePrice = item.selling_price;
    const taxableAmt = basePrice * item.quantity;
    
    if (!isGstBill) {
      // Non-GST row
      return [
        index + 1,
        s(item.part_name),
        s(item.hsn_code),
        item.quantity,
        fNum(basePrice),
        fNum(taxableAmt), // For non-GST, amount is the taxable amount
      ];
    }

    // --- GST Bill Row ---
    const sgstAmt = (taxableAmt * item.sgst_percentage) / 100;
    const cgstAmt = (taxableAmt * item.cgst_percentage) / 100;
    const total = taxableAmt + sgstAmt + cgstAmt;

    // --- FIX: Added index + 1 for S.NO. column ---
    return [
      index + 1,
      s(item.part_name),
      s(item.hsn_code),
      item.quantity,
      fNum(basePrice),
      fNum(taxableAmt),
      fNum(sgstAmt),
      fNum(cgstAmt),
      fNum(total),
    ];
  });

  // --- Draw the table ---
  autoTable(doc, {
    head,
    body,
    startY,
    margin: { left: PAGE_MARGIN.left, right: PAGE_MARGIN.right },
    pageBreak: "auto",
    tableWidth: "auto", // Let autoTable handle width based on styles
    theme: "grid",
    styles: {
      overflow: "linebreak",
      cellPadding: 1,
      fontSize: 9,
      lineWidth: 0.05, // thinner lines
      textColor: [40, 40, 40]
    },
    headStyles: {
      fillColor: [250, 250, 250], // almost white
      textColor: [0, 0, 0],
      fontStyle: "bold",
      lineWidth: 0.05,
      fillOpacity: 1
    },
    alternateRowStyles: {
      fillColor: [255, 255, 255] // remove grey stripes
    },

    columnStyles,
  });



  // @ts-ignore
  return doc.lastAutoTable.finalY + 4; // Apply new Y padding
};

/**
 * Adds the final totals section
 */
const addTotals = (
  doc: jsPDF,
  order: Order,
  items: OrderItem[],
  startY: number
) => {
  const isGstBill = order.bill_type === "gst";
  let currentY = startY; 
  const rightX = doc.internal.pageSize.width - PAGE_MARGIN.right; // Apply right margin
  const leftX = rightX - 45; 
  
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");

  // Calculate Subtotal (sum of all items' Taxable Amount)
  const subtotal = items.reduce(
    (acc, item) => acc + item.selling_price * item.quantity,
    0
  );
  doc.text("Subtotal:", leftX, currentY, { align: "right" });
  doc.text(fNum(subtotal), rightX, currentY, { align: "right" });
  currentY += 6;

  // Discount
  if (order.discount_amount && order.discount_amount > 0) {
    doc.text(`Discount (${order.discount_percentage || 0}%):`, leftX, currentY, { align: "right" });
    doc.text(`- ${fNum(order.discount_amount)}`, rightX, currentY, { align: "right" });
    currentY += 6;
  }
  
  // Labor Cost
  if (order.labor_cost && order.labor_cost > 0) {
    doc.text("Labor Cost:", leftX, currentY, { align: "right" });
    doc.text(fNum(order.labor_cost), rightX, currentY, { align: "right" });
    currentY += 6;
  }
  
  if (order.other_costs && order.other_costs.length > 0) {
    order.other_costs.forEach(cost => {
      if (cost.amount > 0) {
        doc.text(`${s(cost.description)}:`, leftX, currentY, { align: "right" });
        doc.text(fNum(cost.amount), rightX, currentY, { align: "right" });
        currentY += 6;
      }
    });
  }
  
  // GST (if applicable)
  if (isGstBill) {
    const totalCGST = items.reduce((acc, item) => acc + (item.selling_price * item.quantity * item.cgst_percentage) / 100, 0);
    const totalSGST = items.reduce((acc, item) => acc + (item.selling_price * item.quantity * item.sgst_percentage) / 100, 0);
    const totalGST = totalCGST + totalSGST;

    doc.text("Total GST:", leftX, currentY, { align: "right" });
    doc.text(fNum(totalGST), rightX, currentY, { align: "right" });
    currentY += 6;
  }

  // Grand Total
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  // --- MODIFIED: Bolder, black line ---
  doc.setDrawColor(0); // Black line
  doc.setLineWidth(0.35);
  doc.line(leftX - 10, currentY, rightX, currentY); // Horizontal line
  currentY += 6;

  doc.text("GRAND TOTAL:", leftX, currentY, { align: "right" });
  doc.text(`Rs. ${fNum(order.total_amount)}`, rightX, currentY, { align: "right" });

  return currentY; // Return Y position after totals
};

/**
 * Adds the notes, terms, and final footer
 */
const addFooter = (
  doc: jsPDF,
  settings: BusinessSettings,
  startY: number
) => {
  let currentY = startY;
  const leftX = PAGE_MARGIN.left;
  const notesWidth = 120;
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");

  if (settings.bill_notes) {
    doc.setFont("helvetica", "bold");
    doc.text("Notes:", leftX, currentY);
    currentY += 4;
    doc.setFont("helvetica", "normal");
    const notesLines = doc.splitTextToSize(s(settings.bill_notes), notesWidth);
    doc.text(notesLines, leftX, currentY);
    currentY += (notesLines.length * 4) + 5;
  }

  if (settings.bill_terms) {
    doc.setFont("helvetica", "bold");
    doc.text("Terms & Conditions:", leftX, currentY);
    currentY += 4;
    doc.setFont("helvetica", "normal");
    const termsLines = doc.splitTextToSize(s(settings.bill_terms), notesWidth);
    doc.text(termsLines, leftX, currentY);
    currentY += (termsLines.length * 4) + 5;
  }
  
  // Signature area
  const sigY = Math.max(currentY + 10, doc.internal.pageSize.height - 55);

  // --- REMOVED Owner Name (it's in the header now) ---

  // --- MODIFIED: Bolder, black line ---
  doc.setDrawColor(0); // Black line
  doc.setLineWidth(0.5); // Bolder
  doc.line(
    doc.internal.pageSize.width - 60, // start a little left
    sigY - 3,
    doc.internal.pageSize.width - PAGE_MARGIN.right,
    sigY - 3
  );

  // Signature text
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(
    "Authorized Signatory",
    doc.internal.pageSize.width - PAGE_MARGIN.right,
    sigY + 2,
    { align: "right" }
  );

  // Final "Thank You"
  const finalFooterY = doc.internal.pageSize.height - 10;
  doc.setFontSize(10);
  doc.setFont("helvetica", "italic");
  doc.setTextColor(150);
  doc.text("Thank you for your business!", doc.internal.pageSize.width / 2, finalFooterY, { align: "center" });
};

// --- MAIN PDF GENERATION FUNCTION ---
export const generateBillPDF = async (
  order: Order,
  items: OrderItem[],
  customer: Customer
): Promise<Blob> => {
  try {
    const user = auth.currentUser;
    if (!user) throw new Error("User not authenticated.");

    // 1. Fetch Business Settings
    const settings = await getBusinessSettings(user.uid);

    // 2. Create new PDF Document (CHANGED TO MM)
    const doc = new jsPDF("p", "mm", "a4"); // Portrait, mm, A4 size

    // 3. Add Content (await header for logo)
    let currentY = await addHeader(doc, settings); // <-- REFACTORED
    currentY = addMetaInfo(doc, customer, order, currentY); // <-- NEW FUNCTION
    currentY = addItemsTable(doc, order, items, currentY + 5); // +5mm gap before table
    currentY = addTotals(doc, order, items, currentY + 10); // +10mm gap before totals
    addFooter(doc, settings, currentY + 12); // +12mm gap before footer

    // 4. Return the PDF as a Blob
    return doc.output("blob");
  } catch (error) {
    console.error("Error generating PDF:", error);
    throw error;
  }
};

// --- PDF UPLOAD FUNCTION ---
export const uploadBillPDF = async (
  pdfBlob: Blob,
  userId: string,
  orderId: string
): Promise<string> => {
  if (!userId || !orderId) {
    throw new Error("User ID and Order ID are required for upload.");
  }
  try {
    // Create a unique file path
    const filePath = `users/${userId}/bills/Invoice-${orderId}.pdf`;
    const storageRef = ref(storage, filePath);

    // Upload the file
    const snapshot = await uploadBytes(storageRef, pdfBlob, {
      contentType: "application/pdf",
    });

    // Get the download URL
    const downloadURL = await getDownloadURL(snapshot.ref);
    return downloadURL;
  } catch (error: any) {
    console.error("Error uploading PDF to Firebase Storage:", error);
    throw new Error("Could not upload PDF.");
  }
};