
"use client";

import { useState, useEffect, useCallback } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { getCategories, addCategory as addCategoryToSheet, deleteCategory as deleteCategoryFromSheet, getBudgets, updateBudgets } from '@/lib/sheets';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, PlusCircle, Trash2, Save } from 'lucide-react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { getCategoryIcon } from '@/lib/utils';
import { CATEGORIES as staticCategories, CategoryWithBudget } from '@/lib/types';
import { useMasterPassword } from '@/hooks/use-master-password';
import { MasterPasswordDialog } from '@/components/master-password-dialog';


const categoryFormSchema = z.object({
  name: z.string().min(2, {
    message: 'Category name must be at least 2 characters.',
  }),
});
type CategoryFormValues = z.infer<typeof categoryFormSchema>;

const budgetsFormSchema = z.object({
    budgets: z.array(z.object({
        category: z.string(),
        amount: z.coerce.number().min(0, "Budget must be non-negative."),
    }))
});
type BudgetsFormValues = z.infer<typeof budgetsFormSchema>;

export default function CategoriesPage() {
  const [categoriesWithBudgets, setCategoriesWithBudgets] = useState<CategoryWithBudget[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmittingCategory, setIsSubmittingCategory] = useState(false);
  const [isSubmittingBudgets, setIsSubmittingBudgets] = useState(false);
  const [deletingCategory, setDeletingCategory] = useState<string | null>(null);
  const { toast } = useToast();
  const { isPasswordSet, showPasswordDialog, passwordDialogProps } = useMasterPassword();

  const categoryForm = useForm<CategoryFormValues>({
    resolver: zodResolver(categoryFormSchema),
    defaultValues: { name: '' },
  });
  
  const budgetsForm = useForm<BudgetsFormValues>({
    resolver: zodResolver(budgetsFormSchema),
    defaultValues: { budgets: [] },
  });

  const { fields, replace } = useFieldArray({
    control: budgetsForm.control,
    name: "budgets",
  });

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [sheetCategories, sheetBudgets] = await Promise.all([getCategories(), getBudgets()]);
      const combined = [...staticCategories, ...sheetCategories];
      const uniqueCategories = [...new Set(combined)].sort();

      const budgetMap = new Map(sheetBudgets.map(b => [b.category, b.amount]));
      
      const categoriesWithBudgetsData = uniqueCategories.map(cat => ({
        name: cat,
        budget: budgetMap.get(cat) || 0,
        isStatic: staticCategories.includes(cat as any),
      }));

      setCategoriesWithBudgets(categoriesWithBudgetsData);
      replace(categoriesWithBudgetsData.map(c => ({ category: c.name, amount: c.budget })));

    } catch (error) {
      console.error("Failed to load data", error);
      toast({
        variant: "destructive",
        title: "Failed to load data",
        description: "Could not fetch categories or budgets from Google Sheets.",
      });
    } finally {
      setIsLoading(false);
    }
  }, [toast, replace]);

  useEffect(() => {
    loadData();
  }, [loadData]);
  

  const handleAddCategory = async (data: CategoryFormValues) => {
    setIsSubmittingCategory(true);
    if (categoriesWithBudgets.some(c => c.name.toLowerCase() === data.name.toLowerCase())) {
        toast({
            variant: 'destructive',
            title: 'Category exists',
            description: `The category "${data.name}" already exists.`,
        });
        setIsSubmittingCategory(false);
        return;
    }
    try {
      await addCategoryToSheet(data.name);
      setCategoriesWithBudgets(prev => [...prev, { name: data.name, budget: 0, isStatic: false }].sort((a,b) => a.name.localeCompare(b.name)));
      replace([...budgetsForm.getValues().budgets, { category: data.name, amount: 0 }].sort((a,b) => a.category.localeCompare(b.category)));
      toast({
        title: 'Category Added',
        description: `"${data.name}" was successfully added.`,
      });
      categoryForm.reset();
    } catch (error) {
      console.error('Failed to add category:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to add category to Google Sheet.',
      });
    } finally {
      setIsSubmittingCategory(false);
    }
  }

  function onAddCategorySubmit(data: CategoryFormValues) {
    showPasswordDialog({
        title: isPasswordSet ? "Enter Master Password" : "Set Master Password",
        description: isPasswordSet 
            ? "Please enter your master password to add a category."
            : "Before adding a category, please set a master password for editing actions.",
        onSuccess: () => handleAddCategory(data),
    });
  }

  
  const handleUpdateBudgets = async (data: BudgetsFormValues) => {
      setIsSubmittingBudgets(true);
      try {
          const budgetsToUpdate = data.budgets.map(b => ({ category: b.category, amount: b.amount }));
          await updateBudgets(budgetsToUpdate);
          toast({
              title: "Budgets Updated",
              description: "Your category budgets have been saved successfully.",
          });
      } catch (error) {
          console.error("Failed to update budgets", error);
          toast({
              variant: "destructive",
              title: "Error updating budgets",
              description: "Could not save budgets to Google Sheets.",
          });
      } finally {
          setIsSubmittingBudgets(false);
      }
  }
  
  function onUpdateBudgetsSubmit(data: BudgetsFormValues) {
    showPasswordDialog({
        title: isPasswordSet ? "Enter Master Password" : "Set Master Password",
        description: isPasswordSet 
            ? "Please enter your master password to save budgets."
            : "Before saving budgets, please set a master password for editing actions.",
        onSuccess: () => handleUpdateBudgets(data),
    });
  }


  async function handleDeleteCategory() {
    if (!deletingCategory) return;
    
    if (staticCategories.includes(deletingCategory as any)) {
        toast({
            variant: 'destructive',
            title: 'Cannot Delete',
            description: `"${deletingCategory}" is a default category and cannot be deleted.`,
        });
        setDeletingCategory(null);
        return;
    }

    try {
      await deleteCategoryFromSheet(deletingCategory);
      setCategoriesWithBudgets(prev => prev.filter(c => c.name !== deletingCategory));
      replace(budgetsForm.getValues().budgets.filter(b => b.category !== deletingCategory));
      toast({
        title: 'Category Deleted',
        description: `"${deletingCategory}" was deleted.`,
      });
    } catch (error) {
      console.error('Failed to delete category:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to delete category from Google Sheet.',
      });
    } finally {
        setDeletingCategory(null);
    }
  }

  function confirmDeleteCategory() {
      showPasswordDialog({
        title: isPasswordSet ? "Enter Master Password" : "Set Master Password",
        description: isPasswordSet
            ? `Please enter your master password to delete the category "${deletingCategory}".`
            : "Before deleting a category, please set a master password for editing actions.",
        onSuccess: handleDeleteCategory,
        onCancel: () => setDeletingCategory(null),
    });
  }
  
  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-screen">
        <Loader2 className="h-16 w-16 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <>
      <MasterPasswordDialog {...passwordDialogProps} />
      <div className="flex flex-col gap-6">
        <h1 className="text-3xl font-bold tracking-tight font-headline">
          Manage Categories & Budgets
        </h1>
        
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Add New Category</CardTitle>
            </CardHeader>
            <CardContent>
              <Form {...categoryForm}>
                <form onSubmit={categoryForm.handleSubmit(onAddCategorySubmit)} className="flex items-end gap-4">
                  <FormField
                    control={categoryForm.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem className="flex-grow">
                        <FormLabel>Category Name</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g., Subscriptions" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <Button type="submit" disabled={isSubmittingCategory}>
                    {isSubmittingCategory ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <PlusCircle className="mr-2 h-4 w-4" />}
                    {isSubmittingCategory ? 'Adding...' : 'Add Category'}
                  </Button>
                </form>
              </Form>
            </CardContent>
          </Card>

          <Card className="md:col-span-2 lg:col-span-3">
              <Form {...budgetsForm}>
                  <form onSubmit={budgetsForm.handleSubmit(onUpdateBudgetsSubmit)}>
                      <CardHeader className="flex flex-row items-center justify-between">
                          <div>
                          <CardTitle>Your Categories & Budgets</CardTitle>
                          <CardDescription>Manage your expense categories and set a monthly budget for each.</CardDescription>
                          </div>
                          <Button type="submit" disabled={isSubmittingBudgets}>
                              {isSubmittingBudgets ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                              {isSubmittingBudgets ? 'Saving...' : 'Save Budgets'}
                          </Button>
                      </CardHeader>
                      <CardContent>
                          <Table>
                          <TableHeader>
                              <TableRow>
                              <TableHead>Category</TableHead>
                              <TableHead className="w-48">Budget (₹)</TableHead>
                              <TableHead className="text-right w-24">Actions</TableHead>
                              </TableRow>
                          </TableHeader>
                          <TableBody>
                              {fields.map((field, index) => (
                              <TableRow key={field.id}>
                                  <TableCell className="font-medium flex items-center gap-2">
                                  {getCategoryIcon(categoriesWithBudgets[index]?.name)}
                                  {categoriesWithBudgets[index]?.name}
                                  </TableCell>
                                  <TableCell>
                                      <FormField
                                          control={budgetsForm.control}
                                          name={`budgets.${index}.amount`}
                                          render={({ field }) => (
                                              <FormItem>
                                                  <FormControl>
                                                      <div className="relative">
                                                          <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-sm text-muted-foreground">₹</span>
                                                          <Input type="number" step="1" placeholder="0" className="pl-7" {...field} />
                                                      </div>
                                                  </FormControl>
                                                  <FormMessage/>
                                              </FormItem>
                                          )}
                                      />
                                  </TableCell>
                                  <TableCell className="text-right">
                                  {!categoriesWithBudgets[index]?.isStatic && (
                                      <Button
                                          variant="ghost"
                                          size="icon"
                                          onClick={() => setDeletingCategory(categoriesWithBudgets[index]?.name)}
                                          className="text-destructive hover:text-destructive"
                                      >
                                          <Trash2 className="h-4 w-4" />
                                      </Button>
                                  )}
                                  </TableCell>
                              </TableRow>
                              ))}
                          </TableBody>
                          </Table>
                      </CardContent>
                  </form>
              </Form>
          </Card>
        </div>

        <AlertDialog open={!!deletingCategory} onOpenChange={() => setDeletingCategory(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Are you sure?</AlertDialogTitle>
              <AlertDialogDescription>
                This action cannot be undone. This will permanently delete the category "{deletingCategory}". Expenses with this category will not be affected but you won't be able to assign it to new ones.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={confirmDeleteCategory}>Delete</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </>
  );
}
