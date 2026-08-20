import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { auth } from "@/integrations/firebase/client"; // Firebase client
import { onAuthStateChanged, User } from "firebase/auth"; // Firebase auth functions and types
import { Loader2 } from "lucide-react"; // Import Loader2

// Props definition for the component
interface ProtectedRouteProps {
  children: React.ReactNode; // The content to render if authenticated
}

const ProtectedRoute = ({ children }: ProtectedRouteProps) => {
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null); // State for the Firebase user object
  const [loading, setLoading] = useState(true); // State to track initial authentication check

  useEffect(() => {
    // Set up Firebase auth state listener
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser); // Update user state
      if (!currentUser) {
        // If no user is logged in, redirect to the authentication page
        navigate("/auth", { replace: true }); // Use replace to prevent back navigation
      }
      // Set loading to false once the initial check is complete (user is either found or null)
      setLoading(false);
    });

    // Cleanup function: Unsubscribe from the listener when the component unmounts
    return () => unsubscribe();
  }, [navigate]); // Dependency array includes navigate to ensure it's stable

  // Show loading indicator while the initial authentication check is in progress
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background"> {/* Consistent background */}
        <div className="text-center">
           {/* Use Loader2 for consistency */}
          <Loader2 className="w-12 h-12 animate-spin text-primary mx-auto mb-4" />
          <p className="text-muted-foreground">Checking authentication...</p>
        </div>
      </div>
    );
  }

  // If loading is complete and a user exists, render the child components
  // Otherwise (loading is complete but no user), render null (navigation already handled)
  return user ? <>{children}</> : null;
};

export default ProtectedRoute;
