// Bills.tsx — REFACTORED (SIMPLIFIED)
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, Link, useSearchParams } from "react-router-dom";
import { db, auth } from "@/integrations/firebase/client";
import {
  collection,
  query,
  orderBy,
  onSnapshot,
  doc,
  where,
  Timestamp,
  getDoc,
  getDocs,
  deleteDoc,
  writeBatch,
} from "firebase/firestore";
import { onAuthStateChanged, User } from "firebase/auth";
import { format } from "date-fns";
import { DateRange } from "react-day-picker";

import { toast as sonnerToast } from "sonner";

import Navigation from "@/components/Navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import {
  FileText, Plus, Trash2, Download, MessageCircle, Mail, Loader2, MoreVertical, Eye,
  Search, Filter, ArrowUpDown, XCircle, CalendarIcon,
} from "lucide-react";

import { generateBillPDF, uploadBillPDF } from "@/lib/pdf-generator";

/* --------------------------
   Types / Interfaces
   (Same as before)
   -------------------------- */
interface Customer {
  id: string;
  customer_id: string;
  name: string;
  phone?: string | null;
  address?: string | null;
  user_id: string;
  created_at?: Timestamp | null;
  gst_number?: string | null;
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
interface Order {
  id: string;
  customer_id: string;
  customer_name: string;
  customer_identifier: string;
  total_amount: number;
  total_parts_subtotal?: number;
  labor_cost?: number;
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
// Udhaari type removed as it's not used in this simplified component

type SortKey = "invoice_date" | "total_amount" | "customer_name";

const useMediaQuery = (query: string) => {
  const [matches, setMatches] = useState(false);
  useEffect(() => {
    const media = window.matchMedia(query);
    if (media.matches !== matches) {
      setMatches(media.matches);
    }
    const listener = () => setMatches(media.matches);
    window.addEventListener("resize", listener);
    return () => window.removeEventListener("resize", listener);
  }, [matches, query]);
  return matches;
};


/* --------------------------
   Component
   -------------------------- */
const Bills: React.FC = () => {
  const navigate = useNavigate();
  const { toast } = useToast();

  // --- Local states for this page ---
  const [orders, setOrders] = useState<Order[]>([]);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  
  // Local states for UI interactions
  const [viewBill, setViewBill] = useState<Order | null>(null);
  const [deleteBill, setDeleteBill] = useState<Order | null>(null);
  const [isSharing, setIsSharing] = useState<boolean>(false);

  // Local states for filtering and sorting
  const [searchParams, setSearchParams] = useSearchParams();
  const [filteredOrders, setFilteredOrders] = useState<Order[]>([]);
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [sortConfig, setSortConfig] = useState<{ key: SortKey; order: "asc" | "desc" } | null>(null);
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const isMobile = useMediaQuery("(max-width: 768px)");
  const filterPayment = searchParams.get('payment') || 'all';
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
  const [minAmount, setMinAmount] = useState<string>("");
  const [maxAmount, setMaxAmount] = useState<string>("");

  // --- Firebase Data Fetching ---
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
          setLoading(false);
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
    let unsubOrders: (() => void) | null = null;

    const authUnsub = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
      if (user) {
        setLoading(true);
        // Only fetch orders
        unsubOrders = fetchRealtimeData<Order>("orders", user.uid, setOrders);
      } else {
        setOrders([]);
        setLoading(false);
        if (unsubOrders) unsubOrders();
      }
    });

