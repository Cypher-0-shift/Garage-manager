// Parts.tsx — FIXED filter race condition and ADDED "Clear All"
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams, useLocation } from "react-router-dom";
import { db, auth } from "@/integrations/firebase/client";
import {
  collection,
  query,
  orderBy,
  onSnapshot,
  doc,
  updateDoc,
  deleteDoc,
  where,
  Timestamp,
  serverTimestamp,
} from "firebase/firestore";

import { useCart } from "@/context/CartContext";
import { toast as sonnerToast } from "sonner";

import Navigation from "@/components/Navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import UpdateStockDialog from "@/components/UpdateStockDialog";

import {
  Search,
  Package,
  Edit,
  Trash2,
  Plus,
  PackagePlus,
  ShoppingCart,
  Filter,
  ArrowUpDown,
  Wrench,
  X,
  Loader2,
  AlertTriangle,
  XCircle, 
} from "lucide-react";

import { useToast } from "@/hooks/use-toast";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  SheetFooter,
} from "@/components/ui/sheet";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/* --------------------------
   Types
   -------------------------- */
interface PartData {
  hsn_code: string;
  part_name: string;
  car_company: string | null;
  car_model: string | null;
  vehicle_type: string | null;
  buying_price: number;
  selling_price: number;
  sgst_percentage: number;
  cgst_percentage: number;
  quantity: number;
  low_stock_threshold: number;
  image_url: string | null;
  created_at?: Timestamp | null;
  updated_at?: Timestamp | null;
  user_id: string;
}
interface Part extends PartData { id: string; }
type SortKey = "selling_price" | "part_name" | "quantity" | "hsn_code";


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
const Parts: React.FC = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const location = useLocation();

  const { addToCart, cartItems, showCart } = useCart();

  const [parts, setParts] = useState<Part[]>([]);
  const [filteredParts, setFilteredParts] = useState<Part[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [updateStockPart, setUpdateStockPart] = useState<Part | null>(null);
  const [isInventoryMode, setIsInventoryMode] = useState<boolean>(false);
  const [sortConfig, setSortConfig] = useState<{ key: SortKey; order: "asc" | "desc" } | null>(null);

  const [searchParams, setSearchParams] = useSearchParams();

  // --- 1. MODIFIED: 'activeFilter' now ONLY reads from searchParams ---
  const activeFilter = useMemo(() => {
    return searchParams.get('filter');
  }, [searchParams]);
  // -----------------------------------------------------------------

  const [cartPart, setCartPart] = useState<Part | null>(null);
  const [cartQuantity, setCartQuantity] = useState<number | string>(""); 

  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const isMobile = useMediaQuery("(max-width: 768px)");

  const [selectedCompany, setSelectedCompany] = useState<string>("all");
  const [selectedModel, setSelectedModel] = useState<string>("all");

  const companies = useMemo(() => Array.from(new Set(parts.map((p) => p.car_company).filter(Boolean))) as string[], [parts]);
  const models = useMemo(
    () => Array.from(new Set(parts.filter((p) => selectedCompany === "all" || p.car_company === selectedCompany).map((p) => p.car_model).filter(Boolean))) as string[],
    [parts, selectedCompany]
  );
  
  const filterCount = useMemo(() => {
    let count = 0;
    if (activeFilter === 'low_stock') count++;
    if (selectedCompany !== 'all') count++;
    if (selectedModel !== 'all') count++;
    return count;
  }, [activeFilter, selectedCompany, selectedModel]);

  const isAnyFilterActive = useMemo(() => {
    return filterCount > 0 || searchTerm !== "";
  }, [filterCount, searchTerm]);
// removed state->URL sync effect (we now rely only on URL query)
/* --------------------------
     Firebase listener
     -------------------------- */
  useEffect(() => {
    setLoading(true);
    let unsubscribeSnapshot: (() => void) | null = null;
    const unsubscribeAuth = auth.onAuthStateChanged((user) => {
      if (user) {
        const partsCollection = collection(db, "stock");
        const q = query(partsCollection, where("user_id", "==", user.uid), orderBy("created_at", "desc"));
        unsubscribeSnapshot = onSnapshot(
          q,
          (querySnapshot) => {
            const partsData: Part[] = [];
            querySnapshot.forEach((d) => partsData.push({ 
              id: d.id, 
              ...(d.data() as PartData),
              price: (d.data() as PartData).selling_price,
              stock: (d.data() as PartData).quantity,
            }));
            setParts(partsData);
            setLoading(false);
          },
          (error) => {
            console.error("Error fetching parts: ", error);
            toast({ title: "Error Fetching Data", description: "Could not fetch parts. Check Firestore rules/indexes.", variant: "destructive" });
            setLoading(false);
          }
        );
      } else {
        setParts([]);
        setFilteredParts([]);
        setLoading(false);
        if (unsubscribeSnapshot) unsubscribeSnapshot();
      }
    });

    return () => {
      unsubscribeAuth();
      if (unsubscribeSnapshot) unsubscribeSnapshot();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toast]);

  /* --------------------------
     Filter & sort
     -------------------------- */
  // --- 3. MODIFIED: This effect now waits for location.state to be processed ---
  useEffect(() => {
    // If location.state has a filter, it hasn't been synced to the URL yet.
    // We wait for the next render (after the effect at line 175) to run.
    if (location.state?.filter) {
      return; 
    }
    // ------------------------------------------------------------------------

    const term = searchTerm.trim().toLowerCase();
    
    let filtered = parts.filter((part) => {
      const matchesSearch =
        (!term) ||
        (part.part_name?.toLowerCase().includes(term)) ||
        (part.hsn_code?.toLowerCase().includes(term)) ||
        (part.car_company?.toLowerCase().includes(term)) ||
        (part.car_model?.toLowerCase().includes(term));
      const matchesCompany = selectedCompany === "all" || part.car_company === selectedCompany;
      const matchesModel = selectedModel === "all" || part.car_model === selectedModel;
      const isLowStock = part.quantity <= (part.low_stock_threshold ?? 0);
      const matchesLowStockFilter = activeFilter === 'low_stock' ? isLowStock : true;

      return matchesSearch && matchesCompany && matchesModel && matchesLowStockFilter;
    });

    if (sortConfig) {
      filtered.sort((a, b) => {
        const aValue: any = a[sortConfig.key];
        const bValue: any = b[sortConfig.key];
        let comparison = 0;
        if (sortConfig.key === "selling_price" || sortConfig.key === "quantity") {
          comparison = Number(aValue) - Number(bValue);
        } else {
          comparison = String(aValue).localeCompare(String(bValue));
        }
        return sortConfig.order === "asc" ? comparison : -comparison;
      });
    }

    setFilteredParts(filtered);
  }, [searchTerm, parts, selectedCompany, selectedModel, sortConfig, activeFilter, location.state]); // Added location.state


  /* --------------------------
     CRUD handlers (Unchanged)
     -------------------------- */
  const handleDelete = async () => {
    if (!deleteId) return;
    const partToDelete = parts.find((p) => p.id === deleteId);
    try {
      await deleteDoc(doc(db, "stock", deleteId));
      toast({ title: "Success", description: `${partToDelete?.part_name || "Part"} deleted.` });
      setDeleteId(null);
    } catch (error: any) {
      console.error("Error deleting part: ", error);
      toast({ title: "Error", description: `Could not delete part: ${error.message}`, variant: "destructive" });
      setDeleteId(null);
    }
  };

  const handleUpdateStock = async (partId: string, newQuantity: number) => {
    if (newQuantity < 0) {
      toast({ title: "Invalid", description: "Quantity cannot be negative.", variant: "destructive" });
      return;
    }
    const partToUpdate = parts.find((p) => p.id === partId);
    try {
      await updateDoc(doc(db, "stock", partId), { quantity: newQuantity, updated_at: serverTimestamp() });
      toast({ title: "Success", description: `Stock for ${partToUpdate?.part_name} updated.` });
      setUpdateStockPart(null);
    } catch (error: any) {
      console.error("Error updating stock: ", error);
      toast({ title: "Error", description: `Could not update stock: ${error.message}`, variant: "destructive" });
      setUpdateStockPart(null);
    }
  };

  /* --------------------------
     Cart handlers (Unchanged)
     -------------------------- */
  const handleAddToCartClick = (part: Part) => {
    setCartPart(part);
    setCartQuantity("");
  };

  const handleConfirmAddToCart = () => {
    if (!cartPart || !cartQuantity) return;
    
    const quantityNum = Number(cartQuantity);
    if (isNaN(quantityNum) || quantityNum <= 0) {
       sonnerToast.error("Invalid Quantity", {
         description: "Please enter a quantity greater than 0.",
       });
       return;
    }

    const maxAddQuantity = getMaxAllowedQuantity(cartPart);
    if (quantityNum > maxAddQuantity) {
      sonnerToast.warning("Stock Limit Reached", {
        description: `Only ${maxAddQuantity} ${part.part_name} available to add.`,
      });
      return;
    }
    
    const partForCart = {
      ...cartPart,
      id: cartPart.id,
      partName: cartPart.part_name,
      price: cartPart.selling_price,
      stock: cartPart.quantity,
    };

    const result = addToCart(partForCart, quantityNum);

    if (result === 'success') {
      sonnerToast.success('Added to Cart', {
        description: `${quantityNum} x ${cartPart.part_name} added.`,
      });
      showCart();
      setCartPart(null);
    } else if (result === 'error_stock') {
      sonnerToast.warning('Stock Limit Reached', {
        description: `Only ${maxAddQuantity} unit(s) available.`,
      });
    }
  };

  const handleSortChange = (value: string) => {
    if (value === "none") {
      setSortConfig(null);
      return;
    }
    const [key, order] = value.split("-") as [SortKey, "asc" | "desc"];
    setSortConfig({ key, order });
  };

  const handleLowStockToggle = (checked: boolean) => {
    if (checked) {
      setSearchParams(prev => {
        prev.set('filter', 'low_stock');
        return prev;
      });
    } else {
      setSearchParams(prev => {
        prev.delete('filter');
        return prev;
      });
    }
  };

  const handleClearAllFilters = () => {
    setSearchTerm("");
    setSelectedCompany("all");
    setSelectedModel("all");
    setSortConfig(null); 
    setSearchParams({}); 
    setIsFilterOpen(false); 
  };


  /* --------------------------
     Calculations (Unchanged)
     -------------------------- */
  const getMaxAllowedQuantity = useCallback((part: Part | null): number => {
    if (!part) return 0;
    const inCart = cartItems.find((c) => c.id === part.id);
    const available = part.quantity - (inCart?.quantity || 0);
    return available < 0 ? 0 : available;
  }, [cartItems]);


  // --- Reusable Filter Content Component (Unchanged) ---
  const FilterContent = () => (
    <div className="py-4 space-y-4">
      <div className="flex items-center justify-between p-3 rounded-lg border bg-muted/30">
        <Label htmlFor="low-stock-filter" className="flex items-center gap-2 font-medium text-destructive">
           <AlertTriangle className="w-4 h-4" />
           Show Low Stock Only
        </Label>
        <Switch
          id="low-stock-filter"
          checked={activeFilter === 'low_stock'}
          onCheckedChange={handleLowStockToggle}
        />
      </div>
      <div>
        <Label className="mb-2 block">Company</Label>
        <Select value={selectedCompany} onValueChange={(value) => { setSelectedCompany(value); setSelectedModel("all"); }}>
          <SelectTrigger><SelectValue placeholder="All Companies" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Companies</SelectItem>
            {companies.map((company) => <SelectItem key={company} value={company}>{company}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label className="mb-2 block">Car Name/Model</Label>
        <Select value={selectedModel} onValueChange={(v) => { setSelectedModel(v); }}>
          <SelectTrigger><SelectValue placeholder="All Models" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Models</SelectItem>
            {models.map((model) => <SelectItem key={model} value={model}>{model}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      {isMobile && (
        <DialogFooter className="pt-4">
          <Button variant="outline" className="w-full" onClick={() => setIsFilterOpen(false)}>
            Close
          </Button>
        </DialogFooter>
      )}
    </div>
  );


  /* --------------------------
     UI
     -------------------------- */
  return (
    <div className="min-h-screen bg-background pb-32"> 
      <Navigation />
      <div className="container mx-auto px-4 py-8">
        {/* Header (Unchanged) */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold mb-2">Parts Inventory</h1>
            <p className="text-muted-foreground">Manage your spare parts stock</p>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center space-x-2">
              <Wrench className="w-4 h-4" />
              <Label htmlFor="inventory-mode">Modify Inventory</Label>
              <Switch id="inventory-mode" checked={isInventoryMode} onCheckedChange={(v) => setIsInventoryMode(!!v)} />
            </div>
            <Link to="/add-stock">
              <Button className="gap-2"><Plus className="w-4 h-4" />New Stock</Button>
            </Link>
          </div>
        </div>

        {/* Controls */}
        <Card className="mb-6">
          <CardContent className="pt-6 space-y-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input placeholder="Search by name, code, company, or model..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-10" />
            </div>

            <div className="flex flex-wrap items-center gap-4">
              {isMobile ? (
                <Dialog open={isFilterOpen} onOpenChange={setIsFilterOpen}>
                  <DialogTrigger asChild>
                    <Button 
                      variant={filterCount > 0 ? "secondary" : "outline"} 
                      className="gap-2"
                    >
                      <Filter className="w-4 h-4" />
                      Filter
                      {filterCount > 0 && <Badge variant="destructive" className="ml-1">{filterCount}</Badge>}
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="sm:max-w-[425px]">
                    <DialogHeader>
                      <DialogTitle>Filter Parts</DialogTitle>
                    </DialogHeader>
                    <FilterContent />
                  </DialogContent>
                </Dialog>
              ) : (
                <Sheet open={isFilterOpen} onOpenChange={setIsFilterOpen}>
                  <SheetTrigger asChild>
                    <Button 
                      variant={filterCount > 0 ? "secondary" : "outline"} 
                      className="gap-2"
                    >
                      <Filter className="w-4 h-4" />
                      Filter
                      {filterCount > 0 && <Badge variant="destructive" className="ml-1">{filterCount}</Badge>}
                    </Button>
                  </SheetTrigger>
                  <SheetContent>
                    <SheetHeader>
                      <SheetTitle>Filter Parts</SheetTitle>
                    </SheetHeader>
                    <FilterContent />
                  </SheetContent>
                </Sheet>
              )}

              <Select onValueChange={handleSortChange} defaultValue="none">
                <SelectTrigger className="w-full sm:w-[200px]">
                  <ArrowUpDown className="w-4 h-4 mr-2" />
                  <SelectValue placeholder="Sort by..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No Sorting</SelectItem>
                  <SelectItem value="selling_price-asc">Price: Low to High</SelectItem>
                  <SelectItem value="selling_price-desc">Price: High to Low</SelectItem>
                  <SelectItem value="part_name-asc">Name (A-Z)</SelectItem>
                  <SelectItem value="part_name-desc">Name (Z-A)</SelectItem>
                  <SelectItem value="quantity-asc">Quantity: Low to High</SelectItem>
                  <SelectItem value="quantity-desc">Quantity: High to Low</SelectItem>
                  <SelectItem value="hsn_code-asc">HSN (A-Z)</SelectItem>
                  <SelectItem value="hsn_code-desc">HSN (Z-A)</SelectItem>
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

        {/* Filter Banner (Unchanged) */}
        {activeFilter === 'low_stock' && (
          <div className="mb-4 flex justify-between items-center p-3 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-sm text-red-800 font-medium flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" />
              Showing only low stock items.
            </p>
            <Button variant="ghost" size="sm" onClick={() => handleLowStockToggle(false)}>
              Clear Filter
            </Button>
          </div>
        )}

        {/* Content */}
        {loading ? (
          <div className="text-center py-12">
            <Loader2 className="w-12 h-12 animate-spin text-primary mx-auto mb-4" />
            <p className="text-muted-foreground">Loading parts...</p>
          </div>
        ) : filteredParts.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <Package className="w-16 h-16 mx-auto mb-4 text-muted-foreground" />
              <h3 className="text-xl font-semibold mb-2">
                {isAnyFilterActive ? "No parts match your filter" : "No parts found"}
              </h3>
              <p className="text-muted-foreground mb-4">
                {isAnyFilterActive ? "Try adjusting your filters to see more items." : (searchTerm ? "Try a different search term" : "Add your first part")}
              </p>
              {!isAnyFilterActive && !searchTerm && <Link to="/add-stock"><Button>Add Your First Part</Button></Link>}
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {filteredParts.map((part) => (
              <Card key={part.id} className="overflow-hidden hover:shadow-lg transition-shadow flex flex-col">
                {part.image_url && (
                  <div className="h-28 bg-muted overflow-hidden">
                    <img src={part.image_url} alt={part.part_name} className="w-full h-full object-cover" onError={(e) => e.currentTarget.src = 'https://placehold.co/300x200/cccccc/ffffff?text=Image+Error'} />
                  </div>
                )}
                <CardContent className="p-3 flex flex-col flex-grow">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-bold text-base truncate mb-1">{part.part_name}</h3>
                      <p className="text-xs text-muted-foreground">{part.car_company || 'N/A'}</p>
                    </div>
                    <Badge variant={part.quantity <= (part.low_stock_threshold ?? 0) ? "destructive" : "secondary"} className="text-xs flex-shrink-0">
                      {part.quantity <= (part.low_stock_threshold ?? 0) ? "Low" : "Stock"}
                    </Badge>
                  </div>
                  <div className="space-y-0.5 mb-2 flex-grow">
                    <div className="flex justify-between text-xs"><span className="text-muted-foreground">HSN:</span><span className="font-medium">{part.hsn_code}</span></div>
                    <div className="flex justify-between text-xs"><span className="text-muted-foreground">Car:</span><span className="font-medium truncate">{part.car_model || 'N/A'}</span></div>
                    <div className="flex justify-between text-xs"><span className="text-muted-foreground">Type:</span><span className="font-medium">{part.vehicle_type || 'N/A'}</span></div>
                    <div className="flex justify-between text-xs"><span className="text-muted-foreground">Buy/Sell:</span><span className="font-medium">₹{part.buying_price?.toFixed(2) ?? '0.00'} / ₹{part.selling_price?.toFixed(2) ?? '0.00'}</span></div>
                    <div className="flex justify-between text-xs"><span className="text-muted-foreground">Qty:</span><span className={`font-medium ${part.quantity <= (part.low_stock_threshold ?? 0) ? "text-destructive" : ""}`}>{part.quantity}</span></div>
                  </div>
                  <div className="mt-auto">
                    {isInventoryMode ? (
                      <div className="grid grid-cols-3 gap-1">
                        <Button variant="outline" size="sm" className="gap-1 text-xs h-8" onClick={() => setUpdateStockPart(part)}><PackagePlus className="w-3 h-3" />Add Qty</Button>
                        <Button variant="outline" size="sm" className="gap-1 text-xs h-8" onClick={() => navigate(`/edit-stock/${part.id}`)}><Edit className="w-3 h-3" />Edit</Button>
                        <Button variant="destructive" size="sm" onClick={() => setDeleteId(part.id)} className="gap-1 text-xs h-8"><Trash2 className="w-3 h-3" /></Button>
                      </div>
                    ) : (
                      <Button 
                        variant="outline" 
                        size="sm" 
                        className="w-full gap-2" 
                        onClick={() => handleAddToCartClick(part)}
                        disabled={getMaxAllowedQuantity(part) <= 0}
                      >
                        <ShoppingCart className="w-4 h-4" />
                        {getMaxAllowedQuantity(part) <= 0 ? "Out of Stock" : "Add to Cart"}
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Delete confirmation (Unchanged) */}
        <AlertDialog open={deleteId !== null} onOpenChange={(open) => !open && setDeleteId(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Are you sure?</AlertDialogTitle>
              <AlertDialogDescription>This will permanently delete the part. This action cannot be undone.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleDelete}>Delete</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Update stock dialog (Unchanged) */}
        {updateStockPart && (
          <UpdateStockDialog
            open={!!updateStockPart}
            onOpenChange={(open) => { if (!open) setUpdateStockPart(null); }}
            partName={updateStockPart.part_name}
            currentQuantity={updateStockPart.quantity}
            onUpdate={(newQty) => handleUpdateStock(updateStockPart.id, newQty)}
          />
        )}

        {/* "Add to cart" dialog (Unchanged) */}
        <Dialog open={!!cartPart} onOpenChange={(open) => !open && setCartPart(null)}>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle>Add to Cart</DialogTitle>
            </DialogHeader>

            <div className="py-4 space-y-4">
              <p className="font-medium">{cartPart?.part_name}</p>

              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="add-quantity" className="text-right">Quantity</Label>
                <Input
                  id="add-quantity"
                  type="number"
                  placeholder="0"
                  min={1}
                  max={cartPart ? getMaxAllowedQuantity(cartPart) : 0}
                  value={cartQuantity}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val === "") {
                      setCartQuantity("");
                      return;
                    }
                    
                    const numVal = parseInt(val, 10);
                    if (isNaN(numVal)) {
                      setCartQuantity("");
                      return;
                    }

                    const max = cartPart ? getMaxAllowedQuantity(cartPart) : 0;
                    
                    if (numVal > max) {
                      setCartQuantity(max);
                      sonnerToast.warning("Stock Limit Reached", {
                        description: `Only ${max} unit(s) available to add.`,
                      });
                    } else {
                       setCartQuantity(numVal < 1 ? "" : numVal); 
                    }
                  }}
                  onBlur={(e) => {
                      const val = parseInt(e.target.value, 10);
                      if (isNaN(val) || val <= 0) {
                          setCartQuantity(""); 
                      }
                  }}
                  className="col-span-3"
                />
              </div>

              <p className="text-sm text-muted-foreground text-right">{cartPart ? getMaxAllowedQuantity(cartPart) : 0} available to add</p>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setCartPart(null)}>Cancel</Button>
              <Button 
                onClick={handleConfirmAddToCart} 
                disabled={!cartPart || !cartQuantity || Number(cartQuantity) <= 0 || getMaxAllowedQuantity(cartPart) <= 0}
              >
                Add to Cart
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        
      </div>
    </div>
  );
};

export default Parts;