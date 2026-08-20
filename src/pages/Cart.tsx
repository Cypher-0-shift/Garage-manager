// Cart.tsx
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { db, auth } from "@/integrations/firebase/client";
import {
  collection,
  query,
  orderBy,
  onSnapshot,
  doc,
  addDoc,
  updateDoc,
  writeBatch,
  where,
  serverTimestamp,
  Timestamp,
  getDoc,
  getDocs,
  limit,
  runTransaction,
} from "firebase/firestore";
import { onAuthStateChanged, User } from "firebase/auth";
import { format } from "date-fns";
import { DateRange } from "react-day-picker";
import { generateFallbackInvoice } from "@/lib/utils";

import { useCart } from "@/context/CartContext";
import { useCheckout } from "@/context/CheckoutContext"; // <-- IMPORT CHECKOUT CONTEXT
import { toast as sonnerToast } from "sonner";

// Import all your UI components
import { CustomerComboBox } from "@/components/ui/customer-combobox";
import Navigation from "@/components/Navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Separator } from "@/components/ui/separator";
// --- REMOVED ScrollArea, we use native scroll ---
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import {
  FileText, Plus, Trash2, DollarSign, Download, MessageCircle, Mail, Check, Minus, Edit, Loader2, Users, Receipt, CreditCard, ClipboardList, UserPlus, X, MoreVertical, Eye,
  Search, Filter, ArrowUpDown, XCircle, CalendarIcon, Info, ShoppingCart,
  Copy, // --- 1. ADDED Copy ICON ---
  Briefcase, // --- NEW: Added for business
  User as UserIcon, // --- NEW: Added for individual
} from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
// --- 2. IMPORT NEW PDF GENERATOR ---
import { generateBillPDF, uploadBillPDF } from "@/lib/pdf-generator";
import { Switch } from "@/components/ui/switch"; // --- NEW: Added Switch

/* --------------------------
   Types / Interfaces
   -------------------------- */
// --- UPDATED: Customer Interface ---
interface Customer {
  id: string;
  customer_id: string;
  title: string | null; // e.g., Mr., Mrs.
  name: string; // This is now the Contact Person's Name
  phone?: string | null;
  address?: string | null;
  is_business: boolean; // Toggle
  business_name: string | null; // Business Name
  user_id: string;
  created_at?: Timestamp | null;
  gst_number?: string | null; // This is now Business GST
}
interface StockItem {
  id: string;
  part_name: string;
  selling_price: number;
  buying_price: number;
  sgst_percentage: number;
  cgst_percentage: number;
  quantity: number;
  image_url?: string | null;
  user_id: string;
  created_at?: Timestamp | null;
  hsn_code?: string;
  car_company?: string | null;
  car_model?: string | null;
  vehicle_type?: string | null;
  low_stock_threshold?: number;
}
interface OrderItem {
  stock_id: string;
  part_name: string;
  hsn_code?: string | null;
  quantity: number;
  price: number;
  buying_price: number;
  selling_price: number;
  sgst_percentage: number;
  cgst_percentage: number;
  subtotal: number;
  sgst_amount: number;
  cgst_amount: number;
  total_gst: number;
}

// --- 3. UPDATED Order INTERFACE ---
interface OtherCost {
  description: string;
  amount: number;
}
interface Order {
  id: string;
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
  other_costs?: OtherCost[]; // <-- ADDED
  discount_amount?: number;
  discount_percentage?: number;
  total_buying_price?: number;
  total_selling_price?: number;
  profit_amount?: number;
  invoice_date?: Timestamp | null;
  created_at?: Timestamp | null;
  user_id?: string;
  bill_type?: "normal" | "gst";
  payment_method?: "cash" | "card" | "credit";
  customer_gst_number?: string | null;
}
// ---------------------------------

interface Udhaari {
  id?: string;
  user_id: string;
  customerId: string;
  name: string;
  totalPending: number;
  lastUpdated: Timestamp | null;
  history: {
    billId: string;
    amount: number;
    date: Timestamp;
    description?: string;
  }[];
}

// --- NEW: Form Data Interface ---
interface CustomerFormData {
  title: string;
  name: string;
  phone: string;
  email: string;
  address: string;
  customer_id: string;
  is_business: boolean;
  business_name: string;
  gst_number: string;
}

/* --------------------------
   Component
   -------------------------- */
