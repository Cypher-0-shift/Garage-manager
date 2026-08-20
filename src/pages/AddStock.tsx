import { useState, useEffect, useMemo } from "react";
import { useNavigate, Link } from "react-router-dom";
import { db, storage, auth } from "@/integrations/firebase/client"; 
import { collection, addDoc, serverTimestamp, getDocs, query, orderBy, limit, where, onSnapshot } from "firebase/firestore";
import { onAuthStateChanged, User } from "firebase/auth"; 
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import Navigation from "@/components/Navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Upload, Loader2 } from "lucide-react";

// (Initial form data is unchanged)
const initialFormData = {
  hsnCode: "",
  partName: "",
  carCompany: "",
  carModel: "", 
  vehicleType: "", 
  buyingPrice: "",
  sellingPrice: "",
  sgst: "",
  cgst: "",
  quantity: "",
  lowStockThreshold: "5", 
};

interface StockData {
  car_company?: string | null;
  car_model?: string | null;
}

const AddStock = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string>("");

  const [formData, setFormData] = useState(initialFormData);
  const [allStock, setAllStock] = useState<StockData[]>([]);

  // (useEffect for onSnapshot is unchanged)
  useEffect(() => {
    let stockListenerUnsub: (() => void) | undefined;

    const startStockListener = (userId: string) => {
      try {
        const stockCollection = collection(db, "stock");
        const q = query(stockCollection, where("user_id", "==", userId));
        
        stockListenerUnsub = onSnapshot(q, (snapshot) => {
          const stockData = snapshot.docs.map(doc => doc.data() as StockData);
          setAllStock(stockData);
        }, (err) => { 
          console.error("Failed to fetch stock list for dropdowns", err);
          toast({ title: "Error", description: "Could not fetch company/model list." });
        });
        
      } catch (err: any) {
        console.error("Failed to set up stock listener", err);
        toast({ title: "Error", description: "Could not fetch company/model list." });
      }
    };

    const unsubscribeAuth = onAuthStateChanged(auth, (user: User | null) => {
      if (stockListenerUnsub) {
        stockListenerUnsub();
        stockListenerUnsub = undefined;
      }
      setAllStock([]);

      if (user) {
        startStockListener(user.uid);
      }
    });

    return () => {
      unsubscribeAuth();
      if (stockListenerUnsub) {
        stockListenerUnsub(); 
      }
    };
  }, [toast]);

  // (Memoized lists are unchanged)
  const uniqueCompanies = useMemo(() => {
    const companies = new Set<string>();
    allStock.forEach(part => {
      if (part.car_company) companies.add(part.car_company);
    });
    return Array.from(companies).sort();
  }, [allStock]);

  const availableModels = useMemo(() => {
    const models = new Set<string>();
    allStock
      .filter(part => {
        // If no company selected, show all models
        if (!formData.carCompany) return true;
        // Otherwise, only show models for that company
        return part.car_company === formData.carCompany;
      })
      .forEach(part => {
        if (part.car_model) models.add(part.car_model);
      });
    return Array.from(models).sort();
  }, [allStock, formData.carCompany]);

  // --- 1. MODIFIED: `handleChange` now resets `carModel` if `carCompany` changes ---
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    
    setFormData(prev => ({
      ...prev,
      [name]: value,
      // If user changes company, reset the model
      ...(name === 'carCompany' && { carModel: "" }),
    }));
  };
  
  // This is now ONLY for the "Vehicle Type" dropdown
  const handleSelectChange = (name: string, value: string) => {
     setFormData(prev => ({
       ...prev,
       [name]: value,
     }));
  };
  // -------------------------------------------------------------------------

  // (All other handlers: handleImageChange, uploadImage, generateHSNCode, handleSubmit are unchanged)
  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setImageFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    } else {
      setImageFile(null);
      setImagePreview("");
    }
  };

  const uploadImage = async (userId: string): Promise<string | null> => {
    if (!imageFile) return null;
    setUploading(true);
    try {
      const fileExt = imageFile.name.split(".").pop();
      const fileName = `${userId}/${Date.now()}.${fileExt}`;
      const storageRef = ref(storage, `part-images/${fileName}`);
      const snapshot = await uploadBytes(storageRef, imageFile);
      const downloadURL = await getDownloadURL(snapshot.ref);
      return downloadURL;
    } catch (error: any) {
      console.error("Image upload failed:", error);
      toast({
        title: "Image upload failed",
        description: error.message || "Could not upload image.",
        variant: "destructive",
      });
      return null;
    } finally {
      setUploading(false);
    }
  };

  const generateHSNCode = async () => {
     try {
        const stockCollection = collection(db, "stock");
        const q = query(stockCollection, orderBy("hsn_code", "desc"), limit(1));
        const querySnapshot = await getDocs(q);
        if (querySnapshot.empty) {
          return "HSN-001";
        }
        const lastCode = querySnapshot.docs[0].data().hsn_code;
        const match = lastCode.match(/HSN-(\d+)/);
        if (match && match[1]) {
          const nextNum = parseInt(match[1], 10) + 1;
          return `HSN-${String(nextNum).padStart(3, "0")}`;
        }
     } catch(error) {
         console.error("Error generating HSN:", error);
     }
     return `HSN-ERR-${Date.now().toString().slice(-3)}`;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const user = auth.currentUser; 
    if (!user) {
      toast({ title: "Authentication Error", description: "You must be logged in to add stock.", variant: "destructive" });
      return; 
    }
    setLoading(true); 

    try {
      let imageUrl: string | null = null;
      if (imageFile) {
        imageUrl = await uploadImage(user.uid);
        if (imageUrl === null) {
          setLoading(false);
          toast({ title: "Upload Incomplete", description: "Image upload failed. Please try again.", variant: "destructive" });
          return;
        }
      }

      let hsnCode = formData.hsnCode.trim(); 
      if (!hsnCode) {
        hsnCode = await generateHSNCode();
      }

      const stockCollection = collection(db, "stock");
      await addDoc(stockCollection, {
        user_id: user.uid, 
        hsn_code: hsnCode,
        part_name: formData.partName.trim(),
        car_company: formData.carCompany.trim() || null, 
        car_model: formData.carModel.trim() || null, 
        vehicle_type: formData.vehicleType || null, 
        buying_price: parseFloat(formData.buyingPrice) || 0, 
        selling_price: parseFloat(formData.sellingPrice) || 0, 
        sgst_percentage: parseFloat(formData.sgst) || 0, 
        cgst_percentage: parseFloat(formData.cgst) || 0, 
        quantity: parseInt(formData.quantity, 10) || 0, 
        low_stock_threshold: parseInt(formData.lowStockThreshold, 10) || 5, 
        image_url: imageUrl, 
        created_at: serverTimestamp(), 
      });

      toast({
        title: "Success!",
        description: "Stock added successfully.",
      });

      navigate("/parts");
    } catch (error: any) {
      console.error("Error adding stock:", error);
      toast({
        title: "Error Adding Stock",
        description: error.message || "An unexpected error occurred. Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };
  
  // (JSX is modified below)
  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      <div className="container mx-auto px-4 py-8">
        <div className="mb-6">
          <Link to="/parts">
            <Button variant="ghost" size="sm" className="gap-2">
              <ArrowLeft className="w-4 h-4" />
              Back to Parts
            </Button>
          </Link>
        </div>

        <Card className="max-w-2xl mx-auto">
          <CardHeader>
            <CardTitle>Add New Stock</CardTitle>
            <CardDescription>Add a new spare part to your inventory.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                
                <div className="space-y-2">
                  <Label htmlFor="hsnCode">
                    HSN Code <span className="text-muted-foreground text-xs">(optional - auto-generated)</span>
                  </Label>
                  <Input
                    id="hsnCode"
                    name="hsnCode"
                    placeholder="eg. 9011" 
                    value={formData.hsnCode}
                    onChange={handleChange}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="partName">Part Name *</Label>
                  <Input
                    id="partName"
                    name="partName"
                    placeholder="eg. Brake Pad Set" 
                    value={formData.partName}
                    onChange={handleChange}
                    required 
                  />
                </div>

                {/* --- 2. MODIFIED: Car Company Field (now Input + datalist) --- */}
                <div className="space-y-2">
                  <Label htmlFor="carCompany">Car Company</Label>
                  <Input
                    id="carCompany"
                    name="carCompany"
                    placeholder="eg. Maruti Suzuki" 
                    value={formData.carCompany}
                    onChange={handleChange} // <-- Use standard handleChange
                    list="company-list" // <-- Link to datalist
                  />
                  <datalist id="company-list">
                    {uniqueCompanies.map((company) => (
                      <option key={company} value={company} />
                    ))}
                  </datalist>
                  <p className="text-xs text-muted-foreground">Type a new company or select an existing one.</p>
                </div>

                {/* --- 3. MODIFIED: Car Model Field (now Input + datalist) --- */}
                <div className="space-y-2">
                  <Label htmlFor="carModel">Car Name / Model</Label>
                  <Input
                    id="carModel"
                    name="carModel"
                    placeholder="eg. Swift Dzire VXI" 
                    value={formData.carModel}
                    onChange={handleChange} // <-- Use standard handleChange
                    list="model-list" // <-- Link to datalist
                  />
                  <datalist id="model-list">
                    {availableModels.map((model) => (
                      <option key={model} value={model} />
                    ))}
                  </datalist>
                  <p className="text-xs text-muted-foreground">Models are suggested based on company.</p>
                </div>

                {/* --- Vehicle Type (Unchanged, still a Select) --- */}
                <div className="space-y-2">
                  <Label htmlFor="vehicleType">Vehicle Type</Label>
                  <Select
                      name="vehicleType" 
                      value={formData.vehicleType} 
                      onValueChange={(value) => handleSelectChange('vehicleType', value)}
                  >
                    <SelectTrigger id="vehicleType">
                      <SelectValue placeholder="Select vehicle type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Petrol">Petrol</SelectItem>
                      <SelectItem value="Diesel">Diesel</SelectItem>
                      <SelectItem value="Electric">Electric</SelectItem>
                      <SelectItem value="Other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div></div>

                {/* (Rest of the form is unchanged) */}
                
                <div className="space-y-2">
                  <Label htmlFor="buyingPrice">Buying Price (₹) *</Label>
                  <Input
                    id="buyingPrice"
                    name="buyingPrice"
                    type="number"
                    step="0.01" 
                    placeholder="eg. 1200.50" 
                    value={formData.buyingPrice}
                    onChange={handleChange}
                    required 
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="sellingPrice">Selling Price (₹) *</Label>
                  <Input
                    id="sellingPrice"
                    name="sellingPrice"
                    type="number"
                    step="0.01"
                    placeholder="eg. 1550.00" 
                    value={formData.sellingPrice}
                    onChange={handleChange}
                    required 
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="sgst">SGST % *</Label>
                  <Input
                    id="sgst"
                    name="sgst"
                    type="number"
                    step="0.01"
                    placeholder="eg. 9" 
                    value={formData.sgst}
                    onChange={handleChange}
                    required 
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="cgst">CGST % *</Label>
                  <Input
                    id="cgst"
                    name="cgst"
                    type="number"
                    step="0.01"
                    placeholder="eg. 9" 
                    value={formData.cgst}
                    onChange={handleChange}
                    required 
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="quantity">Quantity *</Label>
                  <Input
                    id="quantity"
                    name="quantity"
                    type="number"
                    step="1" 
                    placeholder="eg. 10" 
                    value={formData.quantity}
                    onChange={handleChange}
                    required 
                    min="0" 
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="lowStockThreshold">Low Stock Alert Threshold</Label>
                  <Input
                    id="lowStockThreshold"
                    name="lowStockThreshold"
                    type="number"
                    step="1"
                    placeholder="eg. 5" 
                    value={formData.lowStockThreshold}
                    onChange={handleChange}
                    min="0" 
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="image">Part Image</Label>
                <div className="flex flex-col gap-4">
                  <div className="flex items-center gap-4">
                    <Input
                      id="image"
                      type="file"
                      accept="image/*" 
                      onChange={handleImageChange}
                      className="flex-1"
                      disabled={uploading} 
                    />
                    {uploading && <Loader2 className="w-5 h-5 animate-spin text-primary" />}
                  </div>
                  {imagePreview && (
                    <div className="relative w-full max-w-xs border rounded-lg overflow-hidden">
                      <img
                        src={imagePreview}
                        alt="Selected part preview"
                        className="w-full h-48 object-cover"
                        onError={(e) => (e.currentTarget.src = 'https://placehold.co/300x200/cccccc/ffffff?text=Preview+Error')}
                      />
                    </div>
                  )}
                </div>
              </div>

              <div className="flex gap-4 pt-4">
                <Button type="submit" className="flex-1" disabled={loading || uploading}>
                  {loading ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Adding...
                    </>
                  ) : (
                    "Add Stock"
                  )}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => navigate("/parts")}
                  disabled={loading || uploading} 
                >
                  Cancel
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default AddStock;