import React, { createContext, useContext, useState, useMemo, ReactNode } from 'react';
import { useCart, CartItem } from '@/context/CartContext';
import { toast as sonnerToast } from "sonner";

// ---
// NOTE: You should ideally move these interfaces to a shared 'types.ts' file
// and import them here and in Bills.tsx to avoid duplication.
// ---

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

interface StockItem {
  id: string;
  part_name: string;
  selling_price: number;
  buying_price: number;
  sgst_percentage: number;
  cgst_percentage: number;
  quantity: number; // This is the 'stock' property
  hsn_code?: string;
  image_url?: string | null;
  user_id: string;
  car_company?: string | null;
  car_model?: string | null;
  vehicle_type?: string | null;
  low_stock_threshold?: number;
}

type BillType = "normal" | "gst";
type PaymentMethod = "cash" | "card" | "credit";

// Define the context state
interface CheckoutContextType {
  step: number;
  setStep: (step: number) => void;
  orderItems: OrderItem[];
  setOrderItems: React.Dispatch<React.SetStateAction<OrderItem[]>>;
  isCheckoutInProgress: boolean;
  
  // All the other states from your wizard
  selectedCustomer: string;
  setSelectedCustomer: React.Dispatch<React.SetStateAction<string>>;
  billType: BillType;
  setBillType: React.Dispatch<React.SetStateAction<BillType>>;
  invoiceDate: string;
  setInvoiceDate: React.Dispatch<React.SetStateAction<string>>;
  laborCost: string;
  setLaborCost: React.Dispatch<React.SetStateAction<string>>;
  discountPercentage: string;
  setDiscountPercentage: React.Dispatch<React.SetStateAction<string>>;
  paymentMethod: PaymentMethod;
  setPaymentMethod: React.Dispatch<React.SetStateAction<PaymentMethod>>;
  newlyCreatedOrderId: string | null;
  setNewlyCreatedOrderId: React.Dispatch<React.SetStateAction<string | null>>;
  
  // Functions to control the flow
  startCheckout: (cartItems: CartItem[], stock: StockItem[]) => void;
  cancelCheckout: (options?: { showToast?: boolean }) => void;
  addMoreItems: (cartItems: CartItem[], stock: StockItem[]) => void;
}

const CheckoutContext = createContext<CheckoutContextType | undefined>(undefined);

