
"use client";

import { useState, useMemo, useEffect, useCallback } from 'react';
import { AddExpenseDialog } from '@/components/add-expense-dialog';
import { DashboardSummary } from '@/components/dashboard-summary';
import { ExpenseList } from '@/components/expense-list';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartConfig,
  ChartLegend,
  ChartLegendContent,
} from '@/components/ui/chart';
import { Progress } from '@/components/ui/progress';
import { Pie, PieChart, Cell } from 'recharts';
import { TooltipProps } from 'recharts';
import { NameType, ValueType } from 'recharts/types/component/DefaultTooltipContent';
import { useToast } from '@/hooks/use-toast';
import { getExpenses, addExpense, updateExpense, deleteExpense, getBudgets } from '@/lib/sheets';
import type { Expense, Budget } from '@/lib/types';
import { Loader2, Download, TrendingUp, TrendingDown } from 'lucide-react';
import { getMonth, getYear, format, getDate } from 'date-fns';
import { toZonedTime } from 'date-fns-tz';
import { EditExpenseDialog } from '@/components/edit-expense-dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';

const TIME_ZONE = 'Asia/Kolkata';

const months = [
  "January", "February", "March", "April", "May", "June", 
  "July", "August", "September", "October", "November", "December"
];

const monthColors = [
  'hsl(var(--chart-1))', 'hsl(var(--chart-2))', 'hsl(var(--chart-3))', 'hsl(var(--chart-4))',
  'hsl(var(--chart-5))', 'hsl(var(--chart-1))', 'hsl(var(--chart-2))', 'hsl(var(--chart-3))',
  'hsl(var(--chart-4))', 'hsl(var(--chart-5))', 'hsl(var(--chart-1))', 'hsl(var(--chart-2))'
];

const years = Array.from({ length: 2050 - 2024 + 1 }, (_, i) => 2024 + i);

const CustomPieTooltip = (props: TooltipProps<ValueType, NameType>) => {
    const { active, payload } = props;
    if (active && payload && payload.length) {
      const data = payload[0];
      return (
        <div className="rounded-lg border bg-background p-2 shadow-sm">
          <div className="grid grid-cols-1 gap-2">
             <span className="font-bold" style={{ color: data.payload.fill }}>
                  {data.name}: {Number(data.value).toLocaleString('en-IN', { style: 'currency', currency: 'INR' })}
             </span>
          </div>
        </div>
      );
    }
    return null;
}

