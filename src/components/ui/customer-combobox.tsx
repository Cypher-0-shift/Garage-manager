"use client"

import * as React from "react"
import { Check, ChevronsUpDown } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { ScrollArea } from "@/components/ui/scroll-area"

// A simplified version of your Customer type
interface Customer {
  id: string;
  customer_id: string;
  name: string;
}

interface CustomerComboBoxProps {
  customers: Customer[];
  value: string; // This will be the selectedCustomer ID
  onValueChange: (value: string) => void;
  className?: string;
}

export function CustomerComboBox({ customers, value, onValueChange, className }: CustomerComboBoxProps) {
  const [open, setOpen] = React.useState(false)

  const selectedCustomer = customers.find(
    (customer) => customer.id === value
  )

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn("w-full justify-between", className)}
        >
          {selectedCustomer
            ? `${selectedCustomer.customer_id} - ${selectedCustomer.name}`
            : "Select customer..."}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
        <Command>
          <CommandInput placeholder="Search customer by name or ID..." />
          <CommandEmpty>No customer found.</CommandEmpty>
          <CommandList>
            <ScrollArea className="h-48"> {/* Add ScrollArea for long lists */}
              <CommandGroup>
                {customers.map((customer) => (
                  <CommandItem
                    key={customer.id}
                    // This value is used for searching.
                    value={`${customer.name} ${customer.customer_id} ${customer.phone}`}
                    onSelect={() => {
                      onValueChange(customer.id === value ? "" : customer.id)
                      setOpen(false)
                    }}
                  >
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4",
                        value === customer.id ? "opacity-100" : "opacity-0"
                      )}
                    />
                    {customer.customer_id} - {customer.name}
                  </CommandItem>
                ))}
              </CommandGroup>
            </ScrollArea>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}