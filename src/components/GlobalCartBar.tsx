import React, { useState } from 'react';
// --- 1. IMPORT useLocation ---
import { useNavigate, useLocation } from 'react-router-dom';
import { useCart, CartItem } from '@/context/CartContext';
import { useCheckout } from '@/context/CheckoutContext';
import { toast as sonnerToast } from "sonner";

import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
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

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  SheetClose,
} from '@/components/ui/sheet';

import { X, ShoppingCart, Minus, Plus, Trash2, AlertTriangle } from 'lucide-react';
import { Input } from '@/components/ui/input';

const GlobalCartBar: React.FC = () => {
  const navigate = useNavigate();
  // --- 2. GET CURRENT LOCATION ---
  const location = useLocation();
  const {
    cartItems,
    clearCart,
    removeFromCart,
    updateQuantity,
    getCartTotal,
    getItemCount,
  } = useCart();
  const { isCheckoutInProgress } = useCheckout(); // <-- GET CHECKOUT STATE

  const [itemToDelete, setItemToDelete] = useState<string | null>(null);

  const totalCartItems = getItemCount();
  const cartSubtotal = getCartTotal();

  const handleCheckout = () => {
    // --- 3. NAVIGATE TO /cart ---
    navigate('/cart');
  };

  const handleRemoveItem = (itemId: string) => {
    removeFromCart(itemId);
    sonnerToast.success("Item removed from cart");
    setItemToDelete(null); // Close the dialog
  };

  const handleQuantityUpdate = (partId: string, newQuantity: number) => {
    const result = updateQuantity(partId, newQuantity);

    if (result === 'error_zero') {
      sonnerToast.error('Quantity cannot be 0.', {
        description: 'To remove an item, please use the trash icon.',
      });
    } else if (result === 'error_stock') {
      const item = cartItems.find((i) => i.id === partId);
      sonnerToast.warning(`Only ${item?.stock || 'available'} parts in stock.`, {
        description: 'Quantity set to maximum available.',
      });
    }
  };

  // --- 4. UPDATED LOCATION CHECK ---
  // Hide if:
  // 1. Cart is empty
  // 2. Checkout is in progress
  // 3. You are NOT on the /parts page
  if (
    totalCartItems === 0 ||
    isCheckoutInProgress ||
    location.pathname !== '/parts'
  ) {
    return null;
  }
  // --- END CHANGE ---

  return (
    <div className="fixed bottom-5 left-1/2 transform -translate-x-1/2 w-full max-w-lg z-50 px-4">
      <Card className="shadow-2xl border-2 border-primary/50 bg-card/95 backdrop-blur-sm relative overflow-visible">

        <div className="absolute top-0 right-0 -mt-3 -mr-3 z-10">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="destructive"
                size="icon"
                title="Clear Cart"
                className="w-7 h-7 rounded-full shadow-lg"
              >
                <X className="w-4 h-4" />
              </Button>
            </AlertDialogTrigger>

            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Clear Cart?</AlertDialogTitle>
                <AlertDialogDescription>
                  Are you sure you want to remove all {totalCartItems} items from your cart?
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={clearCart}>Clear All</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>

        <CardContent className="p-3 flex items-center justify-between gap-3">
          <Sheet>
            <SheetTrigger asChild>
              <button className="text-left hover:text-primary transition-colors focus:outline-none flex-1 min-w-0 pr-2">
                <p className="text-lg font-semibold truncate">
                  {totalCartItems} item{totalCartItems === 1 ? '' : 's'} • ₹{cartSubtotal.toFixed(2)}
                </p>
                <p className="text-xs text-primary/80 font-medium">Tap to review & edit</p>
              </button>
            </SheetTrigger>

            <SheetContent className="w-[90vw] max-w-[540px] flex flex-col">
              <SheetHeader className="border-b pb-4">
                <SheetTitle>Review Your Cart ({totalCartItems})</SheetTitle>
              </SheetHeader>

              <ScrollArea className="flex-grow pr-6 -mr-6 my-4">

                {cartItems.length === 0 ? (
                  <p className="text-muted-foreground text-center py-10">Your cart is empty.</p>
                ) : (
                  <div className="space-y-4">
                    {cartItems.map((item: CartItem) => (
                      <div key={item.id} className="flex items-start gap-4 border-b pb-4 last:border-b-0">

                        {/* Image */}
                        <img
                          src={item.image_url || 'https://placehold.co/64x64/cccccc/ffffff?text=No+Img'}
                          alt={item.part_name || item.partName}
                          className="w-16 h-16 object-cover rounded border flex-shrink-0"
                          onError={(e) => (e.currentTarget.src = 'https://placehold.co/64x64/cccccc/ffffff?text=Error')}
                        />

                        {/* Details */}
                        <div className="flex-grow min-w-0">
                          <p className="font-medium truncate">{item.part_name || item.partName}</p>

                          <p className="text-sm text-muted-foreground">
                            ₹{item.selling_price?.toFixed(2) ?? item.price?.toFixed(2) ?? '0.00'} each
                          </p>

                          {/* ✅ Low Stock Warning */}
                          {item.quantity >= item.stock && (
                            <p className="text-xs text-destructive flex items-center gap-1 mt-1 font-medium">
                              <AlertTriangle className="w-3 h-3" />
                              Only {item.stock} in stock.
                            </p>
                          )}

                          {/* Quantity Controls */}
                          <div className="flex items-center gap-2 mt-1">
                            <Button variant="outline" size="icon" className="h-7 w-7"
                              onClick={() => handleQuantityUpdate(item.id, item.quantity - 1)}>
                              <Minus className="h-4 h-4" />
                            </Button>

                            <Input
                              type="number"
                              className="h-7 w-12 text-center px-1"
                              value={item.quantity}
                              onChange={(e) => {
                                const val = parseInt(e.target.value, 10);
                                handleQuantityUpdate(item.id, isNaN(val) ? 1 : val);
                              }}
                              onBlur={(e) => {
                                const val = parseInt(e.target.value, 10);
                                if (isNaN(val) || val <= 0) handleQuantityUpdate(item.id, 1);
                              }}
                              min={1}
                              max={item.stock}
                            />

                            <Button variant="outline" size="icon" className="h-7 w-7"
                              onClick={() => handleQuantityUpdate(item.id, item.quantity + 1)}
                              disabled={item.quantity >= item.stock}>
                              <Plus className="h-4 h-4" />
                            </Button>
                          </div>
                        </div>

                        {/* Price + Remove */}
                        <div className="flex flex-col items-end flex-shrink-0">
                          <span className="font-semibold text-sm mb-2">
                            ₹{((item.selling_price || item.price) * item.quantity).toFixed(2)}
                          </span>
                          
                          {/* --- 5. ADDED CONFIRMATION DIALOG --- */}
                          <AlertDialog open={itemToDelete === item.id} onOpenChange={(open) => !open && setItemToDelete(null)}>
                            <AlertDialogTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="text-destructive h-7 w-7"
                                onClick={() => setItemToDelete(item.id)}
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Remove Item?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Are you sure you want to remove "{item.part_name || item.partName}" from your cart?
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction onClick={() => handleRemoveItem(item.id)}>
                                  Remove
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                          {/* --- END DIALOG --- */}

                        </div>

                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>

              {/* ✅ FIXED FOOTER UI (Same as before) */}
              {cartItems.length > 0 && (
                <div className="border-t pt-4 mt-auto bg-background sticky bottom-0 pb-4">
                  <div className="flex justify-between items-center mb-4 px-1">
                    <span className="text-lg font-semibold">Subtotal:</span>
                    <span className="text-lg font-semibold">₹{cartSubtotal.toFixed(2)}</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 px-1">
                    <SheetClose asChild>
                      <Button variant="outline" className="w-full">Continue Shopping</Button>
                    </SheetClose>

                    <SheetClose asChild>
                      <Button className="w-full" onClick={handleCheckout}>
                        Proceed to Checkout
                      </Button>
                    </SheetClose>
                  </div>
                </div>
              )}

            </SheetContent>
          </Sheet>

          <Button size="lg" className="gap-2 flex-shrink-0 min-w-[140px]" onClick={handleCheckout}>
            Checkout <ShoppingCart className="w-5 h-5" />
          </Button>

        </CardContent>
      </Card>
    </div>
  );
};

export default GlobalCartBar;