const Cart: React.FC = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { cartItems } = useCart(); // Get items from the global cart

  // --- ALL CHECKOUT STATE COMES FROM CONTEXT ---
  const {
    step,
    setStep,
    orderItems,
    setOrderItems,
    selectedCustomer,
    setSelectedCustomer,
    billType,
    setBillType,
    invoiceDate,
    setInvoiceDate,
    laborCost,
    setLaborCost,
    discountPercentage,
    setDiscountPercentage,
    paymentMethod,
    setPaymentMethod,
    newlyCreatedOrderId,
    setNewlyCreatedOrderId,
    startCheckout,
    cancelCheckout,
    addMoreItems,
  } = useCheckout();

  // --- Local states for this page (to fetch data) ---
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [stock, setStock] = useState<StockItem[]>([]);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  
  // Local states for UI interactions
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editPrice, setEditPrice] = useState<string>("");
  const [confirmZeroItem, setConfirmZeroItem] = useState<OrderItem | null>(null);
  const [creatingBill, setCreatingBill] = useState<boolean>(false);
  const [isSharing, setIsSharing] = useState<boolean>(false);

  // --- 4. ADDED STATE FOR OTHER COSTS ---
  const [otherCosts, setOtherCosts] = useState<{ id: string, description: string, amount: string }[]>([]);
  // -------------------------------------

  const customerDetails = useMemo(() => customers.find((c) => c.id === selectedCustomer) || null, [customers, selectedCustomer]);

  // --- Firebase Data Fetching (to get stock/customers) ---
  const fetchRealtimeData = useCallback(
    <T extends { id: string }>(
      collectionName: string,
      userId: string,
      setState: React.Dispatch<React.SetStateAction<T[]>>,
      queryModifier?: (q: any) => any
    ) => {
      const colRef = collection(db, collectionName);
      let qRef: any = query(colRef, where("user_id", "==", userId), orderBy("created_at", "desc"));
      if (queryModifier) qRef = queryModifier(qRef);

      const unsub = onSnapshot(
        qRef,
        (qs) => {
          const dataList: T[] = [];
          qs.forEach((d) => dataList.push({ id: d.id, ...d.data() } as T));
          setState(dataList);
          setLoading(false); // Set loading false after data is fetched
        },
        (err) => {
          console.error(`Error fetching ${collectionName}:`, err);
          toast({ title: `Error Fetching ${collectionName}`, description: err.message || "Failed to fetch.", variant: "destructive" });
          setLoading(false);
        }
      );
      return unsub;
    },
    [toast]
  );

  useEffect(() => {
    let unsubCustomers: (() => void) | null = null;
    let unsubStock: (() => void) | null = null;

    const authUnsub = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
      if (user) {
        setLoading(true);
        unsubCustomers = fetchRealtimeData<Customer>("customers", user.uid, setCustomers);
        unsubStock = fetchRealtimeData<StockItem>("stock", user.uid, setStock);
      } else {
        setCustomers([]);
        setStock([]);
        setLoading(false);
        if (unsubCustomers) unsubCustomers();
        if (unsubStock) unsubStock();
      }
    });

    return () => {
      authUnsub();
      if (unsubCustomers) unsubCustomers();
      if (unsubStock) unsubStock();
    };
  }, [fetchRealtimeData]);


  // --- **CRITICAL LOGIC** ---
  // This effect watches for the dependencies needed to start a checkout.
  // If the user lands on /cart and checkout hasn't started (step === 0),
  // but they *do* have items in their global cart, this will
  // automatically initialize the checkout process.
  useEffect(() => {
    // Only start if:
    // 1. We have stock data (to check against)
    // 2. Checkout isn't already in progress (step === 0)
    // 3. The global cart actually has items
    if (stock.length > 0 && step === 0 && cartItems.length > 0) {
      startCheckout(cartItems, stock);
    }
  }, [stock, cartItems, step, startCheckout]);

  // This handles adding more items from the /parts page
  useEffect(() => {
    // If checkout IS in progress (step > 0)
    // and stock is loaded
    // we can add more items
    if (stock.length > 0 && step > 0 && step < 5) {
      // addMoreItems will compare cartItems with orderItems
      // and add any new ones.
      addMoreItems(cartItems, stock);
    }
    // We only want this to run when cartItems changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cartItems, stock]); 
  
  // Recalculate item prices when bill type changes
  useEffect(() => {
    if (orderItems.length === 0 || editingItemId) return;
    
    setOrderItems((prev) =>
      prev.map((item) => {
        const basePrice = item.selling_price;
        const sgst = (basePrice * item.sgst_percentage) / 100;
        const cgst = (basePrice * item.cgst_percentage) / 100;
        const totalGst = sgst + cgst;
        const finalPrice = billType === "gst" ? basePrice + totalGst : basePrice;
        
        return {
          ...item,
          price: finalPrice,
          subtotal: finalPrice * item.quantity,
        };
      })
    );
  }, [billType, editingItemId, orderItems.length, setOrderItems]);
  
  // --- 5. MOVED CALCULATION useMemo UP ---
  // This is now declared *before* any handlers that use its values.
  const { 
    totalAmount, 
    totalGST, 
    totalPartsSubtotal,
    profitAmount, 
    totalSellingPriceBase,
    totalBuyingPrice, 
    effectiveDiscountAmount,
    totalOtherCosts, // <-- ADDED
  } = useMemo(() => {
    // Use `parseFloat... || 0` to safely handle "" as 0
    const labor = parseFloat(laborCost) || 0;
    const discountPerc = parseFloat(discountPercentage) || 0;
    
    // Calculate total from "other costs"
    const runningTotalOtherCosts = otherCosts.reduce((acc, cost) => {
      return acc + (parseFloat(cost.amount) || 0);
    }, 0);

    let runningTotalSellingPriceBase = 0;
    let runningTotalBuyingPrice = 0;
    
    orderItems.forEach((item) => {
      runningTotalSellingPriceBase += (item.selling_price || 0) * (item.quantity || 0);
      runningTotalBuyingPrice += (item.buying_price || 0) * (item.quantity || 0);
    });
    
    const discountOn = runningTotalSellingPriceBase;
    const discountValue = (discountOn * discountPerc) / 100;
    const effectiveDiscountAmount = Math.min(discountValue, discountOn);
    const discountedPartsTotal = runningTotalSellingPriceBase - effectiveDiscountAmount;

    let runningTotalGST = 0;
    if (billType === "gst") {
      orderItems.forEach((item) => {
        const itemBasePrice = (item.selling_price || 0);
        const itemDiscountedBasePrice = itemBasePrice * (1 - (discountPerc / 100));
        const sgst = (itemDiscountedBasePrice * (item.sgst_percentage || 0)) / 100;
        const cgst = (itemDiscountedBasePrice * (item.cgst_percentage || 0)) / 100;
        runningTotalGST += (sgst + cgst) * item.quantity;
      });
    }
    
    // Add labor and other costs to the final total
    const finalTotalAmount = discountedPartsTotal + runningTotalGST + labor + runningTotalOtherCosts;
    
    // *** THIS IS THE FIX ***
    // Use `runningTotalBuyingPrice` which was calculated above
    const runningProfitAmount = discountedPartsTotal + labor + runningTotalOtherCosts - runningTotalBuyingPrice;
    // *** END FIX ***

    const totalPartsSubtotalWithTax = discountedPartsTotal + runningTotalGST;

    return {
      totalAmount: finalTotalAmount,
      totalGST: runningTotalGST,
      totalPartsSubtotal: totalPartsSubtotalWithTax,
      profitAmount: runningProfitAmount,
      totalSellingPriceBase: runningTotalSellingPriceBase,
      totalBuyingPrice: runningTotalBuyingPrice,
      effectiveDiscountAmount: effectiveDiscountAmount,
      totalOtherCosts: runningTotalOtherCosts, // <-- EXPORTED
    };
  }, [orderItems, billType, laborCost, discountPercentage, otherCosts]); // <-- ADDED otherCosts
  // --- END MOVED BLOCK ---


  // --- All handlers now use setOrderItems from context ---
  const handleUpdateQuantity = (stock_id: string, newQuantity: number) => {
    const numQty = Number(newQuantity);
    
    if (isNaN(numQty)) {
      sonnerToast.error("Invalid quantity");
      return;
    }

    const itemToUpdate = orderItems.find((i) => i.stock_id === stock_id);
    if (!itemToUpdate) return;
    
    const stockItem = stock.find((s) => s.id === stock_id);
    const maxStock = stockItem?.quantity ?? 0;

    if (numQty > maxStock) {
      sonnerToast.warning("Stock Limit Reached", {
        description: `Only ${maxStock} units available in stock.`
      });
      return;
    }

    if (numQty <= 0) {
      setConfirmZeroItem(itemToUpdate);
      return;
    }

    setOrderItems((prev) =>
      prev.map((item) => {
        if (item.stock_id !== stock_id) return item;
        return { ...item, quantity: numQty };
      })
    );
  };
  
  const updateItemPrice = (stock_id: string) => {
    const newPriceNum = parseFloat(editPrice);
    if (isNaN(newPriceNum) || newPriceNum < 0) {
      toast({ title: "Invalid Price", description: "Enter a valid positive price.", variant: "destructive" });
      return;
    }

    setOrderItems((prev) =>
      prev.map((it) => {
        if (it.stock_id !== stock_id) return it;
        return { ...it, selling_price: newPriceNum };
      })
    );

    setEditingItemId(null);
    setEditPrice("");
    toast({ title: "Price Updated", description: "Item price updated. Bill recalculating." });
  };

  const removeItemFromOrder = (stock_id: string) => {
    setOrderItems((prev) => prev.filter((i) => i.stock_id !== stock_id));
    toast({ title: "Item Removed" });
  };
  
  // --- `useMemo` block was here, but is now moved up ---

  // --- Customer/Bill Creation Logic (uses context state) ---
  const generateNextCustomerId = async (userId: string): Promise<string> => {
    try {
      const customersRef = collection(db, "customers");
      const q = query(customersRef, where("user_id", "==", userId), orderBy("created_at", "desc"), limit(1));
      const snapshot = await getDocs(q);
      if (snapshot.empty) return "CUST-1001";
      const lastCustomer = snapshot.docs[0].data() as Customer;
      const lastId = lastCustomer.customer_id || "CUST-1000";
      const num = parseInt(lastId.split("-")[1] || "1000", 10);
      return `CUST-${num + 1}`;
    } catch (err) {
      console.error("Error generating customer id:", err);
      return `CUST-${Math.floor(1000 + Math.random() * 9000)}`;
    }
  };

  // --- REPLACED `handleSaveNewCustomer` ---
  // This function is now defined inside the NewCustomerDialog
  // The prop passed to CheckoutStep2 is now just `currentUser`
  // ----------------------------------------
  
  // --- 6. UPDATED handleCreateBill ---
  const handleCreateBill = async (e?: React.FormEvent) => {
    e?.preventDefault?.();
    if (!currentUser) return toast({ title: "Not signed in", description: "Sign in to create bills.", variant: "destructive" });
    if (!selectedCustomer) return toast({ title: "Select Customer", description: "Please choose a customer.", variant: "destructive" });
    // Allow creating a bill with only "other costs"
    if (orderItems.length === 0 && otherCosts.length === 0 && (parseFloat(laborCost) || 0) <= 0) {
      return toast({ title: "Empty Bill", description: "Add items or other costs to create a bill.", variant: "destructive" });
    }

    setCreatingBill(true);
    const invoiceTimestamp = Timestamp.fromDate(new Date(invoiceDate + "T00:00:00"));
    const finalLaborCost = parseFloat(laborCost) || 0;
    const finalDiscountPerc = parseFloat(discountPercentage) || 0;

    // Sanitize otherCosts
    const finalOtherCosts = otherCosts
      .map(cost => ({ 
        description: cost.description.trim(), 
        amount: parseFloat(cost.amount) || 0 
      }))
      .filter(cost => cost.amount > 0 && cost.description); // Only save valid costs

    const orderRef = doc(collection(db, "orders"));
    setNewlyCreatedOrderId(orderRef.id); // This now updates context
    
    // --- UPDATED Order Data ---
    const orderData: Omit<Order, "id"> = {
      customer_id: selectedCustomer,
      customer_name: customerDetails?.name ?? "Unknown",
      customer_title: customerDetails?.title || null, // NEW
      customer_business_name: customerDetails?.business_name || null, // NEW
      customer_identifier: customerDetails?.customer_id ?? "N/A",
      total_amount: totalAmount,
      total_parts_subtotal: totalPartsSubtotal,
      labor_cost: finalLaborCost,
      other_costs: finalOtherCosts, // <-- ADDED
      discount_amount: effectiveDiscountAmount,
      discount_percentage: finalDiscountPerc,
      total_buying_price: totalBuyingPrice,
      total_selling_price: totalSellingPriceBase,
      profit_amount: profitAmount,
      invoice_date: invoiceTimestamp,
      created_at: serverTimestamp(),
      user_id: currentUser.uid,
      bill_type: billType,
      payment_method: paymentMethod,
      customer_gst_number: customerDetails?.gst_number || null, // This is now Business GST
    };
    // ------------------------
    
    try {
      // Recalculate order items with final discount
      const finalOrderItems = orderItems.map(item => {
        const itemBasePrice = (item.selling_price || 0);
        const itemDiscountedBasePrice = itemBasePrice * (1 - (finalDiscountPerc / 100));
        let sgst = 0, cgst = 0;
        if (billType === 'gst') {
          sgst = (itemDiscountedBasePrice * (item.sgst_percentage || 0)) / 100;
          cgst = (itemDiscountedBasePrice * (item.cgst_percentage || 0)) / 100;
        }
        const totalGst = sgst + cgst;
        const finalPrice = itemDiscountedBasePrice + totalGst;
        return {
          ...item,
          price: finalPrice,
          subtotal: finalPrice * item.quantity,
          sgst_amount: sgst * item.quantity,
          cgst_amount: cgst * item.quantity,
          total_gst: totalGst * item.quantity,
        };
      });

      // All DB logic (Udhaari, transactions)
      if (paymentMethod === "credit") {
        const udhaariCol = collection(db, "udhaari");
        const q = query(udhaariCol, where("user_id", "==", currentUser.uid), where("customerId", "==", selectedCustomer), limit(1));
        const qSnap = await getDocs(q);

        if (qSnap.empty) {
          await runTransaction(db, async (transaction) => {
            const udRef = doc(udhaariCol);
            const historyEntry = { billId: orderRef.id, amount: totalAmount, date: invoiceTimestamp, description: `Bill ${orderRef.id.substring(0, 8)}` };
            transaction.set(udRef, {
              user_id: currentUser.uid,
              customerId: selectedCustomer,
              // --- UPDATED Udhaari Name ---
              name: customerDetails?.is_business ? customerDetails.business_name : customerDetails?.name ?? "Unknown",
              totalPending: totalAmount,
              lastUpdated: serverTimestamp(),
              history: [historyEntry],
            });
            transaction.set(orderRef, orderData);
            for (const item of finalOrderItems) {
              const itemRef = doc(collection(db, "order_items"));
              transaction.set(itemRef, { ...item, order_id: orderRef.id, user_id: currentUser.uid });
              const stockRef = doc(db, "stock", item.stock_id);
              const matched = stock.find((s) => s.id === item.stock_id);
              if (!matched) throw new Error(`Stock item ${item.part_name} not found.`);
              const newQty = matched.quantity - item.quantity;
              if (newQty < 0) throw new Error(`Insufficient stock for ${item.part_name}.`);
              transaction.update(stockRef, { quantity: newQty, updated_at: serverTimestamp() });
            }
          });
        } else {
          const existingDoc = qSnap.docs[0];
          const udRef = existingDoc.ref;
          await runTransaction(db, async (transaction) => {
            const udSnap = await transaction.get(udRef);
            const existingData = udSnap.exists() ? (udSnap.data() as Udhaari) : null;
            const prevTotal = existingData?.totalPending ?? 0;
            const historyEntry = { billId: orderRef.id, amount: totalAmount, date: invoiceTimestamp, description: `Bill ${orderRef.id.substring(0, 8)}` };
            transaction.update(udRef, {
              totalPending: (prevTotal || 0) + totalAmount,
              history: [...(existingData?.history ?? []), historyEntry],
              lastUpdated: serverTimestamp(),
            });
            transaction.set(orderRef, orderData);
            for (const item of finalOrderItems) {
              const itemRef = doc(collection(db, "order_items"));
              transaction.set(itemRef, { ...item, order_id: orderRef.id, user_id: currentUser.uid });
              const stockRef = doc(db, "stock", item.stock_id);
              const matched = stock.find((s) => s.id === item.stock_id);
              if (!matched) throw new Error(`Stock item ${item.part_name} not found.`);
              const newQty = matched.quantity - item.quantity;
              if (newQty < 0) throw new Error(`Insufficient stock for ${item.part_name}.`);
              transaction.update(stockRef, { quantity: newQty, updated_at: serverTimestamp() });
            }
          });
        }
      } else {
        const batch = writeBatch(db);
        batch.set(orderRef, orderData);
        for (const item of finalOrderItems) {
          const itemRef = doc(collection(db, "order_items"));
          batch.set(itemRef, { ...item, order_id: orderRef.id, user_id: currentUser.uid });
          const stockRef = doc(db, "stock", item.stock_id);
          const matched = stock.find((s) => s.id === item.stock_id);
          if (!matched) throw new Error(`Stock item ${item.part_name} not found.`);
          const newQty = matched.quantity - item.quantity;
          if (newQty < 0) throw new Error(`Insufficient stock for ${item.part_name}.`);
          batch.update(stockRef, { quantity: newQty, updated_at: serverTimestamp() });
        }
        await batch.commit();
      }

      toast({ title: "Success", description: "Bill created successfully!" });
      // Move to step 5
      setStep(5);
    } catch (err: any) {
      console.error("Error creating bill:", err);
      toast({ title: "Error Creating Bill", description: err.message || "Save failed.", variant: "destructive" });
      setNewlyCreatedOrderId(null); // Clear ID on failure
    } finally {
      setCreatingBill(false);
    }
  };
  
  // --- PDF/Share Handlers ---
  const handleDownloadPDF = async (order: Order) => {
  if (!currentUser) {
    toast({ title: "Error", description: "User not signed in.", variant: "destructive" });
    return;
  }
  sonnerToast.loading("Generating PDF...", { id: "pdf-download" });
  try {
    const customerDoc = await getDoc(doc(db, "customers", order.customer_id));
    if (!customerDoc.exists()) throw new Error("Customer not found.");
    // --- UPDATED Customer Data ---
    const customerData = { id: customerDoc.id, ...(customerDoc.data() as any) } as Customer;
    
    const itemsQuery = query(collection(db, "order_items"), where("order_id", "==", order.id), where("user_id", "==", currentUser.uid));
    const itemsSnap = await getDocs(itemsQuery);
    const itemsData: OrderItem[] = [];
    itemsSnap.forEach((d) => itemsData.push(d.data() as OrderItem));

    // ✅ FIRST try user's custom template
    try {
      const pdfBlob = await generateBillPDF(order, itemsData, customerData);
      const url = URL.createObjectURL(pdfBlob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Invoice-${order.id.substring(0, 8)}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      sonnerToast.success("PDF Downloaded", { id: "pdf-download" });
      return;
    } catch (templateErr) {
      console.warn("Template failed. Using fallback invoice.");
    }

    // ✅ FALLBACK FORMAT (your new clean professional bill)
    // --- This fallback is now outdated as it doesn't support new customer fields ---
    // --- We rely on the main `generateBillPDF` to work. ---
    // --- If it fails, we just show the error. ---
    
    // generateFallbackInvoice({ ... }); // Fallback logic removed as generateBillPDF is now robust
    
    // sonnerToast.success("Fallback Invoice Generated", { id: "pdf-download" });
    // --- Instead of fallback, just re-throw the error from the main generator ---
    throw new Error("PDF generation failed. Check console for details.");

  } catch (err: any) {
    console.error("Error downloading PDF:", err);
    sonnerToast.error("PDF Error", { id: "pdf-download", description: err.message || "Could not generate PDF." });
  }
};

  
  // --- 7. REFACTORED SHARING ---
  const getShareableLink = async (order: Order): Promise<string> => {
     if (!currentUser) throw new Error("User not signed in.");

     const customerDoc = await getDoc(doc(db, "customers", order.customer_id));
     if (!customerDoc.exists()) throw new Error("Customer not found.");
     // --- UPDATED Customer Data ---
     const customerData = { id: customerDoc.id, ...(customerDoc.data() as any) } as Customer;
      
     const itemsQuery = query(collection(db, "order_items"), where("order_id", "==", order.id), where("user_id", "==", currentUser.uid));
     const itemsSnap = await getDocs(itemsQuery);
     const itemsData: OrderItem[] = [];
     itemsSnap.forEach((d) => itemsData.push(d.data() as OrderItem));

     if (itemsData.length === 0 && !order.labor_cost && !order.other_costs?.length) {
       throw new Error("No items or costs for this bill.");
     }

     const pdfBlob = await generateBillPDF(order, itemsData, customerData);
     const publicUrl = await uploadBillPDF(pdfBlob, currentUser.uid, order.id);
     return publicUrl;
  }

  const handleShareWhatsApp = async (order: Order) => {
    setIsSharing(true);
    const toastId = sonnerToast.loading("Preparing shareable link...");
    try {
      const publicUrl = await getShareableLink(order);
      const message = encodeURIComponent(`Here is your invoice ${order.id.substring(0,8)} from my garage:\n\n${publicUrl}`);
      window.open(`https://api.whatsapp.com/send?text=${message}`);
      sonnerToast.success("Share link ready!", { id: toastId });
    } catch (err: any) {
      console.error("Error sharing PDF:", err);
      sonnerToast.error("Share Failed", { id: toastId, description: err.message || "Could not share PDF." });
    } finally {
      setIsSharing(false);
    }
  };

  const handleCopyLink = async (order: Order) => {
    setIsSharing(true);
    const toastId = sonnerToast.loading("Generating & copying link...");
    try {
      const publicUrl = await getShareableLink(order);
      
      // Clipboard fallback for secure/iframe contexts
      const textArea = document.createElement("textarea");
      textArea.value = publicUrl;
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      try {
        document.execCommand('copy');
        sonnerToast.success("Link Copied!", { id: toastId, description: "PDF link copied to clipboard." });
      } catch (err) {
        console.error('Failed to copy: ', err);
        sonnerToast.error("Copy Failed", { id: toastId, description: "Could not copy link. See console." });
      }
      document.body.removeChild(textArea);

    } catch (err: any) {
      console.error("Error copying link:", err);
      sonnerToast.error("Failed", { id: toastId, description: err.message || "Could not copy link." });
    } finally {
      setIsSharing(false);
    }
  };
  // --- END REFACTOR ---


  /* --------------------------
     Main Render
     -------------------------- */
  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-12 h-12 animate-spin text-primary" />
        <p className="ml-2 text-muted-foreground">Loading checkout...</p>
      </div>
    );
  }

  // --- Show "Empty Cart" message if checkout isn't started ---
  if (step === 0) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5">
        <Navigation />
        <div className="container mx-auto px-4 py-8 max-w-3xl">
          <Card className="shadow-lg text-center py-10">
            <CardHeader>
              <ShoppingCart className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
            </CardHeader>
            <CardContent>
              <h2 className="text-2xl font-bold mb-2">Your Cart is Empty</h2>
              <p className="text-muted-foreground mb-6">
                Add parts from your inventory to start a new bill.
              </p>
              <div className="flex justify-center gap-3">
                <Button onClick={() => navigate('/parts')}>
                  <Plus className="w-4 h-4 mr-2" />
                  Add Parts
                </Button>
                <Button onClick={() => navigate('/bills')} variant="outline">
                  View Past Bills
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // --- Show wizard if step > 0 ---
  return (
    <>
      <CheckoutWizard
        // Pass all context states
        step={step}
        setStep={setStep}
        orderItems={orderItems}
        setOrderItems={setOrderItems}
        selectedCustomer={selectedCustomer}
        setSelectedCustomer={setSelectedCustomer}
        billType={billType}
        setBillType={setBillType}
        invoiceDate={invoiceDate}
        setInvoiceDate={setInvoiceDate}
        laborCost={laborCost}
        setLaborCost={setLaborCost}
        discountPercentage={discountPercentage}
        setDiscountPercentage={setDiscountPercentage}
        paymentMethod={paymentMethod}
        setPaymentMethod={setPaymentMethod}
        newlyCreatedOrderId={newlyCreatedOrderId}
        cancelCheckout={cancelCheckout} // Pass cancel function
        
        // --- 8. PASS OTHER COSTS ---
        otherCosts={otherCosts}
        setOtherCosts={setOtherCosts}
        
        // Pass local states/handlers
        customers={customers}
        // --- UPDATED: Pass currentUser ---
        currentUser={currentUser}
        generateNextCustomerId={generateNextCustomerId}
        // handleSaveNewCustomer={handleSaveNewCustomer} // Removed
        customerDetails={customerDetails}
        
        // Pass calculated values
        totalAmount={totalAmount}
        totalGST={totalGST}
        totalPartsSubtotal={totalPartsSubtotal}
        totalSellingPriceBase={totalSellingPriceBase} 
        effectiveDiscountAmount={effectiveDiscountAmount}
        totalOtherCosts={totalOtherCosts} // <-- PASS
        
        // Pass item handlers
        handleUpdateQuantity={handleUpdateQuantity}
        removeItemFromOrder={removeItemFromOrder}
        confirmZeroItem={confirmZeroItem}
        setConfirmZeroItem={setConfirmZeroItem}
        editingItemId={editingItemId}
        setEditingItemId={setEditingItemId}
        editPrice={editPrice}
        setEditPrice={setEditPrice}
        updateItemPrice={updateItemPrice}
        
        // Pass bill creation handlers
        creatingBill={creatingBill}
        handleCreateBill={handleCreateBill}
        
        // Pass PDF/Share handlers
        handleDownloadPDF={handleDownloadPDF}
        handleShareWhatsApp={handleShareWhatsApp} // <-- RENAMED
        handleCopyLink={handleCopyLink}       // <-- NEW
        isSharing={isSharing}
      />

      {/* --- Dialogs --- */}
      <AlertDialog open={!!confirmZeroItem} onOpenChange={(open) => !open && setConfirmZeroItem(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Item?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove "{confirmZeroItem?.part_name}" from the bill?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => {
              if (confirmZeroItem) removeItemFromOrder(confirmZeroItem.stock_id);
              setConfirmZeroItem(null);
            }}>
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};


/* -------------------------------------------------------------------
   --- Checkout Wizard Components (Copied from Bills.tsx) ---
   ------------------------------------------------------------------- */

// --- 9. UPDATED Props Interface ---
interface CheckoutWizardProps {
  step: number;
  setStep: React.Dispatch<React.SetStateAction<number>>;
  orderItems: OrderItem[];
  setOrderItems: React.Dispatch<React.SetStateAction<OrderItem[]>>;
  customers: Customer[];
  selectedCustomer: string;
  setSelectedCustomer: React.Dispatch<React.SetStateAction<string>>;
  // --- UPDATED Props ---
  currentUser: User | null;
  generateNextCustomerId: (userId: string) => Promise<string>;
  // handleSaveNewCustomer: (name: string, phone: string, address: string, gst: string) => Promise<string | null>; // Removed
  // -------------------
  billType: "normal" | "gst";
  setBillType: React.Dispatch<React.SetStateAction<"normal" | "gst">>;
  invoiceDate: string;
  setInvoiceDate: React.Dispatch<React.SetStateAction<string>>;
  laborCost: string;
  setLaborCost: React.Dispatch<React.SetStateAction<string>>;
  // --- ADDED otherCosts ---
  otherCosts: { id: string, description: string, amount: string }[];
  setOtherCosts: React.Dispatch<React.SetStateAction<{ id: string, description: string, amount: string }[]>>;
  // ----------------------
  discountPercentage: string;
  setDiscountPercentage: React.Dispatch<React.SetStateAction<string>>;
  totalAmount: number;
  totalGST: number;
  totalPartsSubtotal: number;
  totalSellingPriceBase: number;
  effectiveDiscountAmount: number;
  totalOtherCosts: number; // <-- ADDED
  handleUpdateQuantity: (stock_id: string, newQuantity: number) => void;
  removeItemFromOrder: (stock_id: string) => void;
  confirmZeroItem: OrderItem | null;
  setConfirmZeroItem: React.Dispatch<React.SetStateAction<OrderItem | null>>;
  editingItemId: string | null;
  setEditingItemId: React.Dispatch<React.SetStateAction<string | null>>;
  editPrice: string;
  setEditPrice: React.Dispatch<React.SetStateAction<string>>;
  updateItemPrice: (stock_id: string) => void;
  creatingBill: boolean;
  handleCreateBill: (e?: React.FormEvent) => Promise<void>;
  paymentMethod: "cash" | "card" | "credit";
  setPaymentMethod: React.Dispatch<React.SetStateAction<"cash" | "card" | "credit">>;
  customerDetails: Customer | null;
  newlyCreatedOrderId: string | null;
  handleDownloadPDF: (order: Order) => Promise<void>;
  handleShareWhatsApp: (order: Order) => Promise<void>; // <-- RENAMED
  handleCopyLink: (order: Order) => Promise<void>;    // <-- NEW
  isSharing: boolean;
  cancelCheckout: (options?: { showToast?: boolean }) => void;
}

// --- Wizard Wrapper ---
const CheckoutWizard: React.FC<CheckoutWizardProps> = (props) => {
  const { step, setStep, cancelCheckout } = props;
  const navigate = useNavigate(); // Added navigate
  const progressValue = step <= 4 ? (step / 4) * 100 : 100;
  const stepTitles = ["Item Review", "Customer Details", "Bill Details", "Payment", "Complete"];
  
  const StepComp = [
    CheckoutStep1, 
    CheckoutStep2, 
    CheckoutStep3, 
    CheckoutStep4, 
    CheckoutStep5
  ][step - 1];

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5">
      <Navigation />
      <div className="container mx-auto px-4 py-8 max-w-3xl">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold text-center">Checkout</h1>
          <Button 
            variant="outline" 
            onClick={() => {
              // Instead of just cancel, we also navigate
              cancelCheckout();
              navigate('/bills'); // Go to past bills
            }}
          >
            View Past Bills
          </Button>
        </div>
        <div className="space-y-6">
          {step <= 4 && (
            <Card className="p-4 shadow-sm border">
              <div className="flex justify-between items-center mb-2">
                <p className="font-semibold">{stepTitles[step - 1]}</p>
                <p className="text-sm text-muted-foreground">Step {Math.min(step, 4)} of 4</p>
              </div>
              <Progress value={progressValue} className="h-2" />
            </Card>
          )}
          {/* Pass all props down to the active step component */}
          <StepComp {...props} />
        </div>
      </div>
    </div>
  );
};


// --- Step 1: Items ---
const CheckoutStep1: React.FC<CheckoutWizardProps> = ({
  orderItems,
  setStep,
  handleUpdateQuantity,
  setConfirmZeroItem,
  editingItemId,
  setEditingItemId,
  editPrice,
  setEditPrice,
  updateItemPrice,
  totalPartsSubtotal,
  totalGST,
  billType,
  discountPercentage,
  cancelCheckout,
  // --- Get other costs props to check if cart is empty ---
  otherCosts,
  laborCost,
}) => {
  const navigate = useNavigate();
  const discPerc = parseFloat(discountPercentage) || 0;

  // Cart is empty if there are no items, no other costs, and no labor
  const isCartTrulyEmpty = orderItems.length === 0 && (otherCosts?.length || 0) === 0 && (parseFloat(laborCost) || 0) === 0;

  return (
    <Card className="shadow-lg">
      <CardHeader>
        <CardTitle className="text-xl flex items-center gap-2">
          <ClipboardList className="w-5 h-5" />
          Review Items ({orderItems.length})
        </CardTitle>
        <CardDescription>Confirm parts, quantities, and prices.</CardDescription>
      </CardHeader>
      <CardContent>
        {orderItems.length === 0 ? (
          <div className="text-center py-6 space-y-4">
            <p className="text-muted-foreground">No items added yet.</p>
            <Button
              onClick={() => navigate("/parts")} // Simplified navigation
            >
              <Plus className="w-4 h-4 mr-2" />
              Add Items from Inventory
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            {/* --- UPDATED: Replaced ScrollArea with native scroll --- */}
            <div className="max-h-60 overflow-y-auto pr-2 -mr-2">
              {orderItems.map((item) => {
                const itemDiscountedBase = item.selling_price * (1 - (discPerc / 100));
                let itemGst = 0;
                if (billType === 'gst') {
                  itemGst = (itemDiscountedBase * (item.sgst_percentage / 100)) + (itemDiscountedBase * (item.cgst_percentage / 100));
                }
                const finalUnitPrice = itemDiscountedBase + itemGst;
                
                return (
                  <div key={item.stock_id} className="flex items-center justify-between py-3 border-b last:border-b-0">
                    <div className="flex-1 min-w-0 pr-2">
                      <p className="font-medium truncate">{item.part_name}</p>
                      
                      {editingItemId === item.stock_id ? (
                        <div className="flex items-center gap-1 mt-1">
                          <Input type="number" step="0.01" value={editPrice} onChange={(e) => setEditPrice(e.target.value)} className="w-20 h-7 text-xs" placeholder="Base Rate" />
                          <Button type="button" size="icon" className="h-7 w-7" onClick={() => updateItemPrice(item.stock_id)}> <Check className="w-3 h-3" /> </Button>
                          <Button type="button" size="icon" variant="ghost" className="h-7 w-7" onClick={() => { setEditingItemId(null); setEditPrice(""); }}> <X className="w-3 h-3" /> </Button>
                        </div>
                      ) : (
                        <p className="text-xs text-muted-foreground">
                          Base: ₹{item.selling_price.toFixed(2)}
                          <Button type="button" variant="ghost" size="icon" className="ml-1 h-5 w-5 inline-flex items-center justify-center" onClick={() => { setEditingItemId(item.stock_id); setEditPrice(item.selling_price.toString()); }} title="Edit Base Rate">
                            <Edit className="w-3 h-3" />
                          </Button>
                        </p>
                      )}
                      
                      <div className="flex items-center gap-2 mt-1">
                        <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => handleUpdateQuantity(item.stock_id, item.quantity - 1)}>
                          <Minus className="h-4 h-4" />
                        </Button>
                        <Input
                          type="number"
                          className="h-7 w-12 text-center px-1"
                          value={item.quantity}
                          onChange={(e) => handleUpdateQuantity(item.stock_id, parseInt(e.target.value, 10))}
                        />
                        <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => handleUpdateQuantity(item.stock_id, item.quantity + 1)}>
                          <Plus className="w-4 h-4" />
                        </Button>
                      </div>

                    </div>

                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-lg">₹{(finalUnitPrice * item.quantity).toFixed(2)}</span>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => setConfirmZeroItem(item)} title="Remove Item">
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          
            <Button
              variant="secondary"
              className="w-full flex justify-center gap-2 mt-2"
              onClick={() => navigate("/parts")} // Simplified navigation
            >
              <Plus className="w-4 h-4" />
              Add More Items
            </Button>
          </div>
        )}
        
        {orderItems.length > 0 && (
          <>
            <Separator className="my-4" />
            <div className="flex justify-between font-bold text-xl text-primary mt-2">
              <p>Parts Total:</p>
              <p>₹{Number(totalPartsSubtotal || 0).toFixed(2)}</p>
            </div>
            {billType === "gst" && <p className="text-xs text-muted-foreground text-right">(Includes ₹{totalGST.toFixed(2)} GST)</p>}
          </>
        )}
      </CardContent>
      <CardFooter className="flex justify-between">
        <Button variant="outline" onClick={() => cancelCheckout()}>Cancel</Button>
        <Button onClick={() => setStep(2)} disabled={isCartTrulyEmpty}>
          Proceed to Checkout
        </Button>
      </CardFooter>
    </Card>
  );
}

// --- NEW/REBUILT: New Customer Dialog ---
interface NewCustomerDialogProps {
  currentUser: User | null;
  generateNextCustomerId: (userId: string) => Promise<string>;
  setSelectedCustomer: React.Dispatch<React.SetStateAction<string>>;
}

const NewCustomerDialog: React.FC<NewCustomerDialogProps> = ({ 
  currentUser, 
  generateNextCustomerId,
  setSelectedCustomer
}) => {
  const { toast } = useToast();
  const [isOpen, setIsOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  
  // State for Add Dialog
  const [formData, setFormData] = useState<CustomerFormData>({
    title: "Mr.",
    name: "",
    phone: "",
    email: "",
    address: "",
    customer_id: "",
    is_business: false,
    business_name: "",
    gst_number: "",
  });

  // Generate Customer ID for Add Dialog
  useEffect(() => {
    if (isOpen && currentUser) {
      (async () => {
        const id = await generateNextCustomerId(currentUser.uid);
        setFormData((prev) => ({ ...prev, customer_id: id }));
      })();
    } else if (!isOpen) {
      // Reset form on close
      setFormData({
        title: "Mr.",
        name: "",
        phone: "",
        email: "",
        address: "",
        customer_id: "",
        is_business: false,
        business_name: "",
        gst_number: "",
      });
    }
  }, [isOpen, currentUser, generateNextCustomerId]);

  const handleAddFormChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleAddTitleChange = (value: string) => {
    setFormData((prev) => ({ ...prev, title: value }));
  };

  const handleAddBusinessToggle = (checked: boolean) => {
    setFormData((prev) => ({ ...prev, is_business: checked }));
  };

  const handleAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (
      !currentUser ||
      !formData.customer_id ||
      formData.customer_id === "Error"
    ) {
      toast({
        title: "Error",
        description: "User not logged in or ID generation failed.",
        variant: "destructive",
      });
      return;
    }

    setIsSaving(true);
    try {
      const newCustomerData = {
        user_id: currentUser.uid,
        customer_id: formData.customer_id,
        title: formData.title,
        name: formData.name.trim(),
        phone: formData.phone.trim() || null,
        email: formData.email.trim() || null,
        address: formData.address.trim() || null,
        is_business: formData.is_business,
        business_name: formData.is_business
          ? formData.business_name.trim() || null
          : null,
        gst_number: formData.is_business
          ? formData.gst_number.trim() || null
          : null,
        created_at: serverTimestamp(),
      };
      
      const docRef = await addDoc(collection(db, "customers"), newCustomerData);

      toast({ title: "Success", description: "Customer added successfully" });
      setSelectedCustomer(docRef.id); // Auto-select the new customer
      setIsOpen(false); // Close dialog
    } catch (error: any) {
      console.error("Error adding customer:", error);
      toast({
        title: "Error Adding Customer",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5"><UserPlus className="w-4 h-4" /> New Customer</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Add New Customer</DialogTitle>
          <DialogDescription>
            Create a new customer record. This customer will be auto-selected.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleAddSubmit}>
          {/* --- NATIVE SCROLLBAR FIX --- */}
          <div className="max-h-[60vh] overflow-y-auto p-4 space-y-4"> 
            <div>
              <Label>Customer ID</Label>
              <Input
                name="customer_id"
                value={formData.customer_id}
                readOnly
                className="bg-muted cursor-not-allowed"
              />
            </div>

            {/* --- Is Business Toggle --- */}
            <div className="flex items-center justify-between space-x-2 py-2 border-b border-t">
              <Label
                htmlFor="is_business-add-cart"
                className="flex flex-col space-y-1"
              >
                <span>This is a Business</span>
                <span className="font-normal text-xs text-muted-foreground">
                  Toggle on to add Business Name and GSTIN.
                </span>
              </Label>
              <Switch
                id="is_business-add-cart"
                checked={formData.is_business}
                onCheckedChange={handleAddBusinessToggle}
              />
            </div>
            
            {/* --- Conditional Business Fields --- */}
            {formData.is_business && (
              <>
                <div className="p-4 bg-muted/50 rounded-lg space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="business_name-add-cart">Business Name *</Label>
                    <Input
                      id="business_name-add-cart"
                      name="business_name"
                      value={formData.business_name}
                      onChange={handleAddFormChange}
                      placeholder="e.g. Acme Motors Ltd."
                      required={formData.is_business}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="gst_number-add-cart">Business GST Number</Label>
                    <Input
                      id="gst_number-add-cart"
                      name="gst_number"
                      value={formData.gst_number}
                      onChange={handleAddFormChange}
                      placeholder="e.g. 22AAAAA0000A1Z5"
                    />
                  </div>
                </div>
                <Separator />
              </>
            )}
            
            {/* --- Personal / Contact Details --- */}
            <div className="grid grid-cols-4 gap-x-4">
              <div className="col-span-1">
                <Label>Title</Label>
                <Select value={formData.title} onValueChange={handleAddTitleChange}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Mr.">Mr.</SelectItem>
                    <SelectItem value="Mrs.">Mrs.</SelectItem>
                    <SelectItem value="Ms.">Ms.</SelectItem>
                    <SelectItem value="M/s">M/s</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-3">
                <Label>
                  {formData.is_business ? "Contact Person Name *" : "Name *"}
                </Label>
                <Input
                  name="name"
                  value={formData.name}
                  onChange={handleAddFormChange}
                  required
                  placeholder="e.g. Ramesh Kumar"
                />
              </div>
            </div>

            <div>
              <Label>Phone</Label>
              <Input
                name="phone"
                type="tel"
                value={formData.phone}
                onChange={handleAddFormChange}
                placeholder="e.g. 9876543210"
              />
            </div>
            <div>
              <Label>Email</Label>
              <Input
                name="email"
                type="email"
                value={formData.email}
                onChange={handleAddFormChange}
                placeholder="eg. ramesh@email.com"
              />
            </div>
            <div>
              <Label>Address</Label>
              <Textarea
                name="address"
                value={formData.address}
                onChange={handleAddFormChange}
                placeholder="eg. 123 Main St, City"
              />
            </div>
          </div>
          
          <DialogFooter className="pt-4"> 
            <DialogClose asChild>
              <Button type="button" variant="outline" disabled={isSaving}>
                Cancel
              </Button>
            </DialogClose>
            <Button
              type="submit"
              disabled={
                isSaving ||
                !formData.customer_id ||
                formData.customer_id === "Error" ||
                !formData.name ||
                (formData.is_business && !formData.business_name)
              }
            >
              {isSaving ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                "Save Customer"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// --- Step 2: Customer ---
const CheckoutStep2: React.FC<CheckoutWizardProps> = ({
  customers,
  selectedCustomer,
  setSelectedCustomer,
  // handleSaveNewCustomer, // Removed
  currentUser, // NEW
  generateNextCustomerId, // NEW
  customerDetails,
  setStep,
}) => (
  <Card className="shadow-lg">
    <CardHeader>
      <CardTitle className="text-xl flex items-center gap-2"><Users className="w-5 h-5" />Select Customer</CardTitle>
      <CardDescription>Choose an existing customer or create a new one.</CardDescription>
    </CardHeader>
    <CardContent className="space-y-4">
      <div className="space-y-2">
        <Label>Customer *</Label>
        <div className="flex gap-2">
          <CustomerComboBox
            customers={customers}
            value={selectedCustomer}
            onValueChange={setSelectedCustomer}
            className="flex-1"
          />
          {/* --- UPDATED: NewCustomerDialog --- */}
          <NewCustomerDialog 
            currentUser={currentUser}
            generateNextCustomerId={generateNextCustomerId}
            setSelectedCustomer={setSelectedCustomer} 
          />
        </div>
        {customerDetails && (
          // --- UPDATED: Customer Detail Display ---
          <div className="mt-4 p-3 bg-muted/50 rounded-lg text-sm space-y-1 border">
            {customerDetails.is_business ? (
              <>
                <p className="font-semibold flex items-center gap-2">
                  <Briefcase className="w-4 h-4 text-primary" />
                  {customerDetails.business_name}
                </p>
                <p className="text-muted-foreground pl-6">
                  {customerDetails.title} {customerDetails.name} (Contact)
                </p>
              </>
            ) : (
              <p className="font-semibold flex items-center gap-2">
                <UserIcon className="w-4 h-4" />
                {customerDetails.title} {customerDetails.name}
              </p>
            )}
            
            {customerDetails.phone && <p className="text-muted-foreground pl-6">{customerDetails.phone}</p>}
            {customerDetails.address && <p className="text-muted-foreground pl-6">{customerDetails.address}</p>}
            {customerDetails.gst_number && <p className="text-xs font-mono bg-muted px-1 rounded w-fit ml-6">GST: {customerDetails.gst_number}</p>}
          </div>
        )}
      </div>
      <div>
        <Button variant="link" size="sm" asChild className="p-0">
          <Link to="/customers">Manage All Customers</Link>
        </Button>
      </div>
    </CardContent>
    <CardFooter className="flex justify-between">
      <Button variant="outline" onClick={() => setStep(1)}>Back</Button>
      <Button onClick={() => setStep(3)} disabled={!selectedCustomer}>Next: Bill Details</Button>
    </CardFooter>
  </Card>
);

// --- 10. MODIFIED Step 3: Details ---
const CheckoutStep3: React.FC<CheckoutWizardProps> = ({
  setStep,
  invoiceDate,
  setInvoiceDate,
  billType,
  setBillType,
  laborCost,
  setLaborCost,
  // --- Get otherCosts props ---
  otherCosts,
  setOtherCosts,
  // --------------------------
  discountPercentage,
  setDiscountPercentage,
  totalAmount,
  totalGST,
  totalPartsSubtotal,
  effectiveDiscountAmount,
  totalSellingPriceBase,
  totalOtherCosts, // <-- Get total
}) => {
  const { toast } = useToast();

  // --- 11. ADD LOCAL STATE FOR AMOUNT ---
  const [discountAmountInput, setDiscountAmountInput] = useState(
    effectiveDiscountAmount.toFixed(2)
  );

  // --- 12. ADD SYNC EFFECT ---
  useEffect(() => {
    // Sync local amount input when the calculated prop changes
    // This ensures that if the percentage is changed, the amount updates
    // Only update if the user isn't actively typing in the amount box
    if (document.activeElement?.id !== "discountAmount") {
      // --- FIX: Check if percentage is empty ---
      if (discountPercentage === "" || parseFloat(discountPercentage) === 0) {
        setDiscountAmountInput("");
      } else {
        setDiscountAmountInput(effectiveDiscountAmount.toFixed(2));
      }
    }
  }, [effectiveDiscountAmount, discountPercentage]); // <-- ADDED discountPercentage


  // --- 13. CREATE HANDLERS (WITH FIX) ---
  const handlePercentageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let percValue = e.target.value;
    
    // --- FIX: Allow empty string ---
    if (percValue === "") {
        setDiscountPercentage(""); // <-- Set context to empty
        setDiscountAmountInput(""); // <-- Set local state to empty
        return;
    }
    // --- END FIX ---

    const numPerc = parseFloat(percValue);
    if (isNaN(numPerc) && percValue !== ".") return; // Don't update if not a number (allow decimal point)

    if (numPerc > 100) percValue = "100";
    if (numPerc < 0) percValue = "0";

    setDiscountPercentage(percValue);
    // The useEffect will update the amount input
  };

  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let amtValue = e.target.value;
    setDiscountAmountInput(amtValue); // Update local state to show typing

    // --- FIX: Allow empty string ---
    if (amtValue === "") {
        setDiscountPercentage(""); // <-- Set context to empty
        return;
    }
    // --- END FIX ---

    let numAmt = parseFloat(amtValue);
    if (isNaN(numAmt) && amtValue !== ".") return; // Not a valid number, just wait (allow decimal point)

    // Cap the discount at the total price
    if (numAmt > totalSellingPriceBase) {
        numAmt = totalSellingPriceBase;
        // The prop update will trigger useEffect to fix the input
    }
    if (numAmt < 0) numAmt = 0;

    // Calculate new percentage
    if (totalSellingPriceBase === 0) {
        setDiscountPercentage("0"); // Avoid divide by zero
    } else {
        const newPerc = (numAmt / totalSellingPriceBase) * 100;
        // Don't set percentage to a crazy long decimal
        setDiscountPercentage(newPerc.toFixed(2));
    }
  };
  // -----------------------------


  // --- Handlers for Other Costs ---
  const addOtherCost = () => {
    setOtherCosts(prev => [
      ...prev,
      { id: crypto.randomUUID(), description: "", amount: "" }
    ]);
  };

  const updateOtherCost = (id: string, field: 'description' | 'amount', value: string) => {
    setOtherCosts(prev =>
      prev.map(cost =>
        cost.id === id ? { ...cost, [field]: value } : cost
      )
    );
  };

  const removeOtherCost = (id: string) => {
    setOtherCosts(prev => prev.filter(cost => cost.id !== id));
  };
  // --------------------------------

  return (
    <Card className="shadow-lg">
      <CardHeader>
        <CardTitle className="text-xl flex items-center gap-2">
          <Receipt className="w-5 h-5" />
          Bill & Pricing Details
        </CardTitle>
        <CardDescription>
          Add discounts and other costs, and confirm tax details.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Invoice Date *</Label>
            <Input type="date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="billType">Bill Type *</Label>
            <Select value={billType} onValueChange={(val) => setBillType(val as "normal" | "gst")}>
              <SelectTrigger id="billType"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="gst">GST Bill (Tax Included)</SelectItem>
                <SelectItem value="normal">Normal Bill (No Tax)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        
        <Separator className="my-4" />
        
        {/* --- Other Costs UI --- */}
        <div className="space-y-2">
          <Label>Labor & Other Costs</Label>
          {/* Labor Cost (Primary) */}
          <div className="flex items-center gap-2">
            <Input
              id="laborCostDesc"
              type="text"
              value="Labor Cost"
              className="font-medium"
              readOnly
            />
            <Input
              id="laborCost"
              type="number"
              step="0.01"
              min={0}
              value={laborCost}
              onChange={(e) => setLaborCost(e.target.value)}
              placeholder="Amount (₹)"
              className="w-32"
            />
            <Button type="button" variant="ghost" size="icon" className="w-10" disabled>
              {/* Placeholder for alignment */}
            </Button>
          </div>
          
          {/* Dynamic Other Costs */}
          {otherCosts.map((cost, index) => (
            <div key={cost.id} className="flex items-center gap-2">
              <Input
                placeholder={`Other Cost ${index + 1} (e.g. Servicing)`}
                value={cost.description}
                onChange={(e) => updateOtherCost(cost.id, 'description', e.target.value)}
              />
              <Input
                type="number"
                step="0.01"
                min={0}
                placeholder="Amount (₹)"
                value={cost.amount}
                onChange={(e) => updateOtherCost(cost.id, 'amount', e.target.value)}
                className="w-32"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="w-10 text-destructive hover:text-destructive"
                onClick={() => removeOtherCost(cost.id)}
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
          ))}

          <Button type="button" variant="outline" size="sm" className="gap-2" onClick={addOtherCost}>
            <Plus className="w-4 h-4" /> Add Another Cost
          </Button>
        </div>
        {/* --- End Other Costs UI --- */}
        
        <Separator className="my-4" />
        
        {/* --- 14. MODIFIED Discount UI --- */}
        <div className="space-y-2">
          <Label>Discount</Label>
          <div className="flex items-center gap-2">
            <Input
              id="discountPercentage"
              type="number"
              step="0.01"
              min="0"
              max="100"
              value={discountPercentage}
              onChange={handlePercentageChange} // <-- Use new handler
              placeholder="Discount %"
              className="w-32"
            />
            {/* --- MAKE AMOUNT INPUT EDITABLE --- */}
            <Input
                id="discountAmount"
                type="number"
                step="0.01"
                min="0"
                max={totalSellingPriceBase.toFixed(2)}
                value={discountAmountInput}
                onChange={handleAmountChange} // <-- Use new handler
                placeholder="Amount (₹)"
                className="flex-1 font-medium" // Removed bg-muted
                onBlur={() => {
                    // On blur, format it nicely
                    const val = parseFloat(discountAmountInput) || 0;
                    // --- FIX: only format if not empty ---
                    if (discountAmountInput !== "") {
                      setDiscountAmountInput(val.toFixed(2));
                    }
                }}
            />
          </div>
        </div>
        {/* --- END MODIFIED Discount UI --- */}

        
        <Separator className="my-4" />
        
        {/* --- Totals Display --- */}
        <div className="space-y-1 text-right">
          <div className="flex justify-between text-base ">
            <p className="text-muted-foreground">Parts Total:</p>
            <p>₹{totalSellingPriceBase.toFixed(2)}</p>
          </div>
          <div className="flex justify-between text-base ">
            <p className="text-muted-foreground">
              - Discount ({parseFloat(discountPercentage) || 0}%):
            </p>
            <p>₹{effectiveDiscountAmount.toFixed(2)}</p>
          </div>
          {billType === "gst" && (
            <div className="flex justify-between text-base ">
              <p className="text-muted-foreground">+ Total GST:</p>
              <p>₹{totalGST.toFixed(2)}</p>
            </div>
          )}
          <div className="flex justify-between text-base ">
            <p className="text-muted-foreground">+ Labor Cost:</p>
            <p>₹{(parseFloat(laborCost) || 0).toFixed(2)}</p>
          </div>
          {/* Other Costs Total */}
          {otherCosts.map(cost => (
             <div key={cost.id} className="flex justify-between text-base ">
              <p className="text-muted-foreground">+ {cost.description || 'Other Cost'}:</p>
              <p>₹{(parseFloat(cost.amount) || 0).toFixed(2)}</p>
            </div>
          ))}
        </div>
        <div className="flex justify-between font-bold text-2xl text-primary pt-2 border-t mt-2">
          <p>Grand Total:</p>
          <p>₹{totalAmount.toFixed(2)}</p>
        </div>
      </CardContent>
      <CardFooter className="flex justify-between">
        <Button variant="outline" onClick={() => setStep(2)}>Back</Button>
        <Button onClick={() => setStep(4)}>Next: Payment</Button>
      </CardFooter>
    </Card>
  );
};


// --- Step 4: Payment ---
const CheckoutStep4: React.FC<CheckoutWizardProps> = ({
  setStep,
  totalAmount,
  paymentMethod,
  setPaymentMethod,
  customerDetails,
  creatingBill,
  handleCreateBill,
}) => (
  <Card className="shadow-lg">
    <CardHeader>
      <CardTitle className="text-xl flex items-center gap-2"><CreditCard className="w-5 h-5" />Finalize Payment</CardTitle>
      <CardDescription>Select payment method to complete the bill.</CardDescription>
    </CardHeader>
    <CardContent className="space-y-4">
      <div className="flex justify-between font-bold text-2xl text-primary border-b pb-3 mb-4"><p>Amount Due:</p><p>₹{totalAmount.toFixed(2)}</p></div>
      <Label className="text-base font-medium">Payment Type *</Label>
      <Select value={paymentMethod} onValueChange={(val) => setPaymentMethod(val as "cash" | "card" | "credit")} required>
        <SelectTrigger><SelectValue placeholder="Select Payment Type" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="cash">Cash (Paid Now)</SelectItem>
          <SelectItem value="card">Card/UPI (Paid Now)</SelectItem>
          <SelectItem value="credit">Credit / Udhaari (Pay Later)</SelectItem>
        </SelectContent>
      </Select>
      <div className="mt-4 p-3 rounded-lg bg-primary/10 border border-primary/20 text-primary-dark">
        <p className="text-sm font-medium ">
          {/* --- UPDATED: Credit Message --- */}
          {paymentMethod === "credit" ? (
            <span>Selecting <strong>Credit / Udhaari</strong> will add <strong>₹{totalAmount.toFixed(2)}</strong> to {customerDetails?.is_business ? customerDetails.business_name : customerDetails?.name}'s pending balance.</span>
          ) : (
            <span>Selecting <strong>Cash</strong> or <strong>Card</strong> marks the transaction as fully paid.</span>
          )}
        </p>
      </div>
    </CardContent>
    <CardFooter className="flex justify-between">
      <Button variant="outline" onClick={() => setStep(3)} disabled={creatingBill}>Back</Button>
      <Button onClick={handleCreateBill} disabled={creatingBill || !paymentMethod}>
        {creatingBill ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Finalizing...</> : `Finalize & Create Bill`}
      </Button>
    </CardFooter>
  </Card>
);

// --- 11. MODIFIED Step 5: Complete ---
const CheckoutStep5: React.FC<CheckoutWizardProps> = ({
  newlyCreatedOrderId,
  handleDownloadPDF,
  handleShareWhatsApp, // <-- RENAMED
  handleCopyLink,       // <-- NEW
  isSharing,
  cancelCheckout,
}) => {
  const navigate = useNavigate();
  const [createdOrder, setCreatedOrder] = useState<Order | null>(null);
  const [isFetching, setIsFetching] = useState<boolean>(false);
  const { toast } = useToast();
  
  useEffect(() => {
    if (!newlyCreatedOrderId) return;
    setIsFetching(true);
    (async () => {
      try {
        const orderDoc = await getDoc(doc(db, "orders", newlyCreatedOrderId));
        if (!orderDoc.exists()) throw new Error("Created order not found.");
        const orderData = { id: orderDoc.id, ...(orderDoc.data() as any) } as Order;
        setCreatedOrder(orderData);
      } catch (err: any) {
        console.error("Error fetching created order details:", err);
        toast({ title: "Error", description: "Could not fetch details of the created bill.", variant: "destructive" });
      } finally {
        setIsFetching(false);
      }
    })();
  }, [newlyCreatedOrderId, toast]);

  const onDownload = () => {
    if (!createdOrder) return;
    handleDownloadPDF(createdOrder);
  };
  
  const onShareWhatsApp = () => {
    if (!createdOrder) return;
    handleShareWhatsApp(createdOrder);
  };

  const onCopyLink = () => {
    if (!createdOrder) return;
    handleCopyLink(createdOrder);
  };

  const handleFinishAndSell = () => {
    cancelCheckout({ showToast: false }); // Reset state without toast
    navigate('/parts');
  }
  
  const handleFinishAndReview = () => {
    cancelCheckout({ showToast: false }); // Reset state without toast
    navigate('/bills');
  }

  return (
    <Card className="shadow-lg text-center py-10">
      <CardHeader>
        <Check className="w-16 h-16 text-green-500 mx-auto mb-4 p-2 border-4 border-green-500 rounded-full" />
      </CardHeader>
      <CardContent>
        <h2 className="text-2xl font-bold mb-2">Bill Processed Successfully!</h2>
        <p className="text-muted-foreground mb-6">Order ID: <span className="font-mono text-sm bg-muted px-1 rounded">{newlyCreatedOrderId?.substring(0, 8) ?? "N/A"}...</span></p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
          <Button onClick={onDownload} variant="outline" disabled={isFetching || isSharing}>
            {isFetching ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Download className="w-4 h-4 mr-1" />}
            Download
          </Button>
          <Button onClick={onShareWhatsApp} variant="outline" disabled={isFetching || isSharing}>
            {isSharing ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <MessageCircle className="w-4 h-4 mr-1" />}
            WhatsApp
          </Button>
          {/* --- UPDATED BUTTON --- */}
          <Button onClick={onCopyLink} variant="outline" disabled={isFetching || isSharing}>
            {isFetching ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Copy className="w-4 h-4 mr-1" />}
            Copy Link
          </Button>
          {/* --- END UPDATE --- */}
        </div>
        <Separator className="my-6" />
        <div className="flex justify-center gap-3">
          <Button onClick={handleFinishAndReview} variant="outline">View All Bills</Button>
          <Button onClick={handleFinishAndSell}>Continue Selling</Button>
        </div>
      </CardContent>
    </Card>
  );
}
// --- End of external components ---


export default Cart;