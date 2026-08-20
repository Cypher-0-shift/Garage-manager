import { useState, useEffect } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { db, storage, auth } from "@/integrations/firebase/client"; // Firebase client
import { doc, getDoc, updateDoc, serverTimestamp } from "firebase/firestore"; // Firestore functions
import { ref, uploadBytes, getDownloadURL, deleteObject } from "firebase/storage"; // Storage functions
import Navigation from "@/components/Navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"; // For Vehicle Type
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Upload, Loader2, X } from "lucide-react"; // Icons

// Updated initial form data to match the simplified structure
const initialFormData = {
  hsnCode: "",
  partName: "",
  carCompany: "",
  carModel: "", // Combined field for Car Name/Model
  vehicleType: "", // New field
  buyingPrice: "",
  sellingPrice: "",
  sgst: "",
  cgst: "",
  quantity: "",
  lowStockThreshold: "5", // Default value
};

const EditStock = () => {
  const { id } = useParams<{ id: string }>(); // Get the document ID from the URL
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false); // For form submission loading state
  const [loadingData, setLoadingData] = useState(true); // For initial data fetching state
  const [uploading, setUploading] = useState(false); // For image uploading state
  const [imageFile, setImageFile] = useState<File | null>(null); // State for the new image file
  const [imagePreview, setImagePreview] = useState<string>(""); // State for the image preview URL
  const [originalImageUrl, setOriginalImageUrl] = useState<string>(""); // State to keep track of the initial image URL

  const [formData, setFormData] = useState(initialFormData); // State for form data

  // Effect to fetch the part data when the component mounts or ID changes
  useEffect(() => {
    const fetchPartData = async () => {
      // Check if ID is present, otherwise show error and redirect
      if (!id) {
        toast({ title: "Error", description: "No part ID provided.", variant: "destructive" });
        navigate("/parts"); // Redirect back to parts list
        return;
      }

      setLoadingData(true); // Start loading indicator
      try {
        // Create a reference to the specific Firestore document
        const docRef = doc(db, "stock", id);
        // Fetch the document data
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
          // If the document exists, get its data
          const data = docSnap.data();
          // Map the database fields (snake_case) to the form state (camelCase)
          setFormData({
            hsnCode: data.hsn_code || "",
            partName: data.part_name || "",
            carCompany: data.car_company || "",
            carModel: data.car_model || "", // Combined field
            vehicleType: data.vehicle_type || "", // New field
            buyingPrice: String(data.buying_price || 0), // Convert number to string for input
            sellingPrice: String(data.selling_price || 0), // Convert number to string
            sgst: String(data.sgst_percentage || 0), // Convert number to string
            cgst: String(data.cgst_percentage || 0), // Convert number to string
            quantity: String(data.quantity || 0), // Convert number to string
            lowStockThreshold: String(data.low_stock_threshold || 5), // Convert number to string, default 5
          });
          // Set image preview and store the original URL
          setImagePreview(data.image_url || "");
          setOriginalImageUrl(data.image_url || "");
        } else {
          // If document doesn't exist, throw an error
           throw new Error("Part not found in database.");
        }
      } catch (error: any) {
        // Log error and show toast message on failure
        console.error("Error fetching part:", error);
        toast({
          title: "Error Fetching Part",
          description: error.message || "Could not find the requested part.",
          variant: "destructive",
        });
        navigate("/parts"); // Redirect back if part not found
      } finally {
        // Stop loading indicator
        setLoadingData(false);
      }
    };

    fetchPartData();
  }, [id, navigate, toast]); // Dependencies for the effect

  // Handles changes for standard input fields
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

   // Handles changes specifically for the Select component
  const handleSelectChange = (name: string, value: string) => {
     setFormData({
      ...formData,
      [name]: value,
    });
  };

  // Handles image file selection and generates preview
  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setImageFile(file); // Store the selected file object
      // Use FileReader to create a preview URL
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result as string); // Set preview URL
      };
      reader.readAsDataURL(file);
    } else {
      // If no file is selected, clear the file and preview
      setImageFile(null);
      setImagePreview(originalImageUrl); // Revert preview to original if selection is cancelled
    }
  };

  // Clears the selected image file and preview
  const removeImage = () => {
    setImageFile(null); // Clear the stored file
    setImagePreview(""); // Clear the preview URL
    // The actual deletion from storage happens during form submission if needed
  };

  // Uploads a new image, deletes the old one (if exists), and returns the new URL
  const uploadImageAndUpdate = async (userId: string): Promise<string | null> => {
    if (!imageFile) return null; // Only proceed if a new file is selected

    setUploading(true); // Start uploading indicator
    try {
      // 1. Upload the new image
      const fileExt = imageFile.name.split(".").pop();
      const fileName = `${userId}/${Date.now()}.${fileExt}`; // Create unique filename
      const newStorageRef = ref(storage, `part-images/${fileName}`); // Create storage reference
      const snapshot = await uploadBytes(newStorageRef, imageFile); // Upload file
      const downloadURL = await getDownloadURL(snapshot.ref); // Get public URL

      // 2. Delete the old image from Firebase Storage if it exists
      if (originalImageUrl) {
        try {
          const oldStorageRef = ref(storage, originalImageUrl); // Get reference from the original URL
          await deleteObject(oldStorageRef); // Delete the old file
        } catch (deleteError: any) {
          // Log a warning if deletion fails but continue, as the new image is uploaded
          console.warn("Could not delete old image during update:", deleteError);
          // Don't show a toast here, maybe log it for admin review
        }
      }
      setOriginalImageUrl(downloadURL); // Update the original URL state for subsequent edits
      return downloadURL; // Return the new URL

    } catch (error: any) {
      // Handle upload errors
      console.error("Image upload failed:", error);
      toast({
        title: "Image Upload Failed",
        description: error.message || "Could not upload the new image.",
        variant: "destructive",
      });
      return null; // Return null to indicate failure
    } finally {
      // Stop uploading indicator
      setUploading(false);
    }
  };

  // Deletes the existing image from Firebase Storage
  const deleteExistingImage = async (userId: string): Promise<boolean> => {
     // Only proceed if there's an original image URL
     if (!originalImageUrl) return true; // Nothing to delete

     setUploading(true); // Show loading indicator
     try {
        // Get reference from the original URL
        const storageRef = ref(storage, originalImageUrl);
        // Delete the file
        await deleteObject(storageRef);
        // Clear related states
        setOriginalImageUrl("");
        setImagePreview("");
        setImageFile(null);
        return true; // Indicate success
     } catch (error: any) {
        // Handle deletion errors
        console.error("Failed to delete existing image:", error);
        toast({
            title: "Error Deleting Image",
            description: error.message || "Could not remove the existing image from storage.",
            variant: "destructive",
        });
        return false; // Indicate failure
     } finally {
         // Stop loading indicator
         setUploading(false);
     }
  };

  // Handles form submission to update the Firestore document
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); // Prevent default form submission
    const user = auth.currentUser; // Get current user
    // Ensure ID and user exist
    if (!id || !user) {
         toast({ title: "Error", description: "Missing part ID or user not logged in.", variant: "destructive" });
         return; // Stop if missing required info
    };
    setLoading(true); // Start submission loading indicator

    try {
      let finalImageUrl = originalImageUrl; // Assume image doesn't change initially

      // Determine the final image URL based on user actions
      if (imageFile) {
        // Case 1: A new image file was selected - upload it and delete the old one
        const newUrl = await uploadImageAndUpdate(user.uid);
        if (newUrl === null) {
            // If upload failed, stop the entire update process
            setLoading(false);
            return;
        }
        finalImageUrl = newUrl; // Use the new URL
      } else if (!imagePreview && originalImageUrl) {
        // Case 2: Image preview was cleared (and there was an original image) - delete from storage
        const deleted = await deleteExistingImage(user.uid);
        if (!deleted) {
             // If deletion failed, stop the entire update process
             setLoading(false);
             return;
        }
        finalImageUrl = ""; // Set URL to empty string to remove it from Firestore doc
      }
      // Case 3: No new file, preview exists - image remains unchanged (finalImageUrl keeps originalImageUrl)

      // Prepare the data object for Firestore update (map form state back to snake_case)
      const updatedPartData = {
        hsn_code: formData.hsnCode.trim(),
        part_name: formData.partName.trim(),
        car_company: formData.carCompany.trim() || null,
        car_model: formData.carModel.trim() || null, // Combined field
        vehicle_type: formData.vehicleType || null, // New field
        buying_price: parseFloat(formData.buyingPrice) || 0,
        selling_price: parseFloat(formData.sellingPrice) || 0,
        sgst_percentage: parseFloat(formData.sgst) || 0,
        cgst_percentage: parseFloat(formData.cgst) || 0,
        quantity: parseInt(formData.quantity, 10) || 0,
        low_stock_threshold: parseInt(formData.lowStockThreshold, 10) || 5,
        image_url: finalImageUrl || null, // Store final URL or null if empty
        updated_at: serverTimestamp() // Add Firestore server timestamp for update time
        // user_id is typically not updated
      };

      // Create a reference to the specific document
      const docRef = doc(db, "stock", id);
      // Update the document in Firestore
      await updateDoc(docRef, updatedPartData);

      // Show success message
      toast({
        title: "Success!",
        description: "Stock updated successfully.",
      });

      // Navigate back to the parts list
      navigate("/parts");
    } catch (error: any) {
      // Handle update errors
      console.error("Error updating stock:", error);
      toast({
        title: "Error Updating Stock",
        description: error.message || "An unexpected error occurred. Please try again.",
        variant: "destructive",
      });
    } finally {
      // Stop submission loading indicator
      setLoading(false);
    }
  };

  // Show loading state while fetching initial data
  if (loadingData) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
        <p className="ml-2 text-muted-foreground">Loading part details...</p>
      </div>
    );
  }

  // Render the form once data is loaded
  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      <div className="container mx-auto px-4 py-8">
        {/* Back navigation link */}
        <div className="mb-6">
          <Link to="/parts">
            <Button variant="ghost" size="sm" className="gap-2">
              <ArrowLeft className="w-4 h-4" />
              Back to Parts
            </Button>
          </Link>
        </div>

        {/* Form card */}
        <Card className="max-w-2xl mx-auto">
          <CardHeader>
            <CardTitle>Edit Stock</CardTitle>
            <CardDescription>Update the details for this spare part.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Grid layout for fields */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                 {/* HSN Code Field */}
                <div className="space-y-2">
                  <Label htmlFor="hsnCode">HSN Code *</Label>
                  <Input
                    id="hsnCode"
                    name="hsnCode"
                    placeholder="eg. 9011" // Updated placeholder
                    value={formData.hsnCode}
                    onChange={handleChange}
                    required // HSN should be required when editing
                  />
                </div>

                {/* Part Name Field */}
                <div className="space-y-2">
                  <Label htmlFor="partName">Part Name *</Label>
                  <Input
                    id="partName"
                    name="partName"
                    placeholder="eg. Brake Pad Set" // Updated placeholder
                    value={formData.partName}
                    onChange={handleChange}
                    required
                  />
                </div>

                {/* Car Company Field */}
                <div className="space-y-2">
                  <Label htmlFor="carCompany">Car Company</Label>
                  <Input
                    id="carCompany"
                    name="carCompany"
                    placeholder="eg. Maruti Suzuki" // Updated placeholder
                    value={formData.carCompany}
                    onChange={handleChange}
                  />
                </div>

                {/* Car Name/Model Field */}
                <div className="space-y-2">
                  <Label htmlFor="carModel">Car Name / Model</Label>
                  <Input
                    id="carModel"
                    name="carModel"
                    placeholder="eg. Swift Dzire VXI" // Updated placeholder
                    value={formData.carModel}
                    onChange={handleChange}
                  />
                </div>

                 {/* Vehicle Type Field */}
                 <div className="space-y-2">
                    <Label htmlFor="vehicleType">Vehicle Type</Label>
                     <Select
                        name="vehicleType" // Name for state update
                        value={formData.vehicleType} // Controlled value
                        onValueChange={(value) => handleSelectChange('vehicleType', value)} // Specific handler
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

                 {/* Empty div for grid alignment */}
                 <div></div>

                {/* Buying Price Field */}
                <div className="space-y-2">
                  <Label htmlFor="buyingPrice">Buying Price (₹) *</Label>
                  <Input
                    id="buyingPrice"
                    name="buyingPrice"
                    type="number"
                    step="0.01"
                    placeholder="eg. 1200.50" // Updated placeholder
                    value={formData.buyingPrice}
                    onChange={handleChange}
                    required
                  />
                </div>

                {/* Selling Price Field */}
                <div className="space-y-2">
                  <Label htmlFor="sellingPrice">Selling Price (₹) *</Label>
                  <Input
                    id="sellingPrice"
                    name="sellingPrice"
                    type="number"
                    step="0.01"
                    placeholder="eg. 1550.00" // Updated placeholder
                    value={formData.sellingPrice}
                    onChange={handleChange}
                    required
                  />
                </div>

                {/* SGST Field */}
                <div className="space-y-2">
                  <Label htmlFor="sgst">SGST % *</Label>
                  <Input
                    id="sgst"
                    name="sgst"
                    type="number"
                    step="0.01"
                    placeholder="eg. 9" // Updated placeholder
                    value={formData.sgst}
                    onChange={handleChange}
                    required
                  />
                </div>

                {/* CGST Field */}
                <div className="space-y-2">
                  <Label htmlFor="cgst">CGST % *</Label>
                  <Input
                    id="cgst"
                    name="cgst"
                    type="number"
                    step="0.01"
                    placeholder="eg. 9" // Updated placeholder
                    value={formData.cgst}
                    onChange={handleChange}
                    required
                  />
                </div>

                {/* Quantity Field */}
                <div className="space-y-2">
                  <Label htmlFor="quantity">Quantity *</Label>
                  <Input
                    id="quantity"
                    name="quantity"
                    type="number"
                    step="1"
                    placeholder="eg. 10" // Updated placeholder
                    value={formData.quantity}
                    onChange={handleChange}
                    required
                    min="0"
                  />
                </div>

                {/* Low Stock Threshold Field */}
                <div className="space-y-2">
                  <Label htmlFor="lowStockThreshold">Low Stock Alert Threshold</Label>
                  <Input
                    id="lowStockThreshold"
                    name="lowStockThreshold"
                    type="number"
                    step="1"
                    placeholder="eg. 5" // Updated placeholder
                    value={formData.lowStockThreshold}
                    onChange={handleChange}
                    min="0"
                  />
                </div>
              </div>

              {/* Part Image Field */}
              <div className="space-y-2">
                <Label htmlFor="image">Part Image</Label>
                <div className="flex flex-col gap-4">
                  <div className="flex items-center gap-4">
                    {/* File input */}
                    <Input
                      id="image"
                      type="file"
                      accept="image/*"
                      onChange={handleImageChange}
                      className="flex-1"
                      disabled={uploading} // Disable during upload
                    />
                    {/* Uploading indicator */}
                    {uploading && <Loader2 className="w-5 h-5 animate-spin text-primary" />}
                  </div>
                  {/* Image preview with remove button */}
                  {imagePreview && (
                    <div className="relative w-full max-w-xs border rounded-lg overflow-hidden">
                      <img
                        src={imagePreview}
                        alt="Current or new part preview"
                        className="w-full h-48 object-cover"
                         // Add error fallback for preview image
                        onError={(e) => (e.currentTarget.src = 'https://placehold.co/300x200/cccccc/ffffff?text=Preview+Error')}
                      />
                      {/* Button to remove the image */}
                      <Button
                        type="button" // Important: Prevent form submission
                        variant="destructive"
                        size="icon"
                        className="absolute top-2 right-2 h-6 w-6 rounded-full" // Style remove button
                        onClick={removeImage}
                        disabled={uploading} // Disable if uploading
                        title="Remove Image" // Tooltip for accessibility
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  )}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-4 pt-4">
                {/* Submit Button */}
                <Button type="submit" className="flex-1" disabled={loading || uploading || loadingData}>
                  {loading ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Updating...
                    </>
                  ) : (
                    "Update Stock"
                  )}
                </Button>
                {/* Cancel Button */}
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => navigate("/parts")} // Navigate back
                  disabled={loading || uploading} // Disable during actions
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

export default EditStock;

