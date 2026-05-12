
"use client";

import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { format } from "date-fns";
import { toZonedTime } from 'date-fns-tz';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Expense, CATEGORIES as staticCategories } from '@/lib/types';
import { Loader2, PlusCircle, CalendarIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Textarea } from './ui/textarea';
import { getCategories } from '@/lib/sheets';
import { useToast } from '@/hooks/use-toast';
import { Checkbox } from './ui/checkbox';

const TIME_ZONE = 'Asia/Kolkata';

const expenseFormSchema = z.object({
  description: z.string().min(2, {
    message: 'Description must be at least 2 characters.',
  }),
  amount: z.coerce.number().positive({
    message: 'Amount must be a positive number.',
  }),
  category: z.string().min(1, { message: 'Please select a category.' }),
  date: z.date({
    required_error: "A date is required.",
  }),
  paid: z.boolean().default(false).optional(),
});

type ExpenseFormValues = z.infer<typeof expenseFormSchema>;

type AddExpenseDialogProps = {
  onAddExpense: (expense: Omit<Expense, 'id'>) => Promise<void>;
};

export function AddExpenseDialog({ onAddExpense }: AddExpenseDialogProps) {
  const [open, setOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [categories, setCategories] = useState<string[]>([]);
  const { toast } = useToast();

  const form = useForm<ExpenseFormValues>({
    resolver: zodResolver(expenseFormSchema),
    defaultValues: {
      description: '',
      amount: '' as any,
      category: '',
      date: new Date(),
      paid: false,
    },
  });

  const categoryValue = form.watch('category');

  useEffect(() => {
    async function loadCategories() {
        if (open) {
            try {
                const sheetCategories = await getCategories();
                const combined = [...staticCategories, ...sheetCategories];
                const uniqueCategories = [...new Set(combined)].sort();
                setCategories(uniqueCategories);
            } catch (error) {
                 console.error("Failed to load categories", error);
                 toast({
                    variant: "destructive",
                    title: "Failed to load categories",
                    description: "Using default categories list.",
                 });
                 setCategories(staticCategories.sort());
            }
        }
    }
    loadCategories();
  }, [open, toast]);

  useEffect(() => {
    if (categoryValue !== 'Credit Card') {
        form.setValue('paid', false);
    }
  }, [categoryValue, form]);

  async function onSubmit(data: ExpenseFormValues) {
    setIsSubmitting(true);
    try {
      const newExpenseData: Omit<Expense, 'id'> = {
        description: data.description,
        amount: data.amount,
        category: data.category,
        date: data.date.toISOString(),
        paid: data.category === 'Credit Card' ? data.paid : undefined,
      };
      
      await onAddExpense(newExpenseData);
      setOpen(false);
      form.reset();
    } catch (error) {
      console.error('Failed to add expense:', error);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(isOpen) => {
        setOpen(isOpen);
        if (!isOpen) {
            form.reset({
                description: '',
                amount: '' as any,
                category: '',
                date: new Date(),
                paid: false,
            });
        }
    }}>
      <DialogTrigger asChild>
        <Button>
          <PlusCircle className="mr-2 h-4 w-4" />
          Add Expense
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Add New Expense</DialogTitle>
          <DialogDescription>
            Enter the details of your expense and select a category.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 py-4">
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl>
                    <Textarea placeholder="e.g., Coffee with a friend" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="amount"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Amount</FormLabel>
                  <FormControl>
                    <div className="relative">
                      <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-sm text-muted-foreground">₹</span>
                      <Input type="number" step="0.01" placeholder="0.00" className="pl-7" {...field} />
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="category"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Category</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a category" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {categories.map((category) => (
                        <SelectItem key={category} value={category}>
                          {category}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
             {categoryValue === 'Credit Card' && (
              <FormField
                control={form.control}
                name="paid"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center space-x-3 space-y-0 rounded-md border p-4">
                    <FormControl>
                      <Checkbox
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                    <div className="space-y-1 leading-none">
                      <FormLabel>
                        Mark as Paid
                      </FormLabel>
                    </div>
                  </FormItem>
                )}
              />
            )}
            <FormField
              control={form.control}
              name="date"
              render={({ field }) => (
                <FormItem className="flex flex-col">
                  <FormLabel>Date</FormLabel>
                  <Popover>
                    <PopoverTrigger asChild>
                      <FormControl>
                        <Button
                          variant={"outline"}
                          className={cn(
                            "pl-3 text-left font-normal",
                            !field.value && "text-muted-foreground"
                          )}
                        >
                          {field.value ? (
                            format(toZonedTime(field.value, TIME_ZONE), "PPP")
                          ) : (
                            <span>Pick a date</span>
                          )}
                          <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                        </Button>
                      </FormControl>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={field.value}
                        onSelect={field.onChange}
                        disabled={(date) =>
                          date > new Date() || date < new Date("1900-01-01")
                        }
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button type="submit" disabled={isSubmitting} className="w-full sm:w-auto">
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {isSubmitting ? 'Adding...' : 'Add Expense'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
