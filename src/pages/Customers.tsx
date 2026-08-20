import { useState, useEffect, useMemo } from "react";
import { db, auth } from "@/integrations/firebase/client";
import {
  collection,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  addDoc,
  deleteDoc,
  doc,
  serverTimestamp,
  Timestamp,
  getDocs,
  updateDoc, // Added for editing
} from "firebase/firestore";
import { onAuthStateChanged, User } from "firebase/auth";
import { useNavigate } from "react-router-dom"; // Added for history link
import Navigation from "@/components/Navigation";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import {
  Users,
  Plus,
  Mail,
  Phone,
  MapPin,
  Trash2,
  Loader2,
  FileDigit,
  Search, // Added
  Filter, // Added
  MoreVertical, // Added
  Edit, // Added
  Eye, // Added
  History, // Added
  XCircle, // Added
  User as UserIcon, // Added
  SlidersHorizontal, // Added
  Briefcase, // --- NEW: Added for business
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
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
import { Textarea } from "@/components/ui/textarea";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"; // Added
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"; // Added
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"; // Added
import { Badge } from "@/components/ui/badge"; // Added
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  SheetClose,
} from "@/components/ui/sheet"; // Added
import { Switch } from "@/components/ui/switch"; // --- NEW: Added Switch
import { Separator } from "@/components/ui/separator"; // --- IMPORTED Separator
// --- REMOVED ScrollArea, we will use native scroll ---

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
  created_at?: Timestamp;
  user_id: string;
}

// --- UPDATED: Form Data Interface ---
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

// Type for the customer being edited
// This Omit now correctly includes all new fields
type CustomerEditData = Omit<CustomerFormData, "customer_id">;

// Added for filters
interface Filters {
  gst: "all" | "yes" | "no";
  contact: "all" | "phone" | "email";
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
}

// Added for sorting
type SortKey = "name" | "created_at" | "customer_id" | "business_name";
type SortDirection = "asc" | "desc";