export default function DashboardPage() {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();
  const [selectedMonth, setSelectedMonth] = useState(months[new Date().getMonth()]);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [deletingExpense, setDeletingExpense] = useState<Expense | null>(null);
  
  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [sheetExpenses, sheetBudgets] = await Promise.all([getExpenses(selectedYear), getBudgets()]);
      setExpenses(sheetExpenses);
      setBudgets(sheetBudgets);
    } catch (error) {
      console.error("Failed to load data", error);
      toast({
          variant: "destructive",
          title: "Failed to load data",
          description: "Could not fetch data from Google Sheets.",
      })
    } finally {
      setIsLoading(false);
    }
  }, [toast, selectedYear]);

  useEffect(() => {
    loadData();
  }, [loadData]);


  const filteredExpenses = useMemo(() => {
    const monthIndex = months.indexOf(selectedMonth);
    return expenses.filter(expense => {
      const expenseDate = toZonedTime(new Date(expense.date), TIME_ZONE);
      return getMonth(expenseDate) === monthIndex && getYear(expenseDate) === selectedYear;
    });
  }, [expenses, selectedMonth, selectedYear]);

  const handleAddExpense = async (newExpenseData: Omit<Expense, 'id'>) => {
    try {
      await addExpense(newExpenseData);
      await loadData();
      toast({
        title: 'Expense Added',
        description: `"${newExpenseData.description}" was added.`,
      });
    } catch (error) {
        console.error("Failed to add expense", error);
        toast({
            variant: 'destructive',
            title: 'Error',
            description: 'Failed to add expense to Google Sheet.',
        })
    }
  };

  const handleUpdateExpense = async (updatedExpense: Expense) => {
    try {
        await updateExpense(updatedExpense);
        await loadData();
        setEditingExpense(null);
        toast({
            title: 'Expense Updated',
            description: `"${updatedExpense.description}" was updated.`,
        });
    } catch (error) {
        console.error("Failed to update expense", error);
        toast({
            variant: 'destructive',
            title: 'Error',
            description: 'Failed to update expense in Google Sheet.',
        })
    }
  };

  const handleDeleteExpense = async () => {
    if (!deletingExpense) return;
    try {
        await deleteExpense(deletingExpense);
        await loadData();
        toast({
            title: "Expense Deleted",
            description: `"${deletingExpense.description}" was deleted.`,
        });
    } catch(error) {
        console.error("Failed to delete expense", error);
        toast({
            variant: 'destructive',
            title: 'Error',
            description: 'Failed to delete expense from Google Sheet.',
        })
    } finally {
        setDeletingExpense(null);
    }
  };
  
  const handleExport = () => {
    if (filteredExpenses.length === 0) {
      toast({
        variant: "destructive",
        title: "No data to export",
        description: "There are no expenses for the selected period.",
      });
      return;
    }

    const headers = ["ID", "Date", "Description", "Category", "Amount", "Paid"];
    const csvContent = [
      headers.join(","),
      ...filteredExpenses.map(e => 
        [
          e.id, 
          format(toZonedTime(new Date(e.date), TIME_ZONE), "yyyy-MM-dd"), 
          `"${e.description.replace(/"/g, '""')}"`,
          e.category, 
          e.amount,
          e.category === 'Credit Card' ? (e.paid ? 'Paid' : 'Not Paid') : ''
        ].join(",")
      )
    ].join("\n");

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `expenses-${selectedYear}-${selectedMonth}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    toast({
        title: "Export Successful",
        description: "Your expenses have been downloaded as a CSV file.",
    });
  };

  const spendingByCategory = useMemo(() => {
    return filteredExpenses.reduce((acc, expense) => {
      const category = expense.category || "Other";
      if (!acc[category]) {
        acc[category] = 0;
      }
      acc[category] += expense.amount;
      return acc;
    }, {} as { [key: string]: number });
  }, [filteredExpenses]);
  
  const pieChartData = useMemo(() => {
    return Object.entries(spendingByCategory)
      .map(([name, value]) => ({ name, value }))
      .filter(item => item.value > 0)
      .sort((a, b) => b.value - a.value);
  }, [spendingByCategory]);

  const chartConfig: ChartConfig = useMemo(() => {
    const config: ChartConfig = {};
    pieChartData.forEach((item, index) => {
      config[item.name] = {
        label: item.name,
        color: `hsl(var(--chart-${(index % 5) + 1}))`,
      };
    });
    return config;
  }, [pieChartData]);
  
  const categoryBudgets = useMemo(() => {
    const activeBudgets = budgets.filter(b => b.amount > 0);
    const categorySpending = pieChartData.reduce((acc, item) => {
        acc[item.name] = item.value;
        return acc;
    }, {} as {[key: string]: number});

    return activeBudgets.map(budget => {
        const spent = categorySpending[budget.category] || 0;
        const progress = budget.amount > 0 ? (spent / budget.amount) * 100 : 0;
        return {
            ...budget,
            spent,
            progress: Math.min(progress, 100),
            isOver: progress > 100
        };
    }).sort((a, b) => b.progress - a.progress);
  }, [budgets, pieChartData]);

  const dailySpendingData = useMemo(() => {
    const dailyTotals = filteredExpenses
      .reduce((acc, expense) => {
        const day = getDate(toZonedTime(new Date(expense.date), TIME_ZONE));
        if (!acc[day]) {
          acc[day] = 0;
        }
        acc[day] += expense.amount;
        return acc;
      }, {} as { [key: number]: number });
    
    return Object.entries(dailyTotals).map(([day, total]) => ({
      day: parseInt(day),
      total,
    })).sort((a, b) => a.day - b.day);
  }, [filteredExpenses]);


  if (isLoading) {
    return (
        <div className="flex justify-center items-center h-screen">
            <Loader2 className="h-16 w-16 animate-spin text-primary" />
        </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-4">
          <h1 className="text-3xl font-bold tracking-tight font-headline">
            Dashboard
          </h1>
          <Select value={selectedYear.toString()} onValueChange={(value) => setSelectedYear(parseInt(value))}>
            <SelectTrigger className="w-[120px]">
              <SelectValue placeholder="Select year" />
            </SelectTrigger>
            <SelectContent>
              {years.map(year => (
                <SelectItem key={year} value={year.toString()}>{year}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2">
            <Button variant="outline" onClick={handleExport}>
                <Download className="mr-2 h-4 w-4" />
                Export to CSV
            </Button>
            <AddExpenseDialog onAddExpense={handleAddExpense} />
        </div>
      </div>

      <Tabs value={selectedMonth} onValueChange={setSelectedMonth} className="w-full">
        <TabsList className="grid h-auto w-full grid-cols-2 flex-wrap sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
          {months.map((month, index) => (
            <TabsTrigger 
              key={month} 
              value={month}
              style={selectedMonth === month ? { backgroundColor: monthColors[index], color: '#111' } : {}}
            >
              {month}
            </TabsTrigger>
          ))}
        </TabsList>
        {months.map(month => (
          <TabsContent key={month} value={month} className="mt-6">
            <DashboardSummary expenses={filteredExpenses} budgets={budgets} />
            
            <div className="grid gap-6 mt-6 md:grid-cols-2 lg:grid-cols-5">
              <Card className="lg:col-span-3">
                <CardHeader>
                    <CardTitle>Budget Progress</CardTitle>
                    <CardDescription>Your spending vs budgets for {month} {selectedYear}.</CardDescription>
                </CardHeader>
                <CardContent>
                    {categoryBudgets.length > 0 ? (
                        <div className="space-y-4">
                            {categoryBudgets.map(budget => (
                                <div key={budget.category} className="space-y-1">
                                    <div className="flex justify-between items-center text-sm">
                                        <span className="font-medium">{budget.category}</span>
                                        <span className={budget.isOver ? "text-destructive font-semibold" : "text-muted-foreground"}>
                                            {Number(budget.spent).toLocaleString('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 0 })} / {Number(budget.amount).toLocaleString('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 0 })}
                                        </span>
                                    </div>
                                    <Progress value={budget.progress} className={budget.isOver ? "[&>div]:bg-destructive" : ""} />
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="flex flex-col items-center justify-center text-center py-12">
                           <TrendingUp className="h-12 w-12 text-muted-foreground" />
                           <p className="mt-4 text-muted-foreground">No budgets set for this month.</p>
                           <p className="text-sm text-muted-foreground">Go to the Categories page to set your budgets.</p>
                        </div>
                    )}
                </CardContent>
              </Card>
              <Card className="lg:col-span-2">
                  <CardHeader>
                      <CardTitle>Spending by Category</CardTitle>
                      <CardDescription>A breakdown of your expenses for {month} {selectedYear}.</CardDescription>
                  </CardHeader>
                  <CardContent>
                      {pieChartData.length > 0 ? (
                      <ChartContainer config={chartConfig} className="mx-auto aspect-square max-h-[350px]">
                          <PieChart>
                          <ChartTooltip content={<CustomPieTooltip />} />
                          <Pie data={pieChartData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={120} >
                              {pieChartData.map((_, index) => (
                              <Cell key={`cell-${index}`} fill={chartConfig[pieChartData[index].name]?.color} />
                              ))}
                          </Pie>
                          <ChartLegend content={<ChartLegendContent className="flex flex-wrap justify-center gap-x-4 gap-y-2" />} className="-mt-4" />
                          </PieChart>
                      </ChartContainer>
                      ) : (
                          <div className="flex h-[350px] items-center justify-center text-muted-foreground">No spending data available.</div>
                      )}
                  </CardContent>
              </Card>
              
              <Card className="lg:col-span-3">
                <CardHeader>
                  <CardTitle>Daily Spending</CardTitle>
                  <CardDescription>Daily breakdown for {month} {selectedYear} (Includes Credit Card).</CardDescription>
                </CardHeader>
                <CardContent>
                  {dailySpendingData.length > 0 ? (
                    <ScrollArea className="h-[250px] w-full">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Day</TableHead>
                            <TableHead className="text-right">Total Spent</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {dailySpendingData.map(({ day, total }) => (
                            <TableRow key={day}>
                              <TableCell className="font-medium">{format(toZonedTime(new Date(selectedYear, months.indexOf(month), day), TIME_ZONE), "do MMMM")}</TableCell>
                              <TableCell className="text-right">{total.toLocaleString('en-IN', { style: 'currency', currency: 'INR' })}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </ScrollArea>
                  ) : (
                    <div className="flex h-[250px] flex-col items-center justify-center text-center">
                        <TrendingDown className="h-12 w-12 text-muted-foreground" />
                        <p className="mt-4 text-muted-foreground">No daily spending data for this period.</p>
                    </div>
                  )}
                </CardContent>
              </Card>
              
              <Card className="lg:col-span-2">
                <CardHeader>
                  <CardTitle>Recent Transactions</CardTitle>
                  <CardDescription>Your last 5 expenses for {month} {selectedYear}.</CardDescription>
                </CardHeader>
                <CardContent>
                  <ExpenseList 
                    expenses={filteredExpenses.slice(0, 5)} 
                    onEdit={(expense) => setEditingExpense(expense)}
                    onDelete={(expense) => setDeletingExpense(expense)}
                  />
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        ))}
      </Tabs>
      <EditExpenseDialog 
        expense={editingExpense} 
        isOpen={!!editingExpense} 
        onClose={() => setEditingExpense(null)}
        onUpdateExpense={handleUpdateExpense}
      />
      <AlertDialog open={!!deletingExpense} onOpenChange={() => setDeletingExpense(null)}>
        <AlertDialogContent>
            <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
                This action cannot be undone. This will permanently delete the expense
                "{deletingExpense?.description}".
            </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteExpense}>Delete</AlertDialogAction>
            </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