    return () => {
      authUnsub();
      if (unsubOrders) unsubOrders();
    };
  }, [fetchRealtimeData]);

  // --- Filter/Sort Logic ---
  useEffect(() => {
    let tempOrders = [...orders];
    const term = searchTerm.trim().toLowerCase();
    const min = parseFloat(minAmount) || 0;
    const max = parseFloat(maxAmount) || Infinity;

    // 1. Filter by Search Term
    if (term) {
      tempOrders = tempOrders.filter(order => {
        const dateStr = order.invoice_date ? order.invoice_date.toDate().toLocaleDateString("en-IN") : "";
        return (
          order.customer_name?.toLowerCase().includes(term) ||
          (order.id?.toLowerCase().includes(term)) || 
          order.customer_identifier?.toLowerCase().includes(term) ||
          order.total_amount.toString().includes(term) ||
          dateStr.includes(term)
        );
      });
    }

    // 2. Filter by Payment Method
    if (filterPayment !== 'all') {
      tempOrders = tempOrders.filter(order => order.payment_method === filterPayment);
    }

    // 3. Filter by Date Range
    if (dateRange?.from) {
      tempOrders = tempOrders.filter(order => {
        if (!order.invoice_date) return false;
        const invoiceTime = order.invoice_date.toDate().getTime();
        const fromTime = dateRange.from!.setHours(0, 0, 0, 0);
        
        if (dateRange.to) {
          const toTime = dateRange.to.setHours(23, 59, 59, 999);
          return invoiceTime >= fromTime && invoiceTime <= toTime;
        }
        return invoiceTime >= fromTime;
      });
    }

    // 4. Filter by Amount Range
    tempOrders = tempOrders.filter(order => {
      return order.total_amount >= min && order.total_amount <= max;
    });
    
    // 5. Sort
    if (sortConfig) {
      tempOrders.sort((a, b) => {
        let aValue: any;
        let bValue: any;

        switch(sortConfig.key) {
          case 'invoice_date':
            aValue = a.invoice_date?.seconds || 0;
            bValue = b.invoice_date?.seconds || 0;
            break;
          case 'total_amount':
            aValue = a.total_amount;
            bValue = b.total_amount;
            break;
          case 'customer_name':
            aValue = a.customer_name?.toLowerCase() || '';
            bValue = b.customer_name?.toLowerCase() || '';
            break;
          default:
            return 0;
        }

        if (typeof aValue === 'string' && typeof bValue === 'string') {
          return sortConfig.order === 'asc' ? aValue.localeCompare(bValue) : bValue.localeCompare(aValue);
        } else {
          return sortConfig.order === 'asc' ? aValue - bValue : bValue - aValue;
        }
      });
    }

    setFilteredOrders(tempOrders);
  }, [orders, searchTerm, filterPayment, sortConfig, dateRange, minAmount, maxAmount]);

  
  // --- All checkout-related useEffects and logic have been REMOVED ---
  

  // --- Handlers (Delete, PDF, Share) ---
  const handleDeleteBill = async () => {
    if (!deleteBill || !currentUser) return;
    try {
      await deleteDoc(doc(db, "orders", deleteBill.id));
      const itemsQuery = query(collection(db, "order_items"), where("order_id", "==", deleteBill.id), where("user_id", "==", currentUser.uid));
      const itemsSnap = await getDocs(itemsQuery);
      const batch = writeBatch(db);
      itemsSnap.forEach(d => batch.delete(d.ref));
      await batch.commit();
      toast({ title: "Bill Deleted", description: `Bill ${deleteBill.id.substring(0,8)} has been deleted.` });
      setDeleteBill(null);
    } catch (err: any) {
      console.error("Error deleting bill:", err);
      toast({ title: "Error", description: err.message || "Could not delete bill.", variant: "destructive" });
    }
  };

  const handleDownloadPDF = async (order: Order) => {
    if (!currentUser) {
      toast({ title: "Error", description: "User not signed in.", variant: "destructive" });
      return;
    }
    sonnerToast.loading("Generating PDF...", { id: "pdf-download" });
    try {
      const customerDoc = await getDoc(doc(db, "customers", order.customer_id));
      if (!customerDoc.exists()) throw new Error("Customer not found.");
      const customerData = { id: customerDoc.id, ...(customerDoc.data() as any) } as Customer;
      
      const itemsQuery = query(collection(db, "order_items"), where("order_id", "==", order.id), where("user_id", "==", currentUser.uid));
      const itemsSnap = await getDocs(itemsQuery);
      const itemsData: OrderItem[] = [];
      itemsSnap.forEach((d) => itemsData.push(d.data() as OrderItem));
      if (itemsData.length === 0) throw new Error("No items for this bill.");

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
    } catch (err: any) {
      console.error("Error downloading PDF:", err);
      sonnerToast.error("PDF Error", { id: "pdf-download", description: err.message || "Could not generate PDF." });
    }
  };
  
  const handleShare = async (order: Order, medium: 'whatsapp' | 'email') => {
    if (!currentUser) {
      toast({ title: "Error", description: "User not signed in.", variant: "destructive" });
      return;
    }
    setIsSharing(true);
    const toastId = sonnerToast.loading("Preparing shareable link...");
    try {
      const customerDoc = await getDoc(doc(db, "customers", order.customer_id));
      if (!customerDoc.exists()) throw new Error("Customer not found.");
      const customerData = { id: customerDoc.id, ...(customerDoc.data() as any) } as Customer;
      
      const itemsQuery = query(collection(db, "order_items"), where("order_id", "==", order.id), where("user_id", "==", currentUser.uid));
      const itemsSnap = await getDocs(itemsQuery);
      const itemsData: OrderItem[] = [];
      itemsSnap.forEach((d) => itemsData.push(d.data() as OrderItem));
      if (itemsData.length === 0) throw new Error("No items for this bill.");

      sonnerToast.loading("Generating PDF...", { id: toastId });
      const pdfBlob = await generateBillPDF(order, itemsData, customerData);

      sonnerToast.loading("Uploading bill...", { id: toastId });
      const publicUrl = await uploadBillPDF(pdfBlob, currentUser.uid, order.id);

      const message = encodeURIComponent(`Here is your invoice ${order.id.substring(0,8)} from my garage:\n\n${publicUrl}`);
      
      if (medium === 'whatsapp') {
        window.open(`https://api.whatsapp.com/send?text=${message}`);
      } else if (medium === 'email') {
        // @ts-ignore
        const email = customerData.email || '';
        const subject = encodeURIComponent(`Invoice from My Garage: #${order.id.substring(0, 8)}`);
        window.open(`mailto:${email}?subject=${subject}&body=${message}`);
      }
      sonnerToast.success("Share link ready!", { id: toastId });
    } catch (err: any) {
      console.error("Error sharing PDF:", err);
      sonnerToast.error("Share Failed", { id: toastId, description: err.message || "Could not share PDF." });
    } finally {
      setIsSharing(false);
    }
  };

  // --- Filter/Sort UI Handlers ---
  const handleSortChange = (value: string) => {
    if (value === "none") {
      setSortConfig(null);
      return;
    }
    const [key, order] = value.split("-") as [SortKey, "asc" | "desc"];
    setSortConfig({ key, order });
  };
  
  const handlePaymentFilterChange = (value: string) => {
    setSearchParams(prev => {
      if (value === 'all') {
        prev.delete('payment');
      } else {
        prev.set('payment', value);
      }
      return prev;
    }, { replace: true });
  };

  const handleClearAllFilters = () => {
    setSearchTerm("");
    setSortConfig(null);
    setSearchParams({});
    setDateRange(undefined);
    setMinAmount("");
    setMaxAmount("");
    setIsFilterOpen(false);
  };

  const filterCount = useMemo(() => {
    let count = 0;
    if (filterPayment !== 'all') count++;
    if (dateRange) count++;
    if (minAmount) count++;
    if (maxAmount) count++;
    return count;
  }, [filterPayment, dateRange, minAmount, maxAmount]);

  const isAnyFilterActive = useMemo(() => {
    return filterCount > 0 || searchTerm !== "";
  }, [filterCount, searchTerm]);


  /* --------------------------
     Reusable FilterContent component
     -------------------------- */
  const FilterContent = () => (
    <div className="py-4 space-y-6">
      <div className="space-y-2">
        <Label>Payment Status</Label>
        <Select value={filterPayment} onValueChange={handlePaymentFilterChange}>
          <SelectTrigger>
            <SelectValue placeholder="Filter by payment status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="cash">Paid (Cash)</SelectItem>
            <SelectItem value="card">Paid (Card/UPI)</SelectItem>
            <SelectItem value="credit">Udhar (Credit)</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label>Invoice Date Range</Label>
        <Popover>
          <PopoverTrigger asChild>
            <Button id="date" variant={"outline"} className={"w-full justify-start text-left font-normal"}>
              <CalendarIcon className="mr-2 h-4 w-4" />
              {dateRange?.from ? (dateRange.to ? (<>{format(dateRange.from, "LLL dd, y")} - {format(dateRange.to, "LLL dd, y")}</>) : (format(dateRange.from, "LLL dd, y"))) : (<span>Pick a date range</span>)}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar initialFocus mode="range" defaultMonth={dateRange?.from} selected={dateRange} onSelect={setDateRange} numberOfMonths={isMobile ? 1 : 2} />
          </PopoverContent>
        </Popover>
      </div>
      <div className="space-y-2">
        <Label>Amount Range</Label>
        <div className="flex items-center gap-2">
          <Input type="number" placeholder="Min amount" value={minAmount} onChange={(e) => setMinAmount(e.target.value)} />
          <span className="text-muted-foreground">-</span>
          <Input type="number" placeholder="Max amount" value={maxAmount} onChange={(e) => setMaxAmount(e.target.value)} />
        </div>
      </div>
      <div className="pt-4 flex justify-between">
        <Button variant="ghost" onClick={() => { setDateRange(undefined); setMinAmount(""); setMaxAmount(""); }}>
          Reset
        </Button>
        <Button onClick={() => setIsFilterOpen(false)}>
          Apply Filters
        </Button>
      </div>
    </div>
  );
  // ----------------------------------------------------


  /* --------------------------
     Main Render
     -------------------------- */
  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-12 h-12 animate-spin text-primary" />
        <p className="ml-2 text-muted-foreground">Loading bills...</p>
      </div>
    );
  }

  // --- The CheckoutWizard render logic has been REMOVED ---


  // --- Main listing page (past bills) ---
  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5">
      <Navigation />
      <div className="container mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">Bills & Orders</h1>
            <p className="text-muted-foreground">Review past transactions.</p>
          </div>
          {/* --- MODIFIED: "Create New Bill" button now navigates to /cart --- */}
          <Button className="gap-2 shadow-lg" onClick={() => navigate('/cart')}>
            <Plus className="w-4 h-4" /> Create New Bill
          </Button>
        </div>

        {/* --- Search & Filter Card --- */}
        <Card className="mb-6 shadow-md">
          <CardContent className="pt-6 space-y-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input 
                placeholder="Search by Customer, Bill ID, Date, or Amount..." 
                value={searchTerm} 
                onChange={(e) => setSearchTerm(e.target.value)} 
                className="pl-10" 
              />
            </div>
            <div className="flex flex-wrap items-center gap-4">
              {isMobile ? (
                <Dialog open={isFilterOpen} onOpenChange={setIsFilterOpen}>
                  <DialogTrigger asChild>
                    <Button variant={filterCount > 0 ? "secondary" : "outline"} className="gap-2">
                      <Filter className="w-4 h-4" />
                      Filter
                      {filterCount > 0 && <Badge variant="destructive" className="ml-1">{filterCount}</Badge>}
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="sm:max-w-[425px]">
                    <DialogHeader>
                      <DialogTitle>Filter Bills</DialogTitle>
                      <DialogDescription>Apply filters to narrow down your bill list.</DialogDescription>
                    </DialogHeader>
                    <FilterContent />
                  </DialogContent>
                </Dialog>
              ) : (
                <Sheet open={isFilterOpen} onOpenChange={setIsFilterOpen}>
                  <SheetTrigger asChild>
                    <Button variant={filterCount > 0 ? "secondary" : "outline"} className="gap-2">
                      <Filter className="w-4 h-4" />
                      Filter
                      {filterCount > 0 && <Badge variant="destructive" className="ml-1">{filterCount}</Badge>}
                    </Button>
                  </SheetTrigger>
                  <SheetContent>
                    <SheetHeader>
                      <SheetTitle>Filter Bills</SheetTitle>
                    </SheetHeader>
                    <FilterContent />
                  </SheetContent>
                </Sheet>
              )}
              <Select onValueChange={handleSortChange} value={sortConfig ? `${sortConfig.key}-${sortConfig.order}` : 'none'}>
                <SelectTrigger className="w-full sm:w-[220px]">
                  <ArrowUpDown className="w-4 h-4 mr-2" />
                  <SelectValue placeholder="Sort by..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sort by (Default)</SelectItem>
                  <SelectItem value="invoice_date-desc">Date (Newest First)</SelectItem>
                  <SelectItem value="invoice_date-asc">Date (Oldest First)</SelectItem>
                  <SelectItem value="total_amount-desc">Amount (High to Low)</SelectItem>
                  <SelectItem value="total_amount-asc">Amount (Low to High)</SelectItem>
                  <SelectItem value="customer_name-asc">Name (A-Z)</SelectItem>
                  <SelectItem value="customer_name-desc">Name (Z-A)</SelectItem>
                </SelectContent>
              </Select>
              {isAnyFilterActive && (
                <Button variant="ghost" size="sm" onClick={handleClearAllFilters} className="text-destructive gap-1">
                  <XCircle className="w-4 h-4" />
                  Clear All
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
        
        {/* --- Bill List Table --- */}
        <Card className="shadow-lg">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[60px]">S.No.</TableHead> 
                    <TableHead>Date</TableHead>
                    <TableHead>Bill ID</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {orders.length === 0 && !isAnyFilterActive ? (
                    <TableRow>
                      <TableCell colSpan={7} className="h-24 text-center"> 
                        <FileText className="w-12 h-12 mx-auto mb-2 text-muted-foreground" />
                        <h3 className="text-xl font-semibold mb-1">No bills yet</h3>
                        <p className="text-muted-foreground">Click "Create New Bill" to begin a transaction.</p>
                      </TableCell>
                    </TableRow>
                  ) : filteredOrders.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="h-24 text-center"> 
                        <Search className="w-12 h-12 mx-auto mb-2 text-muted-foreground" />
                        <h3 className="text-xl font-semibold mb-1">No bills found</h3>
                        <p className="text-muted-foreground">Try adjusting your search or filter terms.</p>
                        <Button onClick={handleClearAllFilters} variant="link" className="mt-2">
                          Clear All Filters
                        </Button>
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredOrders.map((order, index) => ( 
                      <TableRow key={order.id}>
                        <TableCell className="font-medium">{index + 1}</TableCell> 
                        <TableCell className="whitespace-nowrap">
                          {order.invoice_date ? (order.invoice_date as Timestamp).toDate().toLocaleDateString("en-IN") : "N/A"}
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          {order.id.substring(0, 8).toUpperCase()}...
                        </TableCell>
                        <TableCell className="font-medium">
                          {order.customer_name}
                        </TableCell>
                        <TableCell>
                          <Badge variant={order.payment_method === 'credit' ? 'destructive' : 'default'} className="capitalize">
                            {order.payment_method === 'credit' ? 'Udhar' : 'Paid'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right font-bold text-primary whitespace-nowrap">
                          ₹{Number(order.total_amount).toFixed(2)}
                        </TableCell>
                        <TableCell className="text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-7 w-7">
                                <MoreVertical className="w-4 h-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuLabel>Actions</DropdownMenuLabel>
                              <DropdownMenuItem onClick={() => setViewBill(order)} disabled={isSharing}>
                                <Eye className="w-4 h-4 mr-2" /> View Details
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleDownloadPDF(order)} disabled={isSharing}>
                                <Download className="w-4 h-4 mr-2" /> Download Bill
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem onClick={() => handleShare(order, 'whatsapp')} disabled={isSharing}>
                                {isSharing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <MessageCircle className="w-4 h-4 mr-2" />}
                                Share (WhatsApp)
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleShare(order, 'email')} disabled={isSharing}>
                                {isSharing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Mail className="w-4 h-4 mr-2" />}
                                Share (Email)
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem className="text-destructive" onClick={() => setDeleteBill(order)} disabled={isSharing}>
                                <Trash2 className="w-4 h-4 mr-2" /> Delete Bill
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>

      
      {/* --- Dialogs --- */}
      {/* The `confirmZeroItem` dialog has been REMOVED as it's part of checkout */}
      
      <AlertDialog open={!!deleteBill} onOpenChange={(open) => !open && setDeleteBill(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Bill?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to permanently delete bill "{deleteBill?.id.substring(0,8)}..."?
              This action does <strong className="text-destructive">NOT</strong> restore stock or update Udhaari records. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive hover:bg-destructive/90" onClick={handleDeleteBill}>
              Delete Permanently
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      
      <Dialog open={!!viewBill} onOpenChange={(open) => !open && setViewBill(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Bill Details</DialogTitle>
            <DialogDescription>
              Viewing bill <span className="font-mono">{viewBill?.id.substring(0,8)}...</span>
            </DialogDescription>
          </DialogHeader>
          {viewBill && (
            <ScrollArea className="max-h-[70vh] pr-4">
              <div className="space-y-4 py-4">
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Status:</span>
                  <Badge variant={viewBill.payment_method === 'credit' ? 'destructive' : 'default'} className="capitalize text-sm">
                    {viewBill.payment_method === 'credit' ? 'Udhar' : 'Paid'}
                  </Badge>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Customer:</span>
                  <span className="font-semibold">{viewBill.customer_name}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Billed On:</span>
                  <span className="font-semibold">{viewBill.invoice_date ? (viewBill.invoice_date as Timestamp).toDate().toLocaleDateString("en-IN") : "N/A"}</span>
                </div>
                
                <Separator />
                
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Parts Total (Pre-Discount):</span>
                  <span className="font-semibold">₹{viewBill.total_selling_price?.toFixed(2) ?? '0.00'}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Labor Cost:</span>
                  <span className="font-semibold">₹{viewBill.labor_cost?.toFixed(2) ?? '0.00'}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Discount ({viewBill.discount_percentage ?? 0}%):</span>
                  <span className="font-semibold">- ₹{viewBill.discount_amount?.toFixed(2) ?? '0.00'}</span>
                </div>
                {viewBill.bill_type === 'gst' && (
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">Total GST:</span>
                    <span className="font-semibold">₹{((viewBill.total_parts_subtotal ?? 0) - ((viewBill.total_selling_price ?? 0) - (viewBill.discount_amount ?? 0))).toFixed(2)}</span>
                  </div>
                )}

                <Separator />

                <div className="flex justify-between items-center text-xl font-bold text-primary">
                  <span>Grand Total:</span>
                  <span>₹{viewBill.total_amount.toFixed(2)}</span>
                </div>

                <Separator />
                <div className="text-xs space-y-1 text-muted-foreground">
                  <p>Profit: ₹{viewBill.profit_amount?.toFixed(2) ?? 'N/A'}</p>
                  <p>Type: {viewBill.bill_type === 'gst' ? 'GST Bill' : 'Normal Bill'}</p>
                  <p>Customer ID: {viewBill.customer_identifier}</p>
                </div>
              </div>
            </ScrollArea>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setViewBill(null)}>Close</Button>
            <Button onClick={() => { if(viewBill) handleDownloadPDF(viewBill) }}>
              <Download className="w-4 h-4 mr-2" /> Download PDF
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Bills;