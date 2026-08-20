import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useCheckout } from '@/context/CheckoutContext';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
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
} from '@/components/ui/alert-dialog';
// --- 1. IMPORT Loader2 ---
import { X, ArrowRight, Loader2 } from 'lucide-react';

const GlobalCheckoutBar: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  // --- 2. GET step ---
  const { isCheckoutInProgress, orderItems, cancelCheckout, setStep, step } = useCheckout();

  const handleResume = () => {
    // --- 3. NAVIGATE TO /cart ---
    navigate('/cart');
  };

  // If no checkout is in progress, show nothing
  if (!isCheckoutInProgress) {
    return null;
  }

  // --- 4. HIDE ON /cart ---
  // If we ARE on the /cart page, also show nothing (the wizard is visible)
  if (location.pathname === '/cart') {
    return null;
  }

  const itemCount = orderItems.length;

  return (
    <div className="fixed bottom-5 left-1/2 transform -translate-x-1/2 w-full max-w-lg z-50 px-4">
      <Card className="shadow-2xl border-2 border-primary/50 bg-card/95 backdrop-blur-sm relative overflow-visible">

        {/* Cancel Button */}
        <div className="absolute top-0 right-0 -mt-3 -mr-3 z-10">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="destructive"
                size="icon"
                title="Cancel Checkout"
                className="w-7 h-7 rounded-full shadow-lg"
              >
                <X className="w-4 h-4" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Cancel Checkout?</AlertDialogTitle>
                <AlertDialogDescription>
                  Are you sure? This will remove all {itemCount} items from your
                  pending bill and clear the session.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Keep Editing</AlertDialogCancel>
                <AlertDialogAction onClick={() => cancelCheckout()}>Cancel Checkout</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>

        {/* Bar Content */}
        <CardContent className="p-3 flex items-center justify-between gap-3">
          {/* --- 5. UPDATED UI --- */}
          <div className="flex items-center gap-3 flex-1 min-w-0 pr-2">
            <Loader2 className="w-5 h-5 animate-spin text-primary flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-primary truncate">
                Checkout in Progress
              </p>
              <p className="text-sm text-muted-foreground">
                Step {step} of 5
              </p>
            </div>
          </div>

          <Button size="lg" className="gap-2 flex-shrink-0 min-w-[140px]" onClick={handleResume}>
            Resume <ArrowRight className="w-5 h-5" />
          </Button>
          {/* --- END UPDATED UI --- */}
        </CardContent>
      </Card>
    </div>
  );
};

export default GlobalCheckoutBar;