export const CheckoutProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { clearCart } = useCart();
  
  // All the state from Bills.tsx is now here
  const [step, setStep] = useState<number>(0);
  const [orderItems, setOrderItems] = useState<OrderItem[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<string>("");
  const [billType, setBillType] = useState<BillType>("gst");
  const [invoiceDate, setInvoiceDate] = useState<string>(new Date().toISOString().split("T")[0]);
  const [laborCost, setLaborCost] = useState<string>("");
  const [discountPercentage, setDiscountPercentage] = useState<string>("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash");
  const [newlyCreatedOrderId, setNewlyCreatedOrderId] = useState<string | null>(null);

  // This is the key: a global flag to show/hide UI
  // It's in progress if we're on a step *before* completion (step 5)
  const isCheckoutInProgress = useMemo(() => step > 0 && step < 5, [step]);

  // This is your old 'loadCartItems' logic, now global
  const startCheckout = (cartItems: CartItem[], stock: StockItem[]) => {
    if (stock.length === 0 && cartItems.length > 0) {
      sonnerToast.error("Stock data not loaded. Please wait and try again.");
      return;
    }
    
    // Reset all fields for a fresh checkout
    setOrderItems([]);
    setSelectedCustomer("");
    setBillType("gst");
    setLaborCost("");
    setDiscountPercentage("");
    setPaymentMethod("cash");
    setNewlyCreatedOrderId(null);

    try {
      // If cart is empty, just go to step 1
      if (cartItems.length === 0) {
        setStep(1);
        return;
      }
      
      const newOrderItems: OrderItem[] = [];
      let itemsAddedCount = 0;

      cartItems.forEach((localItem) => {
        const s = stock.find((st) => st.id === localItem.id);
        const partName = s?.part_name ?? localItem.partName;

        if (!s) {
          sonnerToast.warning(`Item "${partName}" skipped`, { description: "Part not found in stock." });
          return;
        }
        
        let newQty = localItem.quantity;
        if (newQty > s.quantity) {
           sonnerToast.warning(`Item "${partName}" quantity capped`, { description: `Requested ${newQty}, only ${s.quantity} in stock.` });
           newQty = s.quantity;
        }
        
        if (newQty <= 0) {
          sonnerToast.info(`Item "${partName}" skipped`, { description: "Stock is zero." });
          return;
        }

        const basePrice = s.selling_price;
        const sgstPerc = s.sgst_percentage ?? 0;
        const cgstPerc = s.cgst_percentage ?? 0;
        const buyPrice = s.buying_price ?? 0;
        const sgstAmount = (basePrice * sgstPerc) / 100;
        const cgstAmount = (basePrice * cgstPerc) / 100;
        const totalGst = sgstAmount + cgstAmount;
        // Use the default 'billType' from state
        const itemPrice = billType === "gst" ? (basePrice + totalGst) : basePrice;

        newOrderItems.push({
          stock_id: localItem.id,
          part_name: partName,
          hsn_code: s.hsn_code ?? null,
          quantity: newQty,
          price: itemPrice,
          buying_price: buyPrice,
          selling_price: basePrice,
          sgst_percentage: sgstPerc,
          cgst_percentage: cgstPerc,
          sgst_amount: sgstAmount * newQty,
          cgst_amount: cgstAmount * newQty,
          total_gst: totalGst * newQty,
          subtotal: itemPrice * newQty,
        });
        itemsAddedCount++;
      });
      
      if (itemsAddedCount > 0) {
           sonnerToast.success("Checkout Started", { description: `${itemsAddedCount} item(s) added to bill.` });
      }

      setOrderItems(newOrderItems);
      clearCart(); // IMPORTANT: Clear the cart *after* moving items
      setStep(1); // Move to the first step of the wizard

    } catch (err: any) {
      sonnerToast.error("Error starting checkout", { description: err.message });
    }
  };

  // This is your 'add more items' logic
  const addMoreItems = (cartItems: CartItem[], stock: StockItem[]) => {
      if (cartItems.length === 0) {
          sonnerToast.info("Cart is empty", { description: "Add items from the Parts page first." });
          return;
      }
      if (stock.length === 0) {
          sonnerToast.error("Stock data not loaded. Please try again.");
          return;
      }
      
      setOrderItems(prevOrderItems => {
        const newOrderItems = [...prevOrderItems];
        let itemsAddedCount = 0;
        let itemsUpdatedCount = 0;

        cartItems.forEach((localItem) => {
          const s = stock.find((st) => st.id === localItem.id);
          const partName = s?.part_name ?? localItem.partName;

          if (!s) {
            sonnerToast.warning(`Item "${partName}" skipped`, { description: "Part not found in stock." });
            return;
          }
          
          const existingItemIndex = newOrderItems.findIndex(oi => oi.stock_id === localItem.id);
          const newQuantity = localItem.quantity;
          
          if (existingItemIndex > -1) {
            // --- ITEM ALREADY EXISTS IN BILL ---
            const existingItem = newOrderItems[existingItemIndex];
            const combinedQuantity = existingItem.quantity + newQuantity;
            let updatedQuantity = combinedQuantity;
            
            if (combinedQuantity > s.quantity) {
               sonnerToast.warning(`Item "${partName}" quantity capped`, { description: `Adding ${newQuantity} (Total: ${combinedQuantity}) exceeds stock (${s.quantity}). Set to max.` });
               updatedQuantity = s.quantity;
            }

            const basePrice = existingItem.selling_price;
            const sgst = (basePrice * existingItem.sgst_percentage) / 100;
            const cgst = (basePrice * existingItem.cgst_percentage) / 100;
            const totalGst = sgst + cgst;
            const finalPrice = billType === "gst" ? basePrice + totalGst : basePrice;

            newOrderItems[existingItemIndex] = {
              ...existingItem,
              quantity: updatedQuantity,
              subtotal: finalPrice * updatedQuantity,
              total_gst: totalGst * updatedQuantity,
              sgst_amount: sgst * updatedQuantity,
              cgst_amount: cgst * updatedQuantity,
            };
            itemsUpdatedCount++;
               
          } else {
            // --- ITEM IS NEW TO THE BILL ---
            let newQty = newQuantity;
            if (newQuantity > s.quantity) {
               sonnerToast.warning(`Item "${partName}" quantity capped`, { description: `Requested ${newQuantity}, only ${s.quantity} in stock.` });
               newQty = s.quantity;
            }
            
            if (newQty <= 0) {
              sonnerToast.info(`Item "${partName}" skipped`, { description: "Stock is zero." });
              return;
            }

            const basePrice = s.selling_price;
            const sgstPerc = s.sgst_percentage ?? 0;
            const cgstPerc = s.cgst_percentage ?? 0;
            const buyPrice = s.buying_price ?? 0;
            const sgstAmount = (basePrice * sgstPerc) / 100;
            const cgstAmount = (basePrice * cgstPerc) / 100;
            const totalGst = sgstAmount + cgstAmount;
            const itemPrice = billType === "gst" ? (basePrice + totalGst) : basePrice;

            newOrderItems.push({
              stock_id: localItem.id,
              part_name: partName,
              hsn_code: s.hsn_code ?? null,
              quantity: newQty,
              price: itemPrice,
              buying_price: buyPrice,
              selling_price: basePrice,
              sgst_percentage: sgstPerc,
              cgst_percentage: cgstPerc,
              sgst_amount: sgstAmount * newQty,
              cgst_amount: cgstAmount * newQty,
              total_gst: totalGst * newQty,
              subtotal: itemPrice * newQty,
            });
            itemsAddedCount++;
          }
        });

        if (itemsAddedCount > 0 || itemsUpdatedCount > 0) {
           sonnerToast.success("Bill Updated", { description: `${itemsAddedCount} item(s) added, ${itemsUpdatedCount} updated.` });
        } else if (cartItems.length > 0) {
          sonnerToast.info("No new items added", { description: "Items from cart were skipped (e.g., out of stock)." });
        }
        
        return newOrderItems;
      });

      clearCart();
      setStep(1); // Ensure we are on step 1
  };


  // This function resets everything
  const cancelCheckout = (options = { showToast: true }) => {
    setOrderItems([]);
    setStep(0);
    setSelectedCustomer("");
    setBillType("gst");
    setLaborCost("");
    setDiscountPercentage("");
    setPaymentMethod("cash");
    setNewlyCreatedOrderId(null);
    if (options.showToast) {
      sonnerToast.info("Checkout Canceled", { description: "Your pending bill has been cleared." });
    }
  };

  return (
    <CheckoutContext.Provider
      value={{
        step,
        setStep,
        orderItems,
        setOrderItems,
        isCheckoutInProgress,
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
      }}
    >
      {children}
    </CheckoutContext.Provider>
  );
};

// Custom hook to use the context
export const useCheckout = () => {
  const context = useContext(CheckoutContext);
  if (context === undefined) {
    throw new Error('useCheckout must be used within a CheckoutProvider');
  }
  return context;
};