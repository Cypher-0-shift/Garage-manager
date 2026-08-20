import { useEffect, useState } from "react";
import { db, storage, auth } from "@/integrations/firebase/client"; // Firebase client
import { doc, getDoc, setDoc, serverTimestamp, Timestamp } from "firebase/firestore"; // Firestore functions
import { ref, uploadBytes, getDownloadURL, deleteObject } from "firebase/storage"; // Storage functions
import { onAuthStateChanged, User } from "firebase/auth"; // Auth state
import Navigation from "@/components/Navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch"; // Use Shadcn Switch
import { Textarea } from "@/components/ui/textarea"; // Use Shadcn Textarea
import { useToast } from "@/hooks/use-toast";
// --- 1. IMPORT Edit ICON ---
import { Building2, Loader2, Upload, X, Edit } from "lucide-react";

// Interface for Firestore 'business_settings' document data
interface BusinessSettings {
  business_name: string;
  owner_name: string;
  address: string;
  gstin: string;
  contact_phone: string;
  contact_email: string;
  logo_url: string | null;
  bill_notes: string;
  bill_terms: string;
  show_logo: boolean;
  show_gst_details: boolean;
  bill_template_url: string | null; // Keep for reference, actual template logic might differ
  user_id: string; // Ensure user_id is part of the data
  updated_at?: Timestamp; // Optional timestamp
}

// Initial state matching the interface
const initialFormData: Omit<BusinessSettings, 'user_id' | 'updated_at'> = { // Exclude fields set programmatically
  business_name: "My Garage", // More generic default
  owner_name: "",
  address: "",
  gstin: "",
  contact_phone: "",
  contact_email: "",
  logo_url: null,
  bill_notes: "",
  bill_terms: "",
  show_logo: true,
  show_gst_details: true,
  bill_template_url: null,
};