const Customers = () => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [addingCustomer, setAddingCustomer] = useState(false);
  const [isAddOpen, setIsAddOpen] = useState(false); // Renamed from 'open'
  const [currentUser, setCurrentUser] = useState<User | null>(null);

  // --- UPDATED: State for Add Dialog ---
  const [formData, setFormData] = useState<CustomerFormData>({
    title: "Mr.", // Default title
    name: "",
    phone: "",
    email: "",
    address: "",
    customer_id: "",
    is_business: false, // Default to individual
    business_name: "",
    gst_number: "",
  });
  const [displayCustomerId, setDisplayCustomerId] = useState("Loading...");

  // State for Edit Dialog
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [editFormData, setEditFormData] = useState<CustomerEditData | null>(
    null
  );
  const [isUpdating, setIsUpdating] = useState(false);

  // State for View Dialog
  const [isViewOpen, setIsViewOpen] = useState(false);
  const [viewingCustomer, setViewingCustomer] = useState<Customer | null>(null);

  // State for Delete Dialog
  const [customerToDelete, setCustomerToDelete] = useState<Customer | null>(
    null
  );

  // --- NEW STATE for "Coming Soon" Alert ---
  const [isHistoryAlertOpen, setIsHistoryAlertOpen] = useState(false);

  // State for Search and Filters
  const [searchTerm, setSearchTerm] = useState("");
  const [isFilterOpen, setIsFilterOpen] = useState(false); // For Sheet
  const [filters, setFilters] = useState<Filters>({
    gst: "all",
    contact: "all",
    startDate: "",
    endDate: "",
  });

  // State for Sorting
  const [sortKey, setSortKey] = useState<SortKey>("created_at");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");

  // Auth listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
      if (!user) {
        setCustomers([]);
        setLoading(false);
      }
    });
    return () => unsubscribe();
  }, []);

  // Fetch customers (real-time)
  useEffect(() => {
    if (!currentUser) {
      setLoading(false);
      return;
    }

    setLoading(true);
    const q = query(
      collection(db, "customers"),
      where("user_id", "==", currentUser.uid),
      orderBy("created_at", "desc")
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const data: Customer[] = snapshot.docs.map(
          (doc) => ({ id: doc.id, ...doc.data() } as Customer)
        );
        setCustomers(data);
        setLoading(false);
      },
      (error) => {
        console.error("Error fetching customers:", error);
        toast({
          title: "Error Fetching Customers",
          description: error.message,
          variant: "destructive",
        });
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [currentUser, toast]);

  // Generate Customer ID for Add Dialog
  useEffect(() => {
    const generateCustomerId = async () => {
      if (!currentUser) return "Error";

      const q = query(
        collection(db, "customers"),
        where("user_id", "==", currentUser.uid),
        orderBy("created_at", "desc"),
        limit(1)
      );

      try {
        const snapshot = await getDocs(q);
        if (snapshot.empty) return "CUST-1001";
        const lastCustomer = snapshot.docs[0].data() as Customer;
        const lastId = lastCustomer.customer_id;
        if (!lastId) return "CUST-1001";

        const num = parseInt(lastId.split("-")[1] || "1000", 10);
        return `CUST-${num + 1}`;
      } catch (err) {
        console.error("Error generating customer ID:", err);
        return "Error";
      }
    };

    if (isAddOpen) {
      (async () => {
        const id = await generateCustomerId();
        setFormData((prev) => ({ ...prev, customer_id: id }));
        setDisplayCustomerId(id);
      })();
    } else {
      // --- UPDATED: Reset all fields on close ---
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
      setDisplayCustomerId("Loading...");
    }
  }, [isAddOpen, currentUser]);

  // --- UPDATED: Memoized filtered customers ---
  const filteredCustomers = useMemo(() => {
    const term = searchTerm.toLowerCase();

    return customers.filter((c) => {
      // Search logic (now includes business name)
      const matchesSearch =
        term === "" ||
        c.name.toLowerCase().includes(term) || // Contact person
        (c.business_name && c.business_name.toLowerCase().includes(term)) || // Business name
        c.customer_id?.toLowerCase().includes(term) ||
        c.phone?.toLowerCase().includes(term) ||
        c.email?.toLowerCase().includes(term) ||
        c.gst_number?.toLowerCase().includes(term);

      // Filter: GST
      const matchesGst =
        filters.gst === "all" ||
        (filters.gst === "yes" && !!c.gst_number) ||
        (filters.gst === "no" && !c.gst_number);

      // Filter: Contact
      const matchesContact =
        filters.contact === "all" ||
        (filters.contact === "phone" && !!c.phone) ||
        (filters.contact === "email" && !!c.email);

      // Filter: Date Range
      let matchesDate = true;
      if (c.created_at) {
        // Only filter if customer has a date
        const customerDate = c.created_at.toDate();

        if (filters.startDate) {
          const startDate = new Date(filters.startDate + "T00:00:00"); // Set to start of day
          if (customerDate < startDate) {
            matchesDate = false;
          }
        }
        if (filters.endDate && matchesDate) {
          const endDate = new Date(filters.endDate + "T23:59:59"); // Set to end of day
          if (customerDate > endDate) {
            matchesDate = false;
          }
        }
      } else if (filters.startDate || filters.endDate) {
        // If a date range is set, but customer has no date, exclude them.
        matchesDate = false;
      }

      return matchesSearch && matchesGst && matchesContact && matchesDate;
    });
  }, [customers, searchTerm, filters]);

  // --- UPDATED: Memoized sorted customers ---
  const sortedCustomers = useMemo(() => {
    return [...filteredCustomers].sort((a, b) => {
      let valA: any, valB: any;

      // Get values
      if (sortKey === "created_at") {
        valA = a.created_at?.toMillis() || 0;
        valB = b.created_at?.toMillis() || 0;
      } else if (sortKey === "name") {
        valA = a.name.toLowerCase(); // Sort by contact person name
        valB = b.name.toLowerCase();
      } else if (sortKey === "business_name") {
        valA = a.business_name?.toLowerCase() || ""; // Sort by business name
        valB = b.business_name?.toLowerCase() || "";
      } else {
        // customer_id
        valA = a.customer_id || "";
        valB = b.customer_id || "";
      }

      // Compare
      let comparison = 0;
      if (valA > valB) {
        comparison = 1;
      } else if (valA < valB) {
        comparison = -1;
      }

      return sortDirection === "asc" ? comparison : -comparison;
    });
  }, [filteredCustomers, sortKey, sortDirection]);

  const isAnyFilterActive = useMemo(() => {
    return (
      searchTerm !== "" ||
      filters.gst !== "all" ||
      filters.contact !== "all" ||
      filters.startDate !== "" ||
      filters.endDate !== ""
    );
  }, [searchTerm, filters]);

  const clearFilters = () => {
    setSearchTerm("");
    setFilters({
      gst: "all",
      contact: "all",
      startDate: "",
      endDate: "",
    });
    setIsFilterOpen(false); // Close sheet if open
  };



  // --- CRUD Handlers ---

  // ADD Customer
  const handleAddFormChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  // --- NEW: Handlers for Title and Switch ---
  const handleAddTitleChange = (value: string) => {
    setFormData((prev) => ({ ...prev, title: value }));
  };

  const handleAddBusinessToggle = (checked: boolean) => {
    setFormData((prev) => ({ ...prev, is_business: checked }));
  };
  // ------------------------------------------

  // --- UPDATED: Add Submit ---
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

    setAddingCustomer(true);
    try {
      await addDoc(collection(db, "customers"), {
        user_id: currentUser.uid,
        customer_id: formData.customer_id,
        title: formData.title, // NEW
        name: formData.name.trim(), // Contact person
        phone: formData.phone.trim() || null,
        email: formData.email.trim() || null,
        address: formData.address.trim() || null,
        is_business: formData.is_business, // NEW
        // Save business details only if toggle is on
        business_name: formData.is_business
          ? formData.business_name.trim() || null
          : null, // NEW
        gst_number: formData.is_business
          ? formData.gst_number.trim() || null
          : null, // MODIFIED
        created_at: serverTimestamp(),
      });

      toast({ title: "Success", description: "Customer added successfully" });
      // Reset form (already handled by useEffect on isAddOpen)
      setIsAddOpen(false);
    } catch (error: any) {
      console.error("Error adding customer:", error);
      toast({
        title: "Error Adding Customer",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setAddingCustomer(false);
    }
  };

  // VIEW Customer
  const handleViewDetails = (customer: Customer) => {
    setViewingCustomer(customer);
    setIsViewOpen(true);
  };

  // EDIT Customer
  // --- UPDATED: Edit Click ---
  const handleEditClick = (customer: Customer) => {
    setEditingCustomer(customer);
    setEditFormData({
      title: customer.title || "Mr.", // NEW
      name: customer.name,
      phone: customer.phone || "",
      email: customer.email || "",
      address: customer.address || "",
      is_business: customer.is_business || false, // NEW
      business_name: customer.business_name || "", // NEW
      gst_number: customer.gst_number || "", // This is now business GST
    });
    setIsEditOpen(true);
  };

  const handleEditFormChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setEditFormData((prev) => (prev ? { ...prev, [name]: value } : null));
  };

  // --- NEW: Handlers for Edit Title and Switch ---
  const handleEditTitleChange = (value: string) => {
    setEditFormData((prev) => (prev ? { ...prev, title: value } : null));
  };

  const handleEditBusinessToggle = (checked: boolean) => {
    setEditFormData((prev) => (prev ? { ...prev, is_business: checked } : null));
  };
  // -------------------------------------------

  // --- UPDATED: Edit Submit ---
  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCustomer || !editFormData) return;

    setIsUpdating(true);
    try {
      const docRef = doc(db, "customers", editingCustomer.id);
      await updateDoc(docRef, {
        title: editFormData.title, // NEW
        name: editFormData.name.trim(),
        phone: editFormData.phone.trim() || null,
        email: editFormData.email.trim() || null,
        address: editFormData.address.trim() || null,
        is_business: editFormData.is_business, // NEW
        business_name: editFormData.is_business
          ? editFormData.business_name.trim() || null
          : null, // NEW
        gst_number: editFormData.is_business
          ? editFormData.gst_number.trim() || null
          : null, // MODIFIED
      });
      toast({ title: "Success", description: "Customer details updated." });
      setIsEditOpen(false);
      setEditingCustomer(null);
    } catch (error: any) {
      console.error("Error updating customer:", error);
      toast({
        title: "Error Updating Customer",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsUpdating(false);
    }
  };

  // DELETE Customer
  const handleDeleteClick = (customer: Customer) => {
    setCustomerToDelete(customer);
  };

  const handleDeleteConfirm = async () => {
    if (!customerToDelete) return;
    try {
      await deleteDoc(doc(db, "customers", customerToDelete.id));
      toast({
        title: "Deleted",
        description: `Customer "${customerToDelete.name}" deleted successfully.`,
      });
    } catch (error: any) {
      console.error("Error deleting customer:", error);
      toast({
        title: "Error Deleting Customer",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setCustomerToDelete(null);
    }
  };

  // --- Render ---

  const renderCustomerList = () => {
    if (loading) {
      return (
        <div className="text-center py-12">
          <Loader2 className="w-12 h-12 animate-spin text-primary mx-auto mb-4" />
          <p className="text-muted-foreground">Loading customers...</p>
        </div>
      );
    }

    if (customers.length === 0 && !isAnyFilterActive) {
      return (
        <Card className="shadow-sm text-center py-12">
          <CardContent>
            <Users className="w-16 h-16 mx-auto mb-4 text-muted-foreground" />
            <h3 className="text-xl font-semibold mb-2">No customers yet</h3>
            <p className="text-muted-foreground mb-4">
              Add your first customer using the button above.
            </p>
          </CardContent>
        </Card>
      );
    }

    if (sortedCustomers.length === 0) {
      return (
        <Card className="shadow-sm text-center py-12">
          <CardContent>
            <Users className="w-16 h-16 mx-auto mb-4 text-muted-foreground" />
            <h3 className="text-xl font-semibold mb-2">No Results Found</h3>
            <p className="text-muted-foreground mb-4">
              No customers match your current search and filter criteria.
            </p>
            <Button variant="outline" onClick={clearFilters}>
              Clear All Filters
            </Button>
          </CardContent>
        </Card>
      );
    }

    return (
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[60px]">S.No.</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead>Details</TableHead>
                  <TableHead>Joined</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedCustomers.map((c, index) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">{index + 1}</TableCell>
                    <TableCell>
                      {/* --- UPDATED: Customer Cell --- */}
                      {c.is_business && c.business_name ? (
                        <>
                          <div className="font-medium flex items-center gap-2">
                            <Briefcase className="w-4 h-4 text-primary" />
                            {c.business_name}
                          </div>
                          <div className="text-sm text-muted-foreground">
                            {c.title} {c.name} (Contact)
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="font-medium">
                            {c.title} {c.name}
                          </div>
                          <div className="text-sm text-muted-foreground">
                            {c.customer_id}
                          </div>
                        </>
                      )}
                    </TableCell>
                    <TableCell>
                      {c.phone && (
                        <div className="flex items-center gap-2 text-sm">
                          <Phone className="w-3 h-3 text-muted-foreground" />
                          {c.phone}
                        </div>
                      )}
                      {c.email && (
                        <div className="flex items-center gap-2 text-sm">
                          <Mail className="w-3 h-3 text-muted-foreground" />
                          {c.email}
                        </div>
                      )}
                      {!c.phone && !c.email && (
                        <span className="text-sm text-muted-foreground italic">
                          No contact
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      {c.gst_number && (
                        <Badge variant="outline" className="gap-1">
                          <FileDigit className="w-3 h-3" />
                          GST
                        </Badge>
                      )}
                      {c.address && (
                        <Badge variant="outline" className="gap-1 ml-1">
                          <MapPin className="w-3 h-3" />
                          Address
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {c.created_at
                        ? c.created_at.toDate().toLocaleDateString("en-IN")
                        : "N/A"}
                    </TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <MoreVertical className="w-4 h-4" />
                            <span className="sr-only">Actions</span>
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={() => handleViewDetails(c)}
                          >
                            <Eye className="w-4 h-4 mr-2" />
                            View Details
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => handleEditClick(c)}
                          >
                            <Edit className="w-4 h-4 mr-2" />
                            Edit Customer
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => setIsHistoryAlertOpen(true)}
                          >
                            <History className="w-4 h-4 mr-2" />
                            Customer History
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={() => handleDeleteClick(c)}
                            className="text-destructive"
                          >
                            <Trash2 className="w-4 h-4 mr-2" />
                            Delete Customer
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-6 gap-4">
          <div>
            <h1 className="text-3xl font-bold mb-2">Customers</h1>
            <p className="text-muted-foreground">
              Manage your customer records
            </p>
          </div>
          <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2 shadow-md">
                <Plus className="w-4 h-4" /> New Customer
              </Button>
            </DialogTrigger>
            {/* --- UPDATED: Add Customer Dialog --- */}
            <DialogContent className="sm:max-w-[480px]">
              <DialogHeader>
                <DialogTitle>Add New Customer</DialogTitle>
                <DialogDescription>
                  Enter customer details below. Customer ID is auto-generated.
                </DialogDescription>
              </DialogHeader>
              {/* --- MODIFICATION: Form now wraps footer --- */}
              <form onSubmit={handleAddSubmit}>
                
                {/* --- MODIFICATION: Replaced ScrollArea with native scroll div --- */}
                {/* This div will scroll, and the footer will stay put */}
                <div className="max-h-[60vh] overflow-y-auto space-y-4 p-4 -m-6 mb-0"> 
                  <div>
                    <Label>Customer ID</Label>
                    <Input
                      name="customer_id"
                      value={formData.customer_id}
                      readOnly
                      className="bg-muted cursor-not-allowed"
                    />
                  </div>

                  {/* --- NEW: Is Business Toggle --- */}
                  <div className="flex items-center justify-between space-x-2 py-2 border-b border-t">
                    <Label
                      htmlFor="is_business-add"
                      className="flex flex-col space-y-1"
                    >
                      <span>This is a Business</span>
                      <span className="font-normal text-xs text-muted-foreground">
                        Toggle on to add Business Name and GSTIN.
                      </span>
                    </Label>
                    <Switch
                      id="is_business-add"
                      checked={formData.is_business}
                      onCheckedChange={handleAddBusinessToggle}
                    />
                  </div>
                  
                  {/* --- NEW: Conditional Business Fields --- */}
                  {formData.is_business && (
                    <>
                      <div className="p-4 bg-muted/50 rounded-lg space-y-4">
                        <div className="space-y-2">
                          <Label htmlFor="business_name-add">Business Name *</Label>
                          <Input
                            id="business_name-add"
                            name="business_name"
                            value={formData.business_name}
                            onChange={handleAddFormChange}
                            placeholder="e.g. Acme Motors Ltd."
                            required={formData.is_business}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="gst_number-add">Business GST Number</Label>
                          <Input
                            id="gst_number-add"
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
                {/* --- End of scrolling div --- */}
                
                {/* 3. Footer is moved INSIDE the form and has spacing */}
                <DialogFooter className="pt-6"> 
                  <DialogClose asChild>
                    {/* 4. Cancel button is type="button" */}
                    <Button type="button" variant="outline" disabled={addingCustomer}>
                      Cancel
                    </Button>
                  </DialogClose>
                  <Button
                    type="submit"
                    disabled={
                      addingCustomer ||
                      !formData.customer_id ||
                      formData.customer_id === "Error" ||
                      !formData.name ||
                      (formData.is_business && !formData.business_name)
                    }
                  >
                    {addingCustomer ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Adding...
                      </>
                    ) : (
                      "Add Customer"
                    )}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {/* Search & Filters */}
        <Card className="mb-6">
          <CardContent className="pt-6">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="md:col-span-2 relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search by name, business, ID, phone, GST..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>

              {/* --- UPDATED: Sort By --- */}
              <Select
                value={`${sortKey}-${sortDirection}`}
                onValueChange={(val) => {
                  const [key, dir] = val.split("-") as [SortKey, SortDirection];
                  setSortKey(key);
                  setSortDirection(dir);
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Sort by..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="created_at-desc">Joined: Newest</SelectItem>
                  <SelectItem value="created_at-asc">Joined: Oldest</SelectItem>
                  <SelectItem value="name-asc">Contact Name: A-Z</SelectItem>
                  <SelectItem value="name-desc">Contact Name: Z-A</SelectItem>
                  <SelectItem value="business_name-asc">Business Name: A-Z</SelectItem>
                  <SelectItem value="business_name-desc">Business Name: Z-A</SelectItem>
                  <SelectItem value="customer_id-asc">ID: Ascending</SelectItem>
                  <SelectItem value="customer_id-desc">ID: Descending</SelectItem>
                </SelectContent>
              </Select>

              {/* Filter Button (Sheet Trigger) */}
              <Sheet open={isFilterOpen} onOpenChange={setIsFilterOpen}>
                <SheetTrigger asChild>
                  <Button variant="outline" className="gap-1 relative w-full">
                    <SlidersHorizontal className="w-4 h-4" />
                    Filters
                    {isAnyFilterActive && searchTerm === "" && (
                      <span className="absolute -top-2 -right-2 w-3 h-3 rounded-full bg-primary" />
                    )}
                  </Button>
                </SheetTrigger>
                <SheetContent>
                  <SheetHeader>
                    <SheetTitle>Filters</SheetTitle>
                    <SheetDescription>
                      Refine your customer list.
                    </SheetDescription>
                  </SheetHeader>
                  <div className="space-y-4 py-6">
                    <div>
                      <Label className="text-sm font-medium">GST Status</Label>
                      <Select
                        value={filters.gst}
                        onValueChange={(val: "all" | "yes" | "no") =>
                          setFilters((f) => ({ ...f, gst: val }))
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Filter by GST" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All GST Status</SelectItem>
                          <SelectItem value="yes">Has GST</SelectItem>
                          <SelectItem value="no">No GST</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-sm font-medium">
                        Contact Info
                      </Label>
                      <Select
                        value={filters.contact}
                        onValueChange={(val: "all" | "phone" | "email") =>
                          setFilters((f) => ({ ...f, contact: val }))
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Filter by Contact" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All Contacts</SelectItem>
                          <SelectItem value="phone">Has Phone</SelectItem>
                          <SelectItem value="email">Has Email</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-sm font-medium">
                        Joined After (Start Date)
                      </Label>
                      <Input
                        type="date"
                        value={filters.startDate}
                        onChange={(e) =>
                          setFilters((f) => ({
                            ...f,
                            startDate: e.target.value,
                          }))
                        }
                      />
                    </div>
                    <div>
                      <Label className="text-sm font-medium">
                        Joined Before (End Date)
                      </Label>
                      <Input
                        type="date"
                        value={filters.endDate}
                        onChange={(e) =>
                          setFilters((f) => ({
                            ...f,
                            endDate: e.target.value,
                          }))
                        }
                      />
                    </div>
                  </div>
                  <SheetFooter>
                    <Button variant="ghost" onClick={clearFilters}>
                      Clear All Filters
                    </Button>
                    <SheetClose asChild>
                      <Button>Close</Button>
                    </SheetClose>
                  </SheetFooter>
                </SheetContent>
              </Sheet>
            </div>
            {isAnyFilterActive && (
              <Button
                variant="ghost"
                className="text-primary hover:text-primary h-auto p-0 mt-4 gap-1"
                onClick={clearFilters}
              >
                <XCircle className="w-4 h-4" />
                Clear All Filters & Search
              </Button>
            )}
          </CardContent>
        </Card>

        {/* Customers List */}
        {renderCustomerList()}

        {/* --- Dialogs --- */}

        {/* Delete Confirmation */}
        <AlertDialog
          open={!!customerToDelete}
          onOpenChange={(open) => !open && setCustomerToDelete(null)}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Customer?</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete “
                {customerToDelete?.is_business
                  ? customerToDelete?.business_name
                  : customerToDelete?.name}
                ”? This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDeleteConfirm}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* --- UPDATED: Edit Customer Dialog --- */}
        <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
          {/* --- MODIFICATION: Added scrollbar logic to Edit form --- */}
          <DialogContent className="sm:max-w-[480px]">
            <DialogHeader>
              <DialogTitle>Edit Customer Details</DialogTitle>
              <DialogDescription>
                Update the details for{" "}
                {editingCustomer?.is_business
                  ? editingCustomer?.business_name
                  : editingCustomer?.name}
                .
              </DialogDescription>
            </DialogHeader>
            {editFormData && (
              <form onSubmit={handleEditSubmit}>
                {/* --- MODIFICATION: Replaced ScrollArea with native scroll div --- */}
                <div className="max-h-[60vh] overflow-y-auto space-y-4 p-4 -m-6 mb-0">
                  <div>
                    <Label>Customer ID</Label>
                    <Input
                      value={editingCustomer?.customer_id || "N/A"}
                      readOnly
                      className="bg-muted cursor-not-allowed"
                    />
                  </div>
                  
                  {/* --- NEW: Is Business Toggle --- */}
                  <div className="flex items-center justify-between space-x-2 py-2 border-b border-t">
                    <Label
                      htmlFor="is_business-edit"
                      className="flex flex-col space-y-1"
                    >
                      <span>This is a Business</span>
                    </Label>
                    <Switch
                      id="is_business-edit"
                      checked={editFormData.is_business}
                      onCheckedChange={handleEditBusinessToggle}
                    />
                  </div>

                  {/* --- NEW: Conditional Business Fields --- */}
                  {editFormData.is_business && (
                    <>
                      <div className="p-4 bg-muted/50 rounded-lg space-y-4">
                        <div className="space-y-2">
                          <Label htmlFor="business_name-edit">Business Name *</Label>
                          <Input
                            id="business_name-edit"
                            name="business_name"
                            value={editFormData.business_name}
                            onChange={handleEditFormChange}
                            placeholder="e.g. Acme Motors Ltd."
                            required={editFormData.is_business}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="gst_number-edit">Business GST Number</Label>
                          <Input
                            id="gst_number-edit"
                            name="gst_number"
                            value={editFormData.gst_number}
                            onChange={handleEditFormChange}
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
                      <Select value={editFormData.title} onValueChange={handleEditTitleChange}>
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
                        {editFormData.is_business ? "Contact Person Name *" : "Name *"}
                      </Label>
                      <Input
                        name="name"
                        value={editFormData.name}
                        onChange={handleEditFormChange}
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
                      value={editFormData.phone}
                      onChange={handleEditFormChange}
                      placeholder="e.g. 9876543210"
                    />
                  </div>
                  <div>
                    <Label>Email</Label>
                    <Input
                      name="email"
                      type="email"
                      value={editFormData.email}
                      onChange={handleEditFormChange}
                      placeholder="eg. ramesh@email.com"
                    />
                  </div>
                  <div>
                    <Label>Address</Label>
                    <Textarea
                      name="address"
                      value={editFormData.address}
                      onChange={handleEditFormChange}
                      placeholder="eg. 123 Main St, City"
                    />
                  </div>
                </div>
                {/* --- End of scrolling div --- */}
                
                <DialogFooter className="pt-6">
                  <Button
                    variant="outline"
                    type="button"
                    onClick={() => setIsEditOpen(false)}
                    disabled={isUpdating}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    disabled={
                      isUpdating ||
                      !editFormData.name ||
                      (editFormData.is_business && !editFormData.business_name)
                    }
                  >
                    {isUpdating ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      "Save Changes"
                    )}
                  </Button>
                </DialogFooter>
              </form>
            )}
          </DialogContent>
        </Dialog>

        {/* --- UPDATED: View Customer Dialog --- */}
        <Dialog open={isViewOpen} onOpenChange={setIsViewOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                {viewingCustomer?.is_business ? (
                  <Briefcase className="w-6 h-6" />
                ) : (
                  <UserIcon className="w-6 h-6" />
                )}
                {viewingCustomer?.is_business
                  ? viewingCustomer?.business_name
                  : `${viewingCustomer?.title} ${viewingCustomer?.name}`}
              </DialogTitle>
              <DialogDescription>
                Customer ID: {viewingCustomer?.customer_id}
              </DialogDescription>
            </DialogHeader>
            <div className="pt-4 space-y-4">
              
              {/* Show contact person if business */}
              {viewingCustomer?.is_business && (
                <div className="flex items-center gap-3">
                  <UserIcon className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                  <span className="text-sm font-medium text-muted-foreground w-20">
                    Contact
                  </span>
                  <span className="text-sm break-all">
                    {viewingCustomer?.title} {viewingCustomer?.name}
                  </span>
                </div>
              )}
              
              <div className="flex items-center gap-3">
                <Phone className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                <span className="text-sm font-medium text-muted-foreground w-20">
                  Phone
                </span>
                <span className="text-sm break-all">
                  {viewingCustomer?.phone || (
                    <i className="text-muted-foreground">No phone number</i>
                  )}
                </span>
              </div>
              <div className="flex items-center gap-3">
                <Mail className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                <span className="text-sm font-medium text-muted-foreground w-20">
                  Email
                </span>
                <span className="text-sm break-all">
                  {viewingCustomer?.email || (
                    <i className="text-muted-foreground">No email address</i>
                  )}
                </span>
              </div>
              <div className="flex items-start gap-3">
                <MapPin className="w-4 h-4 text-muted-foreground mt-1 flex-shrink-0" />
                <span className="text-sm font-medium text-muted-foreground w-20 mt-1">
                  Address
                </span>
                <span className="text-sm">
                  {viewingCustomer?.address || (
                    <i className="text-muted-foreground">No address provided</i>
                  )}
                </span>
              </div>
              
              {/* Show GST if business */}
              {viewingCustomer?.is_business && (
                <div className="flex items-center gap-3">
                  <FileDigit className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                  <span className="text-sm font-medium text-muted-foreground w-20">
                    GST No.
                  </span>
                  <span className="text-sm break-all">
                    {viewingCustomer?.gst_number || (
                      <i className="text-muted-foreground">No GST number</i>
                    )}
                  </span>
                </div>
              )}

              <div className="text-xs text-muted-foreground text-center pt-2">
                Joined on:{" "}
                {viewingCustomer?.created_at
                  ? viewingCustomer.created_at
                      .toDate()
                      .toLocaleDateString("en-IN")
                  : "N/A"}
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsViewOpen(false)}>
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* --- NEW: "Coming Soon" Alert Dialog --- */}
        <AlertDialog
          open={isHistoryAlertOpen}
          onOpenChange={setIsHistoryAlertOpen}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Feature Coming Soon!</AlertDialogTitle>
              <AlertDialogDescription>
                A detailed customer history page, including all past bills and
                payments, is on its way.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogAction
                onClick={() => setIsHistoryAlertOpen(false)}
              >
                OK
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
};

export default Customers;