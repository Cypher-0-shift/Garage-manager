import { useState, useEffect, useMemo, useCallback } from "react";
// --- THIS IS THE FIX: Removed 'as firebaseDb' alias ---
import { db, auth } from "@/integrations/firebase/client"; 
import {
  collection,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  serverTimestamp,
  Timestamp,
  getDocs,
  runTransaction
} from "firebase/firestore";
import { onAuthStateChanged, User } from "firebase/auth"; 
import { useSearchParams, useLocation, useNavigate, Link } from "react-router-dom"; // --- 1. IMPORTED Link ---
import { format } from "date-fns";
import { DateRange } from "react-day-picker";

import Navigation from "@/components/Navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import {
  FileText, Plus, Calendar as CalendarIcon, Loader2, Trash2, Edit, User as UserIcon, History, Indianrupee,
  Search, Filter, ArrowUpDown, XCircle,
  ChevronDown,
  MoreVertical, 
  IndianRupee
} from "lucide-react"; 
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogClose
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem, 
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Checkbox } from "@/components/ui/checkbox"; 

// --- A small number to help catch floating point math errors ---
const MATH_TOLERANCE = 0.00001;

// --- STATUS TYPES ---
type UdhaariStatus = "Pending" | "Paid" | "Partially Paid";

// (Interfaces are unchanged)
interface Customer {
  id: string; 
  name: string;
  phone?: string | null;
}
interface UdhaariRecord {
  id: string; 
  customerId: string; 
  name: string; 
  totalPending: number; 
  lastUpdated: Timestamp; 
  user_id: string; 
  history: {
    billId: string | null; 
    description?: string; 
    amount: number; 
    date: Timestamp;
  }[];
}
interface UdhaariFormData {
  customerId: string;
  amount: string;
  description: string;
  entryDate: string; 
}
interface PaymentFormData {
  paymentAmount: string;
  paymentDate: string;
}

type SortKey = "lastUpdated" | "totalPending" | "name";

// --- HELPER FUNCTION: Get Status ---
const getRecordStatus = (record: UdhaariRecord): UdhaariStatus => {
  if (record.totalPending <= MATH_TOLERANCE) {
    return "Paid";
  }
  const hasMadePayment = record.history.some(entry => entry.amount < 0);
  if (hasMadePayment) {
    return "Partially Paid";
  }
  return "Pending";
};
// ------------------------------------

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