const Profile = () => {
  const { toast } = useToast();
  // --- 2. ADD isEditing STATE ---
  const [isEditing, setIsEditing] = useState(false);
  // -----------------------------
  const [loading, setLoading] = useState(false); // For saving
  const [fetching, setFetching] = useState(true); // For initial load
  const [uploadingLogo, setUploadingLogo] = useState(false); // Separate uploading states
  const [uploadingTemplate, setUploadingTemplate] = useState(false);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string>("");
  const [originalLogoUrl, setOriginalLogoUrl] = useState<string | null>(null); // Track original logo
  const [templateFile, setTemplateFile] = useState<File | null>(null);
  const [templatePreview, setTemplatePreview] = useState<string>(""); // Keep preview for reference
  const [originalTemplateUrl, setOriginalTemplateUrl] = useState<string | null>(null); // Track original template
  const [currentUser, setCurrentUser] = useState<User | null>(null);

  const [formData, setFormData] = useState(initialFormData);

  // Get current user
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
      if (!user) {
         // Handle logout: clear form, stop loading
         setFormData(initialFormData);
         setLogoPreview("");
         setTemplatePreview("");
         setFetching(false);
      }
    });
    return () => unsubscribe();
  }, []);

  // Fetch settings when user is available
  useEffect(() => {
    const fetchSettings = async () => {
      if (!currentUser) {
          setFetching(false); // Stop fetching if no user
          return;
      }
      setFetching(true);
      try {
        // Document ID is the user's UID
        const docRef = doc(db, "business_settings", currentUser.uid);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
          const data = docSnap.data() as BusinessSettings; // Cast data
          // Set form state, providing defaults for potentially missing fields
          setFormData({
             business_name: data.business_name || initialFormData.business_name,
             owner_name: data.owner_name || initialFormData.owner_name,
             address: data.address || initialFormData.address,
             gstin: data.gstin || initialFormData.gstin,
             contact_phone: data.contact_phone || initialFormData.contact_phone,
             contact_email: data.contact_email || initialFormData.contact_email,
             logo_url: data.logo_url || null,
             bill_notes: data.bill_notes || initialFormData.bill_notes,
             bill_terms: data.bill_terms || initialFormData.bill_terms,
             show_logo: data.show_logo ?? initialFormData.show_logo, // Use nullish coalescing for booleans
             show_gst_details: data.show_gst_details ?? initialFormData.show_gst_details,
             bill_template_url: data.bill_template_url || null,
          });
          setLogoPreview(data.logo_url || "");
          setOriginalLogoUrl(data.logo_url || null);
          setTemplatePreview(data.bill_template_url || ""); // Display existing template URL/preview if available
          setOriginalTemplateUrl(data.bill_template_url || null);
        } else {
           // No settings found, use initial defaults (already set)
           console.log("No business settings found for this user, using defaults.");
        }
      } catch (error: any) {
           console.error("Error fetching settings:", error);
           toast({ title: "Error", description: "Could not fetch profile settings.", variant: "destructive"});
      } finally {
        setFetching(false);
      }
    };

    fetchSettings();
  }, [currentUser, toast]); // Re-fetch if user changes

  // Handle standard input changes
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => { // Include Textarea
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  // Handle Switch changes
  const handleSwitchChange = (checked: boolean, name: keyof typeof initialFormData) => {
     setFormData({ ...formData, [name]: checked });
  };

  // Handle logo file selection
  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setLogoFile(file);
      // Generate preview
      const reader = new FileReader();
      reader.onloadend = () => setLogoPreview(reader.result as string);
      reader.readAsDataURL(file);
    } else {
      // Clear if no file selected
      setLogoFile(null);
      setLogoPreview(originalLogoUrl || ""); // Revert to original on cancel
    }
  };
   // Remove logo selection/preview
   const removeLogo = () => {
       setLogoFile(null);
       setLogoPreview(""); // Clear preview, implies removal on save if original existed
   }

  // Handle template file selection
  const handleTemplateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setTemplateFile(file);
      // Generate preview (if image, otherwise just store name/link?)
       // For simplicity, let's assume image/pdf preview generation is complex and just show file name or link
       setTemplatePreview(file.name); // Show filename as preview
    } else {
       setTemplateFile(null);
       setTemplatePreview(originalTemplateUrl || ""); // Revert on cancel
    }
  };
   // Remove template selection/preview
   const removeTemplate = () => {
       setTemplateFile(null);
       setTemplatePreview(""); // Clear preview/filename
   }

  // --- Upload function for Firebase Storage ---
  const uploadFile = async (
      file: File,
      userId: string,
      pathPrefix: string, // e.g., "logos" or "templates"
      originalUrl: string | null, // Pass original URL for deletion
      setUploading: React.Dispatch<React.SetStateAction<boolean>>
  ): Promise<string | null> => {
      setUploading(true);
      try {
          // 1. Create file path
          const fileExt = file.name.split('.').pop();
          const fileName = `${pathPrefix}-${Date.now()}.${fileExt}`;
          const filePath = `users/${userId}/business/${fileName}`; // Store in user-specific folder
          const storageRef = ref(storage, filePath);

          // 2. Delete the old file if it exists and a new file is being uploaded
          if (originalUrl) {
              try {
                  const oldStorageRef = ref(storage, originalUrl);
                  await deleteObject(oldStorageRef);
              } catch (deleteError: any) {
                  // Ignore deletion errors (e.g., file not found) but log them
                  if (deleteError.code !== 'storage/object-not-found') {
                     console.warn(`Could not delete old ${pathPrefix} file:`, deleteError);
                  }
              }
          }

          // 3. Upload the new file
          const snapshot = await uploadBytes(storageRef, file);
          // 4. Get the download URL
          const downloadURL = await getDownloadURL(snapshot.ref);
          return downloadURL;

      } catch (error: any) {
          console.error(`Error uploading ${pathPrefix}:`, error);
          toast({ title: `Upload Failed`, description: `Could not upload ${pathPrefix}. ${error.message}`, variant: "destructive" });
          return null; // Indicate failure
      } finally {
          setUploading(false);
      }
  };

  // --- Delete function for Firebase Storage ---
   const deleteFileFromStorage = async (
       fileUrl: string | null,
       userId: string,
       pathPrefix: string,
       setUploading: React.Dispatch<React.SetStateAction<boolean>>
   ): Promise<boolean> => {
       if (!fileUrl) return true; // Nothing to delete
       setUploading(true);
       try {
           const storageRef = ref(storage, fileUrl);
           await deleteObject(storageRef);
           toast({ title: `${pathPrefix} Removed`, description: `The ${pathPrefix} file was deleted.` });
           return true;
       } catch (error: any) {
            console.error(`Error deleting ${pathPrefix}:`, error);
            // Ignore object not found errors on delete
            if (error.code !== 'storage/object-not-found') {
                toast({ title: `Deletion Failed`, description: `Could not delete ${pathPrefix}. ${error.message}`, variant: "destructive" });
                return false; // Indicate failure only if it's not a 'not found' error
            }
            return true; // Consider 'not found' as success in this context
       } finally {
           setUploading(false);
       }
   };


  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) {
       toast({ title: "Error", description: "You must be logged in to save settings.", variant: "destructive"});
       return;
    }
    setLoading(true);

    try {
        let finalLogoUrl = originalLogoUrl; // Start with existing URL
        let finalTemplateUrl = originalTemplateUrl;

        // Handle Logo Upload/Removal
        if (logoFile) { // New logo selected
            const newLogoUrl = await uploadFile(logoFile, currentUser.uid, "logo", originalLogoUrl, setUploadingLogo);
            if (newLogoUrl === null) throw new Error("Logo upload failed."); // Stop if upload fails
            finalLogoUrl = newLogoUrl;
        } else if (!logoPreview && originalLogoUrl) { // Logo removed
            const deleted = await deleteFileFromStorage(originalLogoUrl, currentUser.uid, "logo", setUploadingLogo);
            if (!deleted) throw new Error("Failed to delete the old logo."); // Stop if deletion fails
            finalLogoUrl = null;
        }

        // Handle Template Upload/Removal (similar logic)
         if (templateFile) {
            const newTemplateUrl = await uploadFile(templateFile, currentUser.uid, "template", originalTemplateUrl, setUploadingTemplate);
            if (newTemplateUrl === null) throw new Error("Template upload failed.");
            finalTemplateUrl = newTemplateUrl;
         } else if (!templatePreview && originalTemplateUrl) {
            const deleted = await deleteFileFromStorage(originalTemplateUrl, currentUser.uid, "template", setUploadingTemplate);
            if (!deleted) throw new Error("Failed to delete the old template.");
            finalTemplateUrl = null;
         }

      // Prepare data for Firestore
      const settingsData: BusinessSettings = {
        ...formData, // Spread current form state
        user_id: currentUser.uid, // Ensure user_id is set
        logo_url: finalLogoUrl, // Use the final URL
        bill_template_url: finalTemplateUrl, // Use final template URL
        updated_at: serverTimestamp(), // Add updated timestamp
      };

      // Use setDoc with merge: true to create or update the document
      const docRef = doc(db, "business_settings", currentUser.uid); // Doc ID is user's UID
      await setDoc(docRef, settingsData, { merge: true }); // merge: true prevents overwriting fields not in settingsData

      toast({
        title: "Success!",
        description: "Business profile updated successfully",
      });
      // Update original URLs after successful save
      setOriginalLogoUrl(finalLogoUrl);
      setOriginalTemplateUrl(finalTemplateUrl);
      // Clear file inputs after successful save
      setLogoFile(null);
      setTemplateFile(null);
      
      // --- 3. TURN OFF EDIT MODE ON SAVE ---
      setIsEditing(false);
      // -------------------------------------

    } catch (error: any) {
      console.error("Error saving settings:", error);
      toast({
        title: "Error Saving Settings",
        description: error.message || "Could not save profile settings.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  // Loading state for initial fetch
  if (fetching) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5">
        <Navigation />
        <div className="container mx-auto px-4 py-8 flex justify-center items-center h-[calc(100vh-100px)]"> {/* Centered loader */}
          <div className="text-center">
            <Loader2 className="w-12 h-12 animate-spin text-primary mx-auto mb-4" />
            <p className="text-muted-foreground">Loading profile...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5 pb-10"> {/* Added pb-10 */}
      <Navigation />
      <div className="container mx-auto px-4 py-8">
        <div className="mb-6">
          <h1 className="text-3xl font-bold bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent mb-2">
            Business Profile
          </h1>
          <p className="text-muted-foreground">Manage your business information for bills and records.</p>
        </div>

        {/* --- Business Details Card --- */}
        <Card className="max-w-2xl mx-auto shadow-lg mb-6"> {/* Added mb-6 */}
          {/* --- 4. ADDED EDIT TOGGLE TO HEADER --- */}
          <CardHeader className="bg-muted/30 flex flex-row items-center justify-between">
            <div className="space-y-1">
              <CardTitle className="flex items-center gap-2">
                <Building2 className="w-5 h-5 text-primary" /> {/* Use primary color */}
                Business Details
              </CardTitle>
              <CardDescription>Update your information for bills and invoices.</CardDescription>
            </div>
            <div className="flex items-center gap-2 pt-2">
              <Label htmlFor="edit-mode" className="text-sm font-medium">
                <Edit className="w-4 h-4" />
              </Label>
              <Switch id="edit-mode" checked={isEditing} onCheckedChange={setIsEditing} />
            </div>
          </CardHeader>
          {/* ------------------------------------- */}
          <CardContent className="pt-6">
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Logo Upload */}
              <div className="space-y-2">
                <Label htmlFor="logo">Business Logo</Label>
                <div className="flex flex-col gap-3">
                  <div className="flex items-center gap-4">
                    {/* --- 5. ADDED disabled PROP --- */}
                    <Input id="logo" type="file" accept="image/*" onChange={handleLogoChange} className="flex-1" disabled={!isEditing || uploadingLogo || uploadingTemplate} />
                    {(uploadingLogo) && <Loader2 className="w-5 h-5 animate-spin text-primary" />}
                  </div>
                  {logoPreview && (
                    <div className="relative w-32 h-32 border rounded-lg overflow-hidden bg-muted">
                      <img src={logoPreview} alt="Logo Preview" className="w-full h-full object-contain" onError={(e) => e.currentTarget.src = 'https://placehold.co/128x128/cccccc/ffffff?text=Logo'}/>
                       {/* --- 5. ADDED disabled PROP --- */}
                       <Button type="button" variant="destructive" size="icon" className="absolute top-1 right-1 h-6 w-6 rounded-full" onClick={removeLogo} disabled={!isEditing || uploadingLogo || uploadingTemplate} title="Remove Logo"><X className="w-4 h-4" /></Button>
                    </div>
                  )}
                </div>
              </div>

              {/* Text Fields Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="business_name">Business Name *</Label>
                  {/* --- 5. ADDED disabled PROP --- */}
                  <Input id="business_name" name="business_name" value={formData.business_name} onChange={handleChange} required placeholder="eg. My Auto Shop" disabled={!isEditing} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="owner_name">Owner Name</Label>
                  {/* --- 5. ADDED disabled PROP --- */}
                  <Input id="owner_name" name="owner_name" value={formData.owner_name} onChange={handleChange} placeholder="eg. John Doe" disabled={!isEditing} />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="address">Business Address</Label>
                  {/* --- 5. ADDED disabled PROP --- */}
                   <Textarea id="address" name="address" value={formData.address} onChange={handleChange} placeholder="eg. 123 Garage Lane, City, State, PIN" disabled={!isEditing} /> {/* Use Textarea */}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="gstin">GSTIN</Label>
                  {/* --- 5. ADDED disabled PROP --- */}
                  <Input id="gstin" name="gstin" placeholder="eg. 22AAAAA0000A1Z5" value={formData.gstin} onChange={handleChange} disabled={!isEditing} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="contact_phone">Contact Phone</Label>
                  {/* --- 5. ADDED disabled PROP --- */}
                  <Input id="contact_phone" name="contact_phone" type="tel" value={formData.contact_phone} onChange={handleChange} placeholder="eg. +91 98765 43210" disabled={!isEditing}/>
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="contact_email">Contact Email</Label>
                  {/* --- 5. ADDED disabled PROP --- */}
                  <Input id="contact_email" name="contact_email" type="email" value={formData.contact_email} onChange={handleChange} placeholder="eg. contact@myautoshop.com" disabled={!isEditing}/>
                </div>
              </div>

              {/* Save Button for this section */}
              {/* --- 5. ADDED disabled PROP --- */}
              <Button type="submit" className="w-full" disabled={!isEditing || loading || uploadingLogo || uploadingTemplate || fetching}>
                {loading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Saving Details...</> : "Save Business Details"}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* --- Bill Customization Card --- */}
        <Card className="max-w-2xl mx-auto shadow-lg">
          <CardHeader className="bg-muted/30">
            <CardTitle>Bill Customization</CardTitle>
            <CardDescription>Customize your bill format and default text.</CardDescription>
          </CardHeader>
          <CardContent className="pt-6">
            {/* Separate form for bill settings - reuse handleSubmit or create a specific one */}
            <form onSubmit={handleSubmit} className="space-y-6">
               {/* Template Upload - Optional */}
               <div className="space-y-2">
                 <Label htmlFor="template">Upload Bill Template (Reference Image/PDF)</Label>
                 <div className="flex flex-col gap-3">
                    <div className="flex items-center gap-4">
                       {/* --- 5. ADDED disabled PROP --- */}
                       <Input id="template" type="file" accept="image/*,application/pdf" onChange={handleTemplateChange} className="flex-1" disabled={!isEditing || uploadingLogo || uploadingTemplate}/>
                       {uploadingTemplate && <Loader2 className="w-5 h-5 animate-spin text-primary" />}
                    </div>
                    {templatePreview && (
                       <div className="relative w-full max-w-sm border rounded p-2 bg-muted flex items-center justify-between">
                          {/* Display filename or link based on type */}
                          <span className="text-sm truncate">{templateFile?.name || templatePreview}</span>
                          {/* --- 5. ADDED disabled PROP --- */}
                          <Button type="button" variant="ghost" size="icon" className="text-destructive h-6 w-6" onClick={removeTemplate} disabled={!isEditing || uploadingLogo || uploadingTemplate} title="Remove Template"><X className="w-4 h-4" /></Button>
                       </div>
                    )}
                 </div>
                 <p className="text-xs text-muted-foreground">Upload your bill format for reference (optional).</p>
               </div>

              <div className="space-y-2">
                <Label htmlFor="bill_notes">Default Bill Notes</Label>
                {/* --- 5. ADDED disabled PROP --- */}
                 <Textarea id="bill_notes" name="bill_notes" placeholder="eg. Thank you for your business!" value={formData.bill_notes} onChange={handleChange} rows={3} disabled={!isEditing}/>
              </div>

              <div className="space-y-2">
                <Label htmlFor="bill_terms">Terms & Conditions</Label>
                {/* --- 5. ADDED disabled PROP --- */}
                <Textarea id="bill_terms" name="bill_terms" placeholder="eg. Payment due within 30 days. Goods once sold..." value={formData.bill_terms} onChange={handleChange} rows={3} disabled={!isEditing}/>
              </div>

              {/* Switches */}
              <div className="flex items-center justify-between py-2 border-t pt-4"> {/* Added border-t pt-4 */}
                <Label htmlFor="show_logo" className={`flex flex-col space-y-1 ${!isEditing ? 'text-muted-foreground' : ''}`}>
                    <span>Show Logo on Bills</span>
                    <span className="font-normal leading-snug text-muted-foreground text-sm">Include your uploaded logo on generated PDFs.</span>
                </Label>
                {/* --- 5. ADDED disabled PROP --- */}
                <Switch id="show_logo" checked={formData.show_logo} onCheckedChange={(checked) => handleSwitchChange(checked, 'show_logo')} disabled={!isEditing} />
              </div>

              <div className="flex items-center justify-between py-2 border-t pt-4">
                 <Label htmlFor="show_gst_details" className={`flex flex-col space-y-1 ${!isEditing ? 'text-muted-foreground' : ''}`}>
                     <span>Show GST Details on Bills</span>
                     <span className="font-normal leading-snug text-muted-foreground text-sm">Include GSTIN and tax breakdown on PDFs.</span>
                 </Label>
                 {/* --- 5. ADDED disabled PROP --- */}
                <Switch id="show_gst_details" checked={formData.show_gst_details} onCheckedChange={(checked) => handleSwitchChange(checked, 'show_gst_details')} disabled={!isEditing} />
              </div>

              {/* Save Button for this section */}
              {/* --- 5. ADDED disabled PROP --- */}
              <Button type="submit" className="w-full" disabled={!isEditing || loading || uploadingLogo || uploadingTemplate || fetching}>
                 {loading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Saving Settings...</> : "Save Bill Settings"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Profile;