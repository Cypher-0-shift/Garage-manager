import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
// --- 1. Import Loader and Sonner (for error toast) ---
import { Loader2 } from "lucide-react";
import { toast as sonnerToast } from "sonner";

interface UpdateStockDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  partName: string;
  currentQuantity: number;
  onUpdate: (newQuantity: number) => Promise<void>;
}

const UpdateStockDialog = ({
  open,
  onOpenChange,
  partName,
  currentQuantity,
  onUpdate,
}: UpdateStockDialogProps) => {
  // --- 2. State now tracks 'addedQuantity', defaults to blank ---
  const [addedQuantity, setAddedQuantity] = useState<number | string>("");
  const [loading, setLoading] = useState(false);

  // --- 3. Reset state when dialog opens/closes ---
  useEffect(() => {
    if (open) {
      setAddedQuantity("");
    }
  }, [open]);

  const handleUpdate = async () => {
    const numToAdd = Number(addedQuantity) || 0;

    // --- 4. Add validation ---
    if (numToAdd <= 0) {
      sonnerToast.error("Invalid Quantity", {
        description: "Please enter a positive number to add.",
      });
      return;
    }

    setLoading(true);
    // --- 5. Calculate new total quantity ---
    const newTotalQuantity = currentQuantity + numToAdd;
    await onUpdate(newTotalQuantity);
    
    setLoading(false);
    onOpenChange(false);
  };

  const numToAdd = Number(addedQuantity) || 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add Stock Quantity</DialogTitle>
          <DialogDescription>
            Add newly received stock for {partName}.
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            {/* 6. This label just displays the current quantity */}
            <Label>Current Quantity: {currentQuantity}</Label>
          </div>
          
          <div className="flex items-center gap-4">
            {/* --- 7. Removed +/- buttons --- */}
            
            <Input
              type="number"
              value={addedQuantity}
              onChange={(e) => setAddedQuantity(e.target.value === "" ? "" : Math.max(0, parseInt(e.target.value) || 0))}
              className="text-center text-lg font-semibold"
              min="0"
              placeholder="0" // <-- Added placeholder
            />
          </div>

          {/* --- 8. Helper text now only shows added amount --- */}
          <div className="text-sm text-muted-foreground">
            {numToAdd > 0 && (
              <p className="text-green-600">
                +{numToAdd} items will be added (New Total: {currentQuantity + numToAdd})
              </p>
            )}
            {numToAdd === 0 && (
              <p>Enter the quantity you want to add.</p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancel
          </Button>
          {/* 9. Disable button if no quantity is entered */}
          <Button onClick={handleUpdate} disabled={loading || numToAdd <= 0}>
            {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : "Add Stock"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default UpdateStockDialog;