const Udhaari = () => {
  const { toast } = useToast();
  const [records, setRecords] = useState<UdhaariRecord[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false); 
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [addDialogOpen, setAddDialogOpen] = useState(false); 
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false); 
  const [recordForPayment, setRecordForPayment] = useState<UdhaariRecord | null>(null); 
  const [recordToDelete, setRecordToDelete] = useState<UdhaariRecord | null>(null); 

  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [historyForRecord, setHistoryForRecord] = useState<UdhaariRecord | null>(null);

  const navigate = useNavigate(); 
  const location = useLocation(); 
  const [searchParams, setSearchParams] = useSearchParams();
  
  const filterStatusParam = searchParams.get('filter') || '';
  const activeStatusFilters = useMemo(() => {
    if (filterStatusParam === 'all_pending') {
      return new Set<UdhaariStatus>(['Pending', 'Partially Paid']);
    }
    return new Set(filterStatusParam.split(',').filter(Boolean) as UdhaariStatus[]);
  }, [filterStatusParam]);

  const [filteredRecords, setFilteredRecords] = useState<UdhaariRecord[]>([]);
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [sortConfig, setSortConfig] = useState<{ key: SortKey; order: "asc" | "desc" } | null>(null);
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const isMobile = useMediaQuery("(max-width: 768px)");
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
  const [minAmount, setMinAmount] = useState<string>("");
  const [maxAmount, setMaxAmount] = useState<string>("");

  const [formData, setFormData] = useState<UdhaariFormData>({
    customerId: "",
    amount: "",
    description: "",
    entryDate: new Date().toISOString().split('T')[0], 
  });
  const [paymentData, setPaymentData] = useState<PaymentFormData>({
    paymentAmount: "",
    paymentDate: new Date().toISOString().split('T')[0], 
  });

  // Auth listener
  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
      if (!user) {
        setRecords([]);
        setCustomers([]);
        setLoading(false);
      }
    });
    return () => unsubscribeAuth();
  }, []);

  // Dashboard redirect fix
  useEffect(() => {
    const filterFromUrl = searchParams.get('filter');
    if (filterFromUrl) {
      // Logic for URL filter is handled by activeStatusFilters useMemo
    }
  }, [searchParams]);


  // Fetch data
  useEffect(() => {
    if (!currentUser) {
      setLoading(false); 
      return; 
    }
    setLoading(true);
    
    const custCol = collection(db, "customers"); 
    const custQuery = query(custCol, where("user_id", "==", currentUser.uid), orderBy("name"));
    const unsubscribeCustomers = onSnapshot(custQuery, (snapshot) => {
      const custList: Customer[] = [];
      snapshot.forEach(doc => custList.push({ id: doc.id, ...doc.data() } as Customer));
      setCustomers(custList);
    }, (error) => {
      console.error("Error fetching customers:", error);
      toast({ title: "Error", description: "Could not fetch customers.", variant: "destructive" });
    });

    const udhaariCol = collection(db, "udhaari"); 
    const udhaariQuery = query(
      udhaariCol,
      where("user_id", "==", currentUser.uid),
      orderBy("lastUpdated", "desc") 
    );
    const unsubscribeUdhaari = onSnapshot(udhaariQuery, (snapshot) => {
      const recordList: UdhaariRecord[] = [];
      snapshot.forEach(doc => recordList.push({ id: doc.id, ...doc.data() } as UdhaariRecord));
      setRecords(recordList);
      setLoading(false); 
    }, (error) => {
      console.error("Error fetching udhaari records:", error);
      toast({ title: "Error", description: "Could not fetch udhaari records.", variant: "destructive" });
      setLoading(false);
    });

    return () => {
      unsubscribeCustomers();
      unsubscribeUdhaari();
    };
  }, [currentUser, toast]); 

  // Form resets
  useEffect(() => {
    if (!addDialogOpen) {
      setFormData({
        customerId: "",
        amount: "",
        description: "",
        entryDate: new Date().toISOString().split('T')[0],
      });
    }
  }, [addDialogOpen]);
  useEffect(() => {
    if (!paymentDialogOpen) {
      setRecordForPayment(null);
      setPaymentData({
        paymentAmount: "",
        paymentDate: new Date().toISOString().split('T')[0],
      });
    }
  }, [paymentDialogOpen]);

  // Form handlers
  const handleFormChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };
  const handleSelectChange = (value: string) => {
    setFormData(prev => ({ ...prev, customerId: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
  e.preventDefault();
  if (!currentUser) return;
  setSubmitting(true);

  const customer = customers.find(c => c.id === formData.customerId);
  if (!customer) {
    toast({ title: "Error", description: "Selected customer not found.", variant: "destructive" });
    setSubmitting(false);
    return;
  }

  const amountNum = parseFloat(formData.amount);
  if (isNaN(amountNum) || amountNum <= 0) {
    toast({ title: "Invalid Amount", description: "Please enter a valid positive amount.", variant: "destructive" });
    setSubmitting(false);
    return;
  }

  try {
    const udhaariCollection = collection(db, "udhaari");

    // ✅ First, find existing record (outside transaction)
    const existingQuery = query(
      udhaariCollection,
      where("user_id", "==", currentUser.uid),
      where("customerId", "==", customer.id),
      limit(1)
    );

    const existingSnap = await getDocs(existingQuery);

    await runTransaction(db, async (transaction) => {
      const newHistoryEntry = {
        billId: null,
        description: formData.description.trim() || "Manual Udhaari Entry",
        amount: amountNum,
        date: Timestamp.fromDate(new Date(formData.entryDate + 'T00:00:00')),
      };

      if (existingSnap.empty) {
        // ✅ Create new udhaari record
        const newRef = doc(udhaariCollection);
        transaction.set(newRef, {
          user_id: currentUser.uid,
          customerId: customer.id,
          name: customer.name,
          totalPending: amountNum,
          lastUpdated: serverTimestamp(),
          history: [newHistoryEntry],
        });
      } else {
        // ✅ Update existing udhaari record
        const existingDoc = existingSnap.docs[0];
        const ref = existingDoc.ref;
        const data = existingDoc.data() as any;

        transaction.update(ref, {
          totalPending: (data.totalPending || 0) + amountNum,
          history: [...(data.history || []), newHistoryEntry],
          lastUpdated: serverTimestamp(),
        });
      }
    });

    toast({
      title: "Success",
      description: "Udhaari record added successfully",
    });

    setAddDialogOpen(false);

  } catch (error: any) {
    console.error("Error adding udhaari:", error);
    toast({
      title: "Error",
      description: error.message || "Failed to add record.",
      variant: "destructive",
    });
  } finally {
    setSubmitting(false);
  }
};


  // handlePaymentSubmit (fix applied)
  const handlePaymentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!recordForPayment || !currentUser) return;
    
    const paymentAmountNum = parseFloat(paymentData.paymentAmount);
    if (isNaN(paymentAmountNum) || paymentAmountNum <= 0) {
      toast({ title: "Invalid Amount", description: "Please enter a valid positive payment amount.", variant: "destructive" });
      return;
    }

    const remainingAmount = recordForPayment.totalPending;
    
    if (paymentAmountNum > remainingAmount + MATH_TOLERANCE) {
      toast({ title: "Invalid Amount", description: `Payment cannot exceed remaining amount of ₹${remainingAmount.toFixed(2)}.`, variant: "destructive" });
      return;
    }

    setSubmitting(true);
    let newTotalPending = remainingAmount - paymentAmountNum;

    if (Math.abs(newTotalPending) < MATH_TOLERANCE) {
      newTotalPending = 0;
    }

    const newHistoryEntry = {
      billId: null, 
      description: "Payment Received",
      amount: -paymentAmountNum, 
      date: Timestamp.fromDate(new Date(paymentData.paymentDate + 'T00:00:00')),
    };

    try {
      const docRef = doc(db, "udhaari", recordForPayment.id);
      const newHistory = recordForPayment.history ? [...recordForPayment.history, newHistoryEntry] : [newHistoryEntry];

      await updateDoc(docRef, {
        totalPending: newTotalPending, 
        history: newHistory,
        lastUpdated: serverTimestamp()
      });

      toast({
        title: "Success",
        description: `Payment of ₹${paymentAmountNum.toFixed(2)} recorded successfully.`,
      });
      setPaymentDialogOpen(false);

    } catch (error: any) {
      console.error("Error recording payment:", error);
      toast({
        title: "Error Recording Payment",
        description: error.message || "Failed to update record.",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  // handleDeleteConfirm (fix applied)
  const handleDeleteConfirm = async () => {
    if (!recordToDelete || !currentUser) return;

    const recordDesc = `record for ${recordToDelete.name}`;

    if (recordToDelete.totalPending > MATH_TOLERANCE) {
      toast({ 
        title: "Cannot Delete", 
        description: `Cannot delete record with a pending balance of ₹${recordToDelete.totalPending.toFixed(2)}. Clear the balance first.`, 
        variant: "destructive" 
      });
      setRecordToDelete(null);
      return;
    }

    try {
      await deleteDoc(doc(db, "udhaari", recordToDelete.id));
      toast({ title: "Success", description: `Udhaari ${recordDesc} deleted.` });
      setRecordToDelete(null); 
    } catch (error: any) {
      console.error("Error deleting udhaari:", error);
      toast({ title: "Error", description: `Failed to delete record. ${error.message}`, variant: "destructive" });
      setRecordToDelete(null); 
    }
  };
  
  // openPaymentDialog (fix applied)
  const openPaymentDialog = (record: UdhaariRecord) => {
    setRecordForPayment(record);
    setPaymentData({
      paymentAmount: "", 
      paymentDate: new Date().toISOString().split('T')[0],
    });
    setPaymentDialogOpen(true);
  };

  const openHistoryDialog = (record: UdhaariRecord) => {
    setHistoryForRecord(record);
    setIsHistoryOpen(true);
  };

  const totals = useMemo(() => {
    const pending = records.reduce((sum, record) => sum + record.totalPending, 0);
    return { pending };
  }, [records]);

  // Main filtering logic (fix applied)
  useEffect(() => {
    if (location.state?.filter) {
      return; 
    }

    let tempRecords = [...records];
    const term = searchTerm.trim().toLowerCase();
    const min = parseFloat(minAmount) || 0;
    const max = parseFloat(maxAmount) || Infinity;

    // 1. Filter by Search
    if (term) {
      tempRecords = tempRecords.filter(record => {
        const dateStr = record.lastUpdated ? record.lastUpdated.toDate().toLocaleDateString("en-IN") : "";
        return (
          record.name?.toLowerCase().includes(term) ||
          record.customerId?.toLowerCase().includes(term) ||
          record.totalPending.toString().includes(term) ||
          dateStr.includes(term)
        );
      });
    }

    // 2. Filter by Status
    if (filterStatusParam === 'all_pending') { 
      tempRecords = tempRecords.filter(record => {
        const status = getRecordStatus(record);
        return status === 'Pending' || status === 'Partially Paid';
      });
    } else if (activeStatusFilters.size > 0) { 
      tempRecords = tempRecords.filter(record => {
        const status = getRecordStatus(record);
        return activeStatusFilters.has(status);
      });
    }

    // 3. Filter by Date Range
    if (dateRange?.from) {
      tempRecords = tempRecords.filter(record => {
        if (!record.lastUpdated) return false;
        const recordTime = record.lastUpdated.toDate().getTime();
        const fromTime = dateRange.from!.setHours(0, 0, 0, 0);
        
        if (dateRange.to) {
          const toTime = dateRange.to.setHours(23, 59, 59, 999);
          return recordTime >= fromTime && recordTime <= toTime;
        }
        return recordTime >= fromTime;
      });
    }

    // 4. Filter by Amount Range
    tempRecords = tempRecords.filter(record => {
      return record.totalPending >= min && record.totalPending <= max;
    });

    // 5. Sort
    if (sortConfig) {
      tempRecords.sort((a, b) => {
        let aValue: any;
        let bValue: any;

        switch(sortConfig.key) {
          case 'lastUpdated':
            aValue = a.lastUpdated?.seconds || 0;
            bValue = b.lastUpdated?.seconds || 0;
            break;
          case 'totalPending':
            aValue = a.totalPending;
            bValue = b.totalPending;
            break;
          case 'name':
            aValue = a.name?.toLowerCase() || '';
            bValue = b.name?.toLowerCase() || '';
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

    setFilteredRecords(tempRecords);
  }, [records, searchTerm, filterStatusParam, sortConfig, dateRange, minAmount, maxAmount, location.state, activeStatusFilters]);

  const handleSortChange = (value: string) => {
    if (value === "none") {
      setSortConfig(null);
      return;
    }
    const [key, order] = value.split("-") as [SortKey, "asc" | "desc"];
    setSortConfig({ key, order });
  };
  
  const handleStatusFilterChange = (status: UdhaariStatus) => {
    const currentFilters = new Set(activeStatusFilters);

    if (currentFilters.has(status)) {
      currentFilters.delete(status);
    } else {
      currentFilters.add(status);
    }

    const newFilterParam = Array.from(currentFilters).join(',');

    setSearchParams(prev => {
      if (newFilterParam) {
        prev.set('filter', newFilterParam);
      } else {
        prev.delete('filter');
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
    if (activeStatusFilters.size > 0) count++;
    if (dateRange) count++;
    if (minAmount) count++;
    if (maxAmount) count++;
    return count;
  }, [activeStatusFilters, dateRange, minAmount, maxAmount]); 

  const isAnyFilterActive = useMemo(() => {
    return filterCount > 0 || searchTerm !== "";
  }, [filterCount, searchTerm]);

  // Filter Content Component
  const FilterContent = () => {
    const getSelectedStatusText = () => {
      if (activeStatusFilters.size === 0) {
        return "Filter by status";
      }
      if (activeStatusFilters.size === 3) {
        return "All Statuses";
      }
      return Array.from(activeStatusFilters).join(', ');
    };
    
    return (
      <div className="py-4 space-y-6">
        {/* Checkbox filter */}
        <div className="space-y-2">
          <Label>Udhaari Status</Label>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="w-full justify-between">
                <span className="truncate pr-2">{getSelectedStatusText()}</span>
                <ChevronDown className="w-4 h-4 text-muted-foreground" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-[var(--radix-dropdown-menu-trigger-width)]">
              <DropdownMenuItem
                onSelect={(e) => e.preventDefault()} // Keep menu open
                onClick={() => handleStatusFilterChange("Pending")}
                className="flex items-center gap-2"
              >
                <Checkbox
                  id="filter-pending"
                  checked={activeStatusFilters.has("Pending")}
                  readOnly 
                />
                <label htmlFor="filter-pending" className="cursor-pointer">
                  Pending (No Payments)
                </label>
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={(e) => e.preventDefault()} // Keep menu open
                onClick={() => handleStatusFilterChange("Partially Paid")}
                className="flex items-center gap-2"
              >
                <Checkbox
                  id="filter-partial"
                  checked={activeStatusFilters.has("Partially Paid")}
                  readOnly
                />
                <label htmlFor="filter-partial" className="cursor-pointer">
                  Partially Paid
                </label>
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={(e) => e.preventDefault()} // Keep menu open
                onClick={() => handleStatusFilterChange("Paid")}
                className="flex items-center gap-2"
              >
                <Checkbox
                  id="filter-paid"
                  checked={activeStatusFilters.has("Paid")}
                  readOnly
                />
                <label htmlFor="filter-paid" className="cursor-pointer">
                  Paid
                </label>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        
        {/* Date Range */}
        <div className="space-y-2">
          <Label>Last Updated Date Range</Label>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                id="date"
                variant={"outline"}
                className={"w-full justify-start text-left font-normal"}
              >
                <CalendarIcon className="mr-2 h-4 w-4" />
                {dateRange?.from ? (
                  dateRange.to ? (
                    <>
                      {format(dateRange.from, "LLL dd, y")} -{" "}
                      {format(dateRange.to, "LLL dd, y")}
                    </>
                  ) : (
                    format(dateRange.from, "LLL dd, y")
                  )
                ) : (
                  <span>Pick a date range</span>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                initialFocus
                mode="range"
                defaultMonth={dateRange?.from}
                selected={dateRange}
                onSelect={setDateRange}
                numberOfMonths={isMobile ? 1 : 2}
              />
            </PopoverContent>
          </Popover>
        </div>

        {/* Amount Range */}
        <div className="space-y-2">
          <Label>Pending Amount Range</Label>
          <div className="flex items-center gap-2">
            <Input
              type="number"
              placeholder="Min amount"
              value={minAmount}
              onChange={(e) => setMinAmount(e.target.value)}
            />
            <span className="text-muted-foreground">-</span>
            <Input
              type="number"
              placeholder="Max amount"
              value={maxAmount}
              onChange={(e) => setMaxAmount(e.target.value)}
            />
          </div>
        </div>

        {/* Action Buttons */}
        <div className="pt-4 flex justify-between">
          <Button 
            variant="ghost" 
            onClick={() => {
              setDateRange(undefined);
              setMinAmount("");
              setMaxAmount("");
            }}
          >
            Reset
          </Button>
          <Button onClick={() => setIsFilterOpen(false)}>
            Apply Filters
          </Button>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      <div className="container mx-auto px-4 py-8">
        {/* Header and Add Button */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-6 gap-4">
          <div>
            <h1 className="text-3xl font-bold mb-2">Udhaari (Credit) Records</h1>
            <p className="text-muted-foreground">Track pending payments from customers</p>
          </div>
          <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2 shadow-md w-full sm:w-auto"><Plus className="w-4 h-4" /> Add Manual Udhaari</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add Manual Udhaari</DialogTitle>
                <DialogDescription>Manually add a new credit amount to a customer's balance.</DialogDescription>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4 pt-4">
                <div className="space-y-2">
                  <Label htmlFor="customer">Customer *</Label>
                  <Select value={formData.customerId} onValueChange={handleSelectChange} required>
                    <SelectTrigger id="customer"><SelectValue placeholder="Select customer" /></SelectTrigger>
                    <SelectContent>
                      {customers.map((c) => (<SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>))}
                    </SelectContent>
                  </Select>
                  {/* --- 2. MODIFIED "New Customer" Link --- */}
                  <div className="text-right">
                    <Button 
                      type="button" 
                      variant="link" 
                      size="sm" 
                      className="p-0 h-auto text-xs"
                      asChild 
                    >
                      <Link 
                        to="/customers?new=true" // --- Navigates to Customers page ---
                        onClick={() => {
                          toast({
                            title: "Navigating to Customers",
                            description: "Add your new customer, then return here.",
                          });
                          setAddDialogOpen(false); 
                        }}
                      >
                        New Customer?
                      </Link>
                    </Button>
                  </div>
                  {/* --- End of Modification --- */}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="amount">Amount (₹) *</Label>
                  <Input id="amount" name="amount" type="number" step="0.01" value={formData.amount} onChange={handleFormChange} required placeholder="eg. 500.00" min="0.01"/>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="description">Description</Label>
                  <Textarea id="description" name="description" value={formData.description} onChange={handleFormChange} placeholder="eg. Parts purchased, service details..." />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="entryDate">Entry Date</Label>
                  <Input id="entryDate" name="entryDate" type="date" value={formData.entryDate} onChange={handleFormChange} />
                </div>
                <DialogFooter className="pt-4">
                  <DialogClose asChild><Button type="button" variant="outline" disabled={submitting}>Cancel</Button></DialogClose>
                  <Button type="submit" disabled={submitting}>
                    {submitting ? <><Loader2 className="w-4 h-4 mr-2 animate-spin"/>Adding...</> : "Add Udhaari"}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>


        {/* Summary Card */}
        <Card className="shadow-sm mb-6">
          <CardContent className="pt-6 text-center">
            <p className="text-sm text-muted-foreground mb-1">Total Pending Amount</p>
            <p className="text-3xl font-bold text-destructive">₹{totals.pending.toFixed(2)}</p>
          </CardContent>
        </Card>

        {/* Search & Filter Card */}
        <Card className="mb-6 shadow-md">
          <CardContent className="pt-6 space-y-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input 
                placeholder="Search by Customer, Amount, or Date..." 
                value={searchTerm} 
                onChange={(e) => setSearchTerm(e.target.value)} 
                className="pl-10" 
              />
            </div>
            <div className="flex flex-wrap items-center gap-4">
              {/* Responsive Filter */}
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
                      <DialogTitle>Filter Udhaari</DialogTitle>
                      <DialogDescription>
                        Apply filters to narrow down your Udhaari list.
                      </DialogDescription>
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
                      <SheetTitle>Filter Udhaari</SheetTitle>
                    </SheetHeader>
                    <FilterContent />
                  </SheetContent>
                </Sheet>
              )}
              {/* Sort Dropdown */}
              <Select onValueChange={handleSortChange} value={sortConfig ? `${sortConfig.key}-${sortConfig.order}` : 'none'}>
                <SelectTrigger className="w-full sm:w-[220px]">
                  <ArrowUpDown className="w-4 h-4 mr-2" />
                  <SelectValue placeholder="Sort by..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sort by (Default)</SelectItem>
                  <SelectItem value="lastUpdated-desc">Date (Newest First)</SelectItem>
                  <SelectItem value="lastUpdated-asc">Date (Oldest First)</SelectItem>
                  <SelectItem value="totalPending-desc">Amount (High to Low)</SelectItem>
                  <SelectItem value="totalPending-asc">Amount (Low to High)</SelectItem>
                  <SelectItem value="name-asc">Name (A-Z)</SelectItem>
                  <SelectItem value="name-desc">Name (Z-A)</SelectItem>
                </SelectContent>
              </Select>
              {/* Clear All Button */}
              {isAnyFilterActive && (
                <Button variant="ghost" size="sm" onClick={handleClearAllFilters} className="text-destructive gap-1">
                  <XCircle className="w-4 h-4" />
                  Clear All
                </Button>
              )}
            </div>
          </CardContent>
        </Card>


        {/* List View (Table) */}
        {loading ? (
          <div className="text-center py-12">
            <Loader2 className="w-12 h-12 animate-spin text-primary mx-auto mb-4" />
            <p className="text-muted-foreground">Loading records...</p>
          </div>
        ) : (
          <Card className="shadow-lg">
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[60px]">S.No.</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Last Updated</TableHead>
                      <TableHead className="text-right">Pending Amount</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {records.length === 0 && !isAnyFilterActive ? (
                      <TableRow>
                        <TableCell colSpan={6} className="h-24 text-center">
                          <FileText className="w-12 h-12 mx-auto mb-2 text-muted-foreground" />
                          <h3 className="text-xl font-semibold mb-1">No udhaari records yet</h3>
                          <p className="text-muted-foreground">Add a new record using the button above.</p>
                        </TableCell>
                      </TableRow>
                    ) : filteredRecords.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="h-24 text-center">
                          <Search className="w-12 h-12 mx-auto mb-2 text-muted-foreground" />
                          <h3 className="text-xl font-semibold mb-1">No records found</h3>
                          <p className="text-muted-foreground">Try adjusting your search or filter terms.</p>
                          <Button onClick={handleClearAllFilters} variant="link" className="mt-2">
                            Clear All Filters
                          </Button>
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredRecords.map((record, index) => {
                        const status = getRecordStatus(record);
                        return (
                          <TableRow key={record.id}>
                            <TableCell className="font-medium">{index + 1}</TableCell>
                            <TableCell className="font-medium">
                              <div className="flex items-center gap-2">
                                <UserIcon className="w-4 h-4 text-primary" />
                                <div className="flex flex-col">
                                  <span>{record.name}</span>
                                  <span className="text-xs text-muted-foreground font-mono">{record.customerId.substring(0, 8)}...</span>
                                </div>
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge variant={
                                status === "Paid" ? "default" :
                                status === "Partially Paid" ? "secondary" :
                                "destructive"
                              }>
                                {status}
                              </Badge>
                            </TableCell>
                            <TableCell className="whitespace-nowrap">
                              {record.lastUpdated ? record.lastUpdated.toDate().toLocaleDateString('en-IN') : "N/A"}
                            </TableCell>
                            <TableCell className="text-right font-bold text-destructive whitespace-nowrap">
                              ₹{status === "Paid" ? "0.00" : record.totalPending.toFixed(2)}
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
                                  {record.totalPending >= 0.01 && (
                                    <DropdownMenuItem onClick={() => openPaymentDialog(record)}>
                                      <IndianRupee className="w-4 h-4 mr-2" /> Record Payment
                                    </DropdownMenuItem>
                                  )}
                                  <DropdownMenuItem onClick={() => openHistoryDialog(record)}>
                                    <History className="w-4 h-4 mr-2" /> View History
                                  </DropdownMenuItem>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem 
                                    className="text-destructive" 
                                    onClick={() => setRecordToDelete(record)}
                                  >
                                    <Trash2 className="w-4 h-4 mr-2" /> Delete Record
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </TableCell>
                          </TableRow>
                        )
                      })
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        )}

        {/* --- Record Payment Dialog --- */}
        <Dialog open={paymentDialogOpen} onOpenChange={setPaymentDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Record Payment for {recordForPayment?.name}</DialogTitle>
              <DialogDescription>
                Remaining Amount: ₹{(recordForPayment ? recordForPayment.totalPending : 0).toFixed(2)}
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handlePaymentSubmit} className="space-y-4 pt-4">
              <div className="space-y-2">
                <Label htmlFor="paymentAmount">Payment Amount (₹) *</Label>
                <Input
                  id="paymentAmount"
                  name="paymentAmount"
                  type="number"
                  step="0.01"
                  min="0.01"
                  max={recordForPayment ? Math.max(0.01, recordForPayment.totalPending).toFixed(2) : '0'}
                  value={paymentData.paymentAmount}
                  onChange={(e) => setPaymentData(prev => ({...prev, paymentAmount: e.target.value}))}
                  required
                  placeholder="eg. 100.00"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="paymentDate">Payment Date</Label>
                <Input id="paymentDate" name="paymentDate" type="date" value={paymentData.paymentDate} onChange={(e) => setPaymentData(prev => ({...prev, paymentDate: e.target.value}))} />
              </div>
              <DialogFooter className="pt-4">
                <DialogClose asChild><Button type="button" variant="outline" disabled={submitting}>Cancel</Button></DialogClose>
                <Button type="submit" disabled={submitting}>
                  {submitting ? <><Loader2 className="w-4 h-4 mr-2 animate-spin"/>Recording...</> : "Record Payment"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
        
        {/* Delete Dialog (FIXED) */}
        <AlertDialog open={!!recordToDelete} onOpenChange={(open) => !open && setRecordToDelete(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Udhaari Record?</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete the entire record for "{recordToDelete?.name}"? This can only be done if the pending balance is ₹0.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleDeleteConfirm} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* History Dialog */}
        <Dialog open={isHistoryOpen} onOpenChange={setIsHistoryOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Udhaari History for {historyForRecord?.name}</DialogTitle>
              <DialogDescription>
                Total Pending: ₹{historyForRecord?.totalPending.toFixed(2)}
              </DialogDescription>
            </DialogHeader>
            <div className="max-h-[60vh] overflow-y-auto pr-4">
              {historyForRecord && historyForRecord.history && historyForRecord.history.length > 0 ? (
                <div className="space-y-4">
                  {[...historyForRecord.history].sort((a, b) => b.date.seconds - a.date.seconds).map((entry, index) => (
                    <div key={index} className="flex items-center justify-between gap-4 p-3 bg-muted/50 rounded-lg">
                      <div>
                        <p className="font-medium">{entry.description || (entry.amount > 0 ? "Credit Added" : "Payment Received")}</p>
                        <p className="text-sm text-muted-foreground">
                          {entry.date.toDate().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                        </p>
                      </div>
                      <Badge variant={entry.amount > 0 ? "destructive" : "default"} className="whitespace-nowrap">
                        {entry.amount > 0 ? `+ ₹${entry.amount.toFixed(2)}` : `- ₹${Math.abs(entry.amount).toFixed(2)}`}
                      </Badge>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-center text-muted-foreground py-8">No history entries found for this customer.</p>
              )}
            </div>
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="outline">Close</Button>
              </DialogClose>
            </DialogFooter>
          </DialogContent>
        </Dialog>

      </div>
    </div>
  );
};

export default Udhaari;