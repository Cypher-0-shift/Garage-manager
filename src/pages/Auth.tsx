import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { auth } from "@/integrations/firebase/client"; // Firebase client
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  updateProfile, // To set display name
  User // Type for user object
} from "firebase/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Package, Loader2 } from "lucide-react"; // Added Loader2

const Auth = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [currentUser, setCurrentUser] = useState<User | null>(null); // Track Firebase user

  // Login form state
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");

  // Signup form state
  const [signupEmail, setSignupEmail] = useState("");
  const [signupPassword, setSignupPassword] = useState("");
  const [fullName, setFullName] = useState("");
  // Note: Garage Name is removed as Firebase Auth doesn't store arbitrary data directly on signup.
  // This should be collected after signup and saved to Firestore (e.g., in a 'users' or 'profiles' collection).

  // Listen for authentication state changes
  // COMMENTED OUT: Auth logic disabled for development
  /*
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
      if (user) {
        // If user is detected, navigate to dashboard
        navigate("/dashboard", { replace: true }); // Use replace to prevent back navigation to auth
      }
      // No need to explicitly set loading false here unless you have an initial loading state
    });

    // Cleanup subscription on unmount
    return () => unsubscribe();
  }, [navigate]);
  */

  // Handle Login with Firebase
  // COMMENTED OUT: Auth logic disabled for development - accept any credentials
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    // BYPASSED AUTHENTICATION - Accept any credentials
    try {
      // Simulate a small delay for realism
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Store a dummy auth flag in localStorage
      localStorage.setItem("isAuthenticated", "true");
      localStorage.setItem("userEmail", loginEmail);
      
      toast({
        title: "Login successful",
        description: "Welcome back!",
      });
      
      // Navigate to dashboard
      navigate("/dashboard", { replace: true });
    } catch (error: any) {
      console.error("Login failed:", error);
      toast({
        title: "Login Failed",
        description: "An unexpected error occurred.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }

    /* ORIGINAL FIREBASE AUTH CODE - COMMENTED OUT
    try {
      await signInWithEmailAndPassword(auth, loginEmail, loginPassword);
      // onAuthStateChanged will handle navigation
      toast({
        title: "Login successful",
        description: "Welcome back!",
      });
      // No explicit navigation needed here, useEffect handles it
    } catch (error: any) {
      console.error("Login failed:", error);
      toast({
        title: "Login Failed",
        // Provide a user-friendly error message
        description: error.code === 'auth/invalid-credential'
            ? "Incorrect email or password."
            : error.message || "An unexpected error occurred.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
    */
  };

  // Handle Signup with Firebase
  // COMMENTED OUT: Auth logic disabled for development - accept any credentials
  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    // BYPASSED AUTHENTICATION - Accept any credentials
    try {
      // Simulate a small delay for realism
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Store dummy auth flag and user info in localStorage
      localStorage.setItem("isAuthenticated", "true");
      localStorage.setItem("userEmail", signupEmail);
      localStorage.setItem("userName", fullName);
      
      toast({
        title: "Account Created!",
        description: "Welcome! Redirecting to dashboard...",
      });
      
      // Navigate to dashboard
      navigate("/dashboard", { replace: true });
    } catch (error: any) {
      console.error("Signup failed:", error);
      toast({
        title: "Signup Failed",
        description: "An unexpected error occurred.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }

    /* ORIGINAL FIREBASE AUTH CODE - COMMENTED OUT
    try {
      // Create the user account
      const userCredential = await createUserWithEmailAndPassword(auth, signupEmail, signupPassword);
      const user = userCredential.user;

      // Update the user's profile with the full name
      await updateProfile(user, { displayName: fullName });

      // Note: Saving 'garageName' would happen here, writing to a Firestore 'users' or 'profiles' collection:
      // Example (requires Firestore setup):
      // const userDocRef = doc(db, "users", user.uid);
      // await setDoc(userDocRef, { fullName: fullName, garageName: garageName, email: user.email });

      toast({
        title: "Account Created!",
        description: "Welcome! Redirecting to dashboard...",
      });
      // onAuthStateChanged will handle navigation
    } catch (error: any) {
      console.error("Signup failed:", error);
      toast({
        title: "Signup Failed",
        // Provide user-friendly messages for common errors
        description: error.code === 'auth/email-already-in-use'
            ? "This email address is already registered."
            : error.code === 'auth/weak-password'
            ? "Password should be at least 6 characters."
            : error.message || "An unexpected error occurred.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
    */
  };

  // Prevent rendering login/signup form if user is already logged in (optional, avoids brief flash)
  // COMMENTED OUT: Auth logic disabled for development
  /*
  if (currentUser) {
     // Optionally show a loading indicator or redirect message while navigating
      return (
          <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
              <p className="ml-2">Redirecting...</p>
          </div>
      );
  }
  */

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-md shadow-lg"> {/* Added shadow */}
        <CardHeader className="text-center">
          <div className="w-16 h-16 rounded-xl bg-primary mx-auto mb-4 flex items-center justify-center shadow-md"> {/* Added shadow */}
            <Package className="w-10 h-10 text-primary-foreground" />
          </div>
          <CardTitle className="text-2xl font-bold">Garage Manager</CardTitle> {/* Added font-bold */}
          <CardDescription>Manage your spare parts inventory with ease</CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="login" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="login">Login</TabsTrigger>
              <TabsTrigger value="signup">Sign Up</TabsTrigger>
            </TabsList>
            {/* Login Tab */}
            <TabsContent value="login">
              <form onSubmit={handleLogin} className="space-y-4 pt-4"> {/* Added pt-4 */}
                <div className="space-y-2">
                  <Label htmlFor="login-email">Email</Label>
                  <Input
                    id="login-email"
                    type="email"
                    placeholder="your@email.com"
                    value={loginEmail}
                    onChange={(e) => setLoginEmail(e.target.value)}
                    required
                    autoComplete="email"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="login-password">Password</Label>
                  <Input
                    id="login-password"
                    type="password"
                    placeholder="••••••••" // Use placeholder for password
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    required
                    autoComplete="current-password"
                  />
                </div>
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Logging in...</> : "Login"}
                </Button>
              </form>
            </TabsContent>
            {/* Signup Tab */}
            <TabsContent value="signup">
              <form onSubmit={handleSignup} className="space-y-4 pt-4"> {/* Added pt-4 */}
                <div className="space-y-2">
                  <Label htmlFor="full-name">Full Name</Label>
                  <Input
                    id="full-name"
                    type="text"
                    placeholder="eg. John Doe"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    required
                    autoComplete="name"
                  />
                </div>
                 {/* Garage Name removed - collect this info later */}
                <div className="space-y-2">
                  <Label htmlFor="signup-email">Email</Label>
                  <Input
                    id="signup-email"
                    type="email"
                    placeholder="your@email.com"
                    value={signupEmail}
                    onChange={(e) => setSignupEmail(e.target.value)}
                    required
                    autoComplete="email"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="signup-password">Password (min. 6 characters)</Label>
                  <Input
                    id="signup-password"
                    type="password"
                    placeholder="••••••••"
                    value={signupPassword}
                    onChange={(e) => setSignupPassword(e.target.value)}
                    required
                    minLength={6}
                    autoComplete="new-password"
                  />
                </div>
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Creating account...</> : "Sign Up"}
                </Button>
              </form>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
};

export default Auth;
