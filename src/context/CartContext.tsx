import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

// --- TYPE DEFINITIONS ---
// We'll define the 'Part' based on expected properties.
// We can adjust this later if your Part type is different.
export interface Part {
  id: string;
  partName: string;
  price: number;
  stock: number;
  [key: string]: any; // Allow other properties
}

export interface CartItem extends Part {
  quantity: number;
}

interface CartContextType {
  cartItems: CartItem[];
  isCartVisible: boolean;
  addToCart: (part: Part, quantity: number) => string; // Returns 'success' or 'error'
  removeFromCart: (partId: string) => void;
  updateQuantity: (partId: string, newQuantity: number) => string; // Returns 'success' or 'error_stock' or 'error_zero'
  clearCart: () => void;
  showCart: () => void;
  hideCart: () => void;
  getCartTotal: () => number;
  getItemCount: () => number;
}

// --- CREATE CONTEXT ---
const CartContext = createContext<CartContextType | undefined>(undefined);

// --- LOCALSTORAGE KEY ---
const CART_STORAGE_KEY = 'garageCart';

// --- PROVIDER COMPONENT ---
export const CartProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  // Initialize cart state from localStorage
  const [cartItems, setCartItems] = useState<CartItem[]>(() => {
    try {
      const localData = localStorage.getItem(CART_STORAGE_KEY);
      return localData ? JSON.parse(localData) : [];
    } catch (error) {
      console.error('Failed to parse cart data from localStorage:', error);
      return [];
    }
  });

  // State for cart bar visibility (defaults to visible)
  const [isCartVisible, setIsCartVisible] = useState(true);

  // Effect to persist cart to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cartItems));
  }, [cartItems]);

  // --- CONTEXT FUNCTIONS ---

  const addToCart = (part: Part, quantity: number): string => {
    if (quantity > part.stock) {
      return 'error_stock';
    }

    setCartItems((prevItems) => {
      const existingItem = prevItems.find((item) => item.id === part.id);

      if (existingItem) {
        // Item already in cart, update its quantity
        const newQuantity = existingItem.quantity + quantity;
        if (newQuantity > existingItem.stock) {
          // This case should be handled by the component, but as a fallback:
          return prevItems.map((item) =>
            item.id === part.id ? { ...item, quantity: item.stock } : item
          );
        }
        return prevItems.map((item) =>
          item.id === part.id ? { ...item, quantity: newQuantity } : item
        );
      } else {
        // Add new item to cart
        return [...prevItems, { ...part, quantity: quantity }];
      }
    });
    setIsCartVisible(true); // Automatically show cart when an item is added
    return 'success';
  };

  const removeFromCart = (partId: string) => {
    setCartItems((prevItems) => prevItems.filter((item) => item.id !== partId));
  };

  const updateQuantity = (partId: string, newQuantity: number): string => {
    if (newQuantity === 0) {
      // Per request: "If user tries to set 0, show error notification"
      // We return an error code for the component to handle.
      return 'error_zero';
    }

    let errorType = 'success';

    setCartItems((prevItems) =>
      prevItems.map((item) => {
        if (item.id === partId) {
          if (newQuantity > item.stock) {
            errorType = 'error_stock';
            // Clamp to max stock
            return { ...item, quantity: item.stock };
          }
          // Clamp to min 1
          const finalQuantity = Math.max(1, newQuantity);
          return { ...item, quantity: finalQuantity };
        }
        return item;
      })
    );
    return errorType;
  };

  const clearCart = () => {
    setCartItems([]);
  };

  const showCart = () => setIsCartVisible(true);
  const hideCart = () => setIsCartVisible(false);

  const getCartTotal = () => {
    return cartItems.reduce((total, item) => total + item.price * item.quantity, 0);
  };

  const getItemCount = () => {
    return cartItems.reduce((total, item) => total + item.quantity, 0);
  };

  return (
    <CartContext.Provider
      value={{
        cartItems,
        isCartVisible,
        addToCart,
        removeFromCart,
        updateQuantity,
        clearCart,
        showCart,
        hideCart,
        getCartTotal,
        getItemCount,
      }}
    >
      {children}
    </CartContext.Provider>
  );
};

// --- CUSTOM HOOK ---
export const useCart = () => {
  const context = useContext(CartContext);
  if (context === undefined) {
    throw new Error('useCart must be used within a CartProvider');
  }
  return context;
};