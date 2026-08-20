import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import Navigation from "@/components/Navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Settings as SettingsIcon,
  Moon,
  Sun,
  Download,
  Upload,
  Briefcase,
  Info,
  Languages,
  Bell,
  LogOut,
  Lock,
  Database,
  HelpCircle,
  MessageSquare,
  RefreshCw,
  LayoutDashboard,
  FileText,
  Package,
  Loader2, // Added Loader
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { auth, db } from "@/integrations/firebase/client"; // Import db
import { signOut } from "firebase/auth";
import { useAuthState } from "react-firebase-hooks/auth"; // Import auth state hook
import { doc, getDoc, setDoc } from "firebase/firestore"; // Import Firestore functions
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

// Define the shape of our settings
interface UserSettings {
  darkMode: boolean;
  notifications: boolean;
  language: string;
  defaultPage: string;
  appLock: boolean;
  autoLogout: string;
}

// Define the default settings for a new user
const initialSettings: UserSettings = {
  darkMode: false,
  notifications: true,
  language: "en",
  defaultPage: "/dashboard",
  appLock: false,
  autoLogout: "15",
};

const Settings = () => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [user, loadingUser] = useAuthState(auth);

  // --- States for Settings ---
  const [settings, setSettings] = useState<UserSettings>(initialSettings);
  const [isLoading, setIsLoading] = useState(true); // For loading settings

  // --- Load settings from Firestore ---
  useEffect(() => {
    const loadSettings = async () => {
      if (loadingUser) return; // Wait for user state to be ready
      if (!user) {
        setIsLoading(false); // No user, stop loading
        return;
      }

      setIsLoading(true);
      const docRef = doc(db, "user_settings", user.uid);
      
      try {
        const docSnap = await getDoc(docRef);

        let loadedSettings: UserSettings;
        if (docSnap.exists()) {
          // Merge saved data with defaults to prevent errors if new settings are added
          loadedSettings = { ...initialSettings, ...docSnap.data() };
        } else {
          // No settings doc found, use defaults
          loadedSettings = initialSettings;
          // Proactively create the settings doc
          await setDoc(docRef, initialSettings);
        }

        setSettings(loadedSettings);

        // --- Sync Dark Mode on load ---
        // This is the only setting with an immediate visual side-effect
        document.documentElement.classList.toggle('dark', loadedSettings.darkMode);
        localStorage.setItem('theme', loadedSettings.darkMode ? 'dark' : 'light');
        
      } catch (error: any) {
        console.error("FirebaseError loading settings:", error);
        toast({
          title: "Error Loading Settings",
          description: `Could not fetch your settings. ${error.message}. This may be caused by an ad blocker.`,
          variant: "destructive",
        });
        setSettings(initialSettings);
      } finally {
        setIsLoading(false);
      }
    };

    loadSettings();
  }, [user, loadingUser, toast]);

  // --- Generic handler to update state and save to Firestore ---
  const handleSettingChange = async (key: keyof UserSettings, value: any) => {
    if (!user) return; // Not logged in

    // 1. Update state immediately for instant UI feedback
    const newSettings = { ...settings, [key]: value };
    setSettings(newSettings);

    // 2. Handle Dark Mode side-effect
    if (key === 'darkMode') {
      document.documentElement.classList.toggle('dark', value);
      localStorage.setItem('theme', value ? 'dark' : 'light');
    }

    // 3. Save to Firestore
    try {
      const docRef = doc(db, "user_settings", user.uid);
      // Use setDoc with merge: true to create or update the document
      await setDoc(docRef, { [key]: value }, { merge: true });
      
      // Give a subtle toast on save
      toast({
        title: "Setting Saved",
        description: `${key.replace(/([A-Z])/g, ' $1').charAt(0).toUpperCase() + key.replace(/([A-Z])/g, ' $1').slice(1)} updated.`,
      });

    } catch (error: any) {
      console.error("Error saving setting:", error);
      toast({
        title: "Error",
        description: "Could not save your setting. Please try again.",
        variant: "destructive",
      });
      // Optionally, revert state on error
      // setSettings(prevSettings => ({ ...prevSettings, [key]: !value }));
    }
  };
  
  // --- Other Handlers ---
  
  const handleMockClick = (feature: string) => {
    toast({
      title: "Feature Coming Soon",
      description: `${feature} functionality is not yet implemented.`,
    });
  }

  // COMMENTED OUT: Auth logic disabled for development
  const handleLogout = async () => {
    try {
      // Clear localStorage auth flag
      localStorage.removeItem("isAuthenticated");
      localStorage.removeItem("userEmail");
      localStorage.removeItem("userName");
      
      navigate("/auth");
      toast({ title: "Logged out successfully" });
    } catch (error: any) {
      toast({ title: "Logout Error", description: error.message, variant: "destructive" });
    }

    /* ORIGINAL FIREBASE AUTH CODE - COMMENTED OUT
    try {
      await signOut(auth);
      navigate("/auth");
      toast({ title: "Logged out successfully" });
    } catch (error: any) {
      toast({ title: "Logout Error", description: error.message, variant: "destructive" });
    }
    */
  };

  // Show a loading spinner while settings are fetched
  if (isLoading || loadingUser) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-12 h-12 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5 pb-10">
      <Navigation />
      <div className="container mx-auto px-4 py-8">
        <div className="mb-6">
          <h1 className="text-3xl font-bold bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent mb-2">
            App Settings
          </h1>
          <p className="text-muted-foreground">Manage your application and data settings.</p>
        </div>

        <div className="max-w-2xl mx-auto space-y-6">
          
          {/* --- Business Profile Card (Links to Profile.tsx) --- */}
          <Card className="shadow-lg">
            <CardHeader className="bg-muted/30">
              <CardTitle className="flex items-center gap-2">
                <Briefcase className="w-5 h-5 text-primary" />
                Business Profile
              </CardTitle>
              <CardDescription>Manage your logo, GSTIN, and address for bills.</CardDescription>
            </CardHeader>
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground mb-4">
                This is where you set your business name, address, logo, and other details that appear on your invoices.
              </p>
              <Link to="/profile" className="w-full">
                <Button variant="outline" className="w-full">
                  Go to Business Profile
                </Button>
              </Link>
            </CardContent>
          </Card>

          {/* --- App Preferences --- */}
          <Card className="shadow-lg">
            <CardHeader className="bg-muted/30">
              <CardTitle className="flex items-center gap-2">
                <SettingsIcon className="w-5 h-5 text-primary" />
                App Preferences
              </CardTitle>
              <CardDescription>Control the look and feel of the app.</CardDescription>
            </CardHeader>
            <CardContent className="pt-6 space-y-4">
              <div className="flex items-center justify-between">
                <Label htmlFor="dark-mode" className="flex items-center gap-2">
                  {settings.darkMode ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
                  Dark Mode
                </Label>
                <Switch
                  id="dark-mode"
                  checked={settings.darkMode}
                  onCheckedChange={(checked) => handleSettingChange('darkMode', checked)}
                />
              </div>

              <div className="flex items-center justify-between">
                <Label htmlFor="language" className="flex items-center gap-2">
                  <Languages className="w-4 h-4" />
                  Language
                </Label>
                <Select value={settings.language} onValueChange={(value) => handleSettingChange('language', value)}>
                  <SelectTrigger className="w-[180px]">
                    <SelectValue placeholder="Select language" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="en">English</SelectItem>
                    <SelectItem value="hi" disabled>हिन्दी (coming soon)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center justify-between">
                <Label htmlFor="default-page" className="flex items-center gap-2">
                  <LayoutDashboard className="w-4 h-4" />
                  Default Startup Page
                </Label>
                <Select value={settings.defaultPage} onValueChange={(value) => handleSettingChange('defaultPage', value)}>
                  <SelectTrigger className="w-[180px]">
                    <SelectValue placeholder="Select page" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="/dashboard">Dashboard</SelectItem>
                    <SelectItem value="/parts">Parts</SelectItem>
                    <SelectItem value="/bills">Bills</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center justify-between">
                <Label htmlFor="notifications" className="flex items-center gap-2 text-muted-foreground">
                  <Bell className="w-4 h-4" />
                  Enable Notifications (Coming Soon)
                </Label>
                <Switch
                  id="notifications"
                  checked={settings.notifications}
                  onCheckedChange={(checked) => handleSettingChange('notifications', checked)}
                  disabled
                />
              </div>
              
              {/* Removed Save Button - saving is now automatic */}
            </CardContent>
          </Card>

          {/* --- Security & Privacy --- */}
          <Card className="shadow-lg">
            <CardHeader className="bg-muted/30">
              <CardTitle className="flex items-center gap-2">
                <Lock className="w-5 h-5 text-primary" />
                Security & Privacy
              </CardTitle>
              <CardDescription>Manage app access and session data.</CardDescription>
            </CardHeader>
            <CardContent className="pt-6 space-y-4">
              <div className="flex items-center justify-between">
                <Label htmlFor="app-lock" className="flex flex-col space-y-1">
                    <span className="text-muted-foreground">Enable App Lock (PIN) (Coming Soon)</span>
                    <span className="font-normal leading-snug text-muted-foreground text-sm">Require a PIN on app startup.</span>
                </Label>
                <Switch
                  id="app-lock"
                  checked={settings.appLock}
                  onCheckedChange={(checked) => handleSettingChange('appLock', checked)}
                  disabled
                />
              </div>

              <div className="flex items-center justify-between">
                <Label htmlFor="auto-logout" className="text-muted-foreground">
                  Auto-Logout Timer (Coming Soon)
                </Label>
                <Select
                  value={settings.autoLogout}
                  onValueChange={(value) => handleSettingChange('autoLogout', value)}
                  disabled
                >
                  <SelectTrigger className="w-[180px]">
                    <SelectValue placeholder="Select time" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="15">15 Minutes</SelectItem>
                    <SelectItem value="30">30 Minutes</SelectItem>
                    <SelectItem value="60">1 Hour</SelectItem>
                    <SelectItem value="never">Never</SelectItem>
                  </SelectContent>
                </Select>
              </div>
               {/* Removed Save Button - saving is now automatic */}
            </CardContent>
          </Card>

          {/* --- Data Management --- */}
          <Card className="shadow-lg">
            <CardHeader className="bg-muted/30">
              <CardTitle className="flex items-center gap-2">
                <Database className="w-5 h-5 text-primary" />
                Data Management
              </CardTitle>
              <CardDescription>Backup, restore, and export your business data.</CardDescription>
            </CardHeader>
            <CardContent className="pt-6 space-y-3">
              <Button variant="outline" onClick={() => handleMockClick("Export Data")} className="w-full justify-between">
                Export Data (CSV/XLSX) <Download className="w-4 h-4" />
              </Button>
              <Button variant="outline" onClick={() => handleMockClick("Backup")} className="w-full justify-between">
                Backup Data to Google Drive <Upload className="w-4 h-4" />
              </Button>
              <Button variant="outline" onClick={() => handleMockClick("Sync")} className="w-full justify-between">
                Force Sync with Cloud <RefreshCw className="w-4 h-4" />
              </Button>
            </CardContent>
          </Card>

          {/* --- Support & Feedback --- */}
          <Card className="shadow-lg">
            <CardHeader className="bg-muted/30">
              <CardTitle className="flex items-center gap-2">
                <HelpCircle className="w-5 h-5 text-primary" />
                Support & Feedback
              </CardTitle>
              <CardDescription>Get help or send us your thoughts.</CardDescription>
            </CardHeader>
            <CardContent className="pt-6 space-y-3">
              <Button variant="outline" onClick={() => handleMockClick("Contact Support")} className="w-full justify-between">
                Contact Support <MessageSquare className="w-4 h-4" />
              </Button>
              <Button variant="outline" onClick={() => handleMockClick("About App")} className="w-full justify-between">
                About App <Info className="w-4 h-4" />
              </Button>
            </CardContent>
          </Card>

          {/* --- Logout --- */}
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" className="w-full gap-2">
                <LogOut className="w-4 h-4" /> Logout
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Are you sure you want to log out?</AlertDialogTitle>
                <AlertDialogDescription>
                  You will be returned to the login screen.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleLogout}>Logout</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          
        </div>
      </div>
    </div>
  );
};

export default Settings;