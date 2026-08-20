import { Link, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
// --- 1. IMPORT ShoppingCart ICON ---
import {
  LayoutDashboard,
  Package,
  Users,
  FileText,
  LogOut,
  CreditCard,
  Building2,
  Settings as SettingsIcon,
  ShoppingCart, // <-- Added icon
} from "lucide-react";
import { auth } from "@/integrations/firebase/client"; // Import Firebase auth
import { signOut } from "firebase/auth"; // Import Firebase signOut function
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";

const Navigation = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { toast } = useToast();

  // Updated handleLogout function for Firebase
  const handleLogout = async () => {
    try {
      await signOut(auth); // Use Firebase signOut
      navigate("/auth"); // Redirect to auth page after logout
      toast({
        title: "Logged out successfully",
      });
    } catch (error: any) {
      console.error("Logout Error:", error); // Log the error
      toast({
        title: "Logout Error",
        description: error.message || "Failed to log out. Please try again.",
        variant: "destructive",
      });
    }
  };

  const navItems = [
    { path: "/dashboard", icon: LayoutDashboard, label: "Dashboard" },
    { path: "/parts", icon: Package, label: "Parts" },
    { path: "/bills", icon: FileText, label: "Bills" },
    // --- 2. ADDED CART LINK ---
    { path: "/cart", icon: ShoppingCart, label: "Cart" },
    // --------------------------
    { path: "/customers", icon: Users, label: "Customers" },
    { path: "/udhaari", icon: CreditCard, label: "Udhaari" },
    { path: "/profile", icon: Building2, label: "Profile" },
    { path: "/settings", icon: SettingsIcon, label: "Settings" },
  ];

  return (
    <div className="border-b bg-card">
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center gap-8">
            <Link to="/dashboard" className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
                <Package className="w-5 h-5 text-primary-foreground" />
              </div>
              {/* Consider making the app name dynamic or easily configurable */}
              <span className="font-bold text-xl bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
                Garage Manager
              </span>
            </Link>
            <nav className="hidden md:flex gap-1">
              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive = location.pathname.startsWith(item.path); // Use startsWith for better matching
                return (
                  <Link key={item.path} to={item.path}>
                    <Button
                      variant={isActive ? "secondary" : "ghost"}
                      size="sm"
                      className="gap-2"
                    >
                      <Icon className="w-4 h-4" />
                      {item.label}
                    </Button>
                  </Link>
                );
              })}
            </nav>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleLogout}
              className="gap-2"
            >
              <LogOut className="w-4 h-4" />
              Logout
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Navigation;