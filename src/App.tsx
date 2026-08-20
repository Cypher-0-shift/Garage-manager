import { useState, useEffect } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";

// --- 1. IMPORT THE SERVICE WRAPPER ---
// Fixed path: Use @/ alias
import { ServiceWrapper } from "@/components/ServiceWrapper";
// -------------------------------------

// Fixed paths: Use @/ alias for all
import Auth from "@/pages/Auth";
import Dashboard from "@/pages/Dashboard";
import AddStock from "@/pages/AddStock";
import EditStock from "@/pages/EditStock";
import Parts from "@/pages/Parts";
import Customers from "@/pages/Customers";
import Udhaari from "@/pages/Udhaari";
import Bills from "@/pages/Bills";
import Profile from "@/pages/Profile";
import Settings from "@/pages/Settings";
import NotFound from "@/pages/NotFound";
import ProtectedRoute from "@/components/ProtectedRoute";
import SplashScreen from "@/components/SplashScreen";
import { CartProvider } from "@/context/CartContext";
import { CheckoutProvider } from "@/context/CheckoutContext";
import GlobalCartBar from "@/components/GlobalCartBar";
import GlobalCheckoutBar from "@/components/GlobalCheckoutBar";
import Cart from "@/pages/Cart";

const queryClient = new QueryClient();

const App = () => {
  const [showSplash, setShowSplash] = useState(true);

  useEffect(() => {
    const hasSeenSplash = sessionStorage.getItem("hasSeenSplash");
    if (hasSeenSplash) {
      setShowSplash(false);
    }
  }, []);

  const handleSplashComplete = () => {
    sessionStorage.setItem("hasSeenSplash", "true");
    setShowSplash(false);
  };

  if (showSplash) {
    return <SplashScreen onComplete={handleSplashComplete} />;
  }

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <CartProvider>
          <CheckoutProvider>
            {/* --- 2. WRAP THE ROUTER WITH SERVICE WRAPPER --- */}
            <ServiceWrapper>
              <BrowserRouter>
                <Routes>
                  <Route path="/" element={<Navigate to="/dashboard" replace />} />
                  <Route path="/auth" element={<Auth />} />
                  <Route
                    path="/dashboard"
                    element={
                      <ProtectedRoute>
                        <Dashboard />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/add-stock"
                    element={
                      <ProtectedRoute>
                        <AddStock />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/edit-stock/:id"
                    element={
                      <ProtectedRoute>
                        <EditStock />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/parts"
                    element={
                      <ProtectedRoute>
                        <Parts />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/bills"
                    element={
                      <ProtectedRoute>
                        <Bills />
                      </ProtectedRoute>
                    }
                  />
                  
                  <Route
                    path="/cart"
                    element={
                      <ProtectedRoute>
                        <Cart />
                      </ProtectedRoute>
                    }
                  />
                  
                  <Route
                    path="/customers"
                    element={
                      <ProtectedRoute>
                        <Customers />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/udhaari"
                    element={
                      <ProtectedRoute>
                        <Udhaari />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/profile"
                    element={
                      <ProtectedRoute>
                        <Profile />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/settings"
                    element={
                      <ProtectedRoute>
                        <Settings />
                      </ProtectedRoute>
                    }
                  />
                  <Route path="*" element={<NotFound />} />
                </Routes>
                <GlobalCartBar />
                <GlobalCheckoutBar />
              </BrowserRouter>
            </ServiceWrapper>
          </CheckoutProvider>
        </CartProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;