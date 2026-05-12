
"use client";

import { useState, useMemo, useEffect, useCallback } from 'react';
import { useToast } from '@/hooks/use-toast';
import { getExpenses, getYearsWithExpenses, getCategories } from '@/lib/sheets';
import type { Expense } from '@/lib/types';
import { CATEGORIES as staticCategories } from '@/lib/types';
import { Loader2 } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartConfig,
} from '@/components/ui/chart';
import { Pie, PieChart, Cell, TooltipProps, BarChart, XAxis, YAxis, Bar, CartesianGrid } from 'recharts';
import { NameType, ValueType } from 'recharts/types/component/DefaultTooltipContent';
import { getMonth, getYear } from 'date-fns';
import { toZonedTime } from 'date-fns-tz';

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

const months = [
  "January", "February", "March", "April", "May", "June", 
  "July", "August", "September", "October", "November", "December"
];

const categoryMonthColors = [
  '#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', '#9966FF', '#FF9F40',
  '#C9CBCF', '#4D5360', '#F7464A', '#46BFBD', '#FDB45C', '#949FB1'
];

const yearlyComparisonColors = [
    'hsl(var(--chart-1))',
    'hsl(var(--chart-2))',
    'hsl(var(--chart-3))',
    'hsl(200, 82%, 52%)',
    'hsl(25, 82%, 52%)',
    'hsl(220, 82%, 52%)',
    'hsl(280, 82%, 52%)',
    'hsl(100, 82%, 52%)',
    'hsl(190, 82%, 52%)',
    'hsl(310, 82%, 52%)',
    'hsl(70, 82%, 52%)',
    'hsl(130, 82%, 52%)',
];


export default function ReportsPage() {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();
  
  const [years, setYears] = useState<number[]>([]);
  const [selectedYear, setSelectedYear] = useState<number | null>(null);

  const [allCategories, setAllCategories] = useState<string[]>([]);
  
  useEffect(() => {
    async function loadInitialData() {
      try {
        const [availableYears, sheetCategories] = await Promise.all([
            getYearsWithExpenses(),
            getCategories()
        ]);
        
        const currentYear = new Date().getFullYear();
        const yearsToSet = availableYears.length > 0 ? availableYears : [currentYear];

        setYears(yearsToSet);
        setSelectedYear(yearsToSet[0]);
        

        const combined = [...staticCategories, ...sheetCategories];
        const uniqueCategories = [...new Set(combined)].sort();
        setAllCategories(uniqueCategories);

      } catch (error) {
        console.error("Failed to load initial data", error);
        toast({
            variant: "destructive",
            title: "Failed to load initial data",
            description: "Could not fetch available years or categories.",
        })
      }
    }
    loadInitialData();
  }, [toast]);

  const loadExpenses = useCallback(async () => {
    if (!selectedYear) return;
    
    setIsLoading(true);
    try {
      const sheetExpenses = await getExpenses(selectedYear);
      setExpenses(sheetExpenses);
    } catch (error) {
      console.error("Failed to load expenses", error);
      toast({
          variant: "destructive",
          title: "Failed to load data",
          description: "Could not fetch expenses from Google Sheets.",
      })
    } finally {
      setIsLoading(false);
    }
  }, [selectedYear, toast]);

  useEffect(() => {
    loadExpenses();
  }, [loadExpenses]);
  
  const totalSpentForYear = useMemo(() => expenses.reduce((sum, expense) => sum + expense.amount, 0), [expenses]);
  
  const spendingByCategory = useMemo(() => expenses.reduce((acc, expense) => {
      const category = expense.category || "Other";
      if (!acc[category]) acc[category] = 0;
      acc[category] += expense.amount;
      return acc;
  }, {} as { [key: string]: number }), [expenses]);
  
  const pieChartData = useMemo(() => Object.entries(spendingByCategory)
      .map(([name, value]) => ({ name, value }))
      .filter(item => item.value > 0)
      .sort((a, b) => b.value - a.value), [spendingByCategory]);

  const pieChartConfig: ChartConfig = useMemo(() => {
    const config: ChartConfig = {};
    pieChartData.forEach((item, index) => {
        config[item.name] = {
          label: item.name,
          color: `hsl(var(--chart-${(index % 5) + 1}))`,
        };
    });
    return config;
  }, [pieChartData]);
  
  const categoryMonthlySpendingData = useMemo(() => {
    const categoriesWithSpending = Object.keys(spendingByCategory);
    
    return categoriesWithSpending.map(category => {
      const monthlyTotals = Array(12).fill(0);
      
      expenses
        .filter(e => e.category === category)
        .forEach(expense => {
          const monthIndex = getMonth(toZonedTime(new Date(expense.date), 'Asia/Kolkata'));
          monthlyTotals[monthIndex] += expense.amount;
        });
        
      const chartData = months.map((month, index) => ({
        month,
        total: monthlyTotals[index],
      }));

      return {
        category,
        chartData,
        hasSpending: chartData.some(d => d.total > 0),
      };
    });
  }, [expenses, spendingByCategory]);

  const monthlyComparisonData = useMemo(() => {
    const monthlyTotals = Array(12).fill(0);
    expenses.forEach(expense => {
      const monthIndex = getMonth(toZonedTime(new Date(expense.date), 'Asia/Kolkata'));
      monthlyTotals[monthIndex] += expense.amount;
    });
    return months.map((month, index) => ({
      month,
      total: monthlyTotals[index],
    }));
  }, [expenses]);


  const barChartConfig: ChartConfig = {
    total: {
      label: "Total",
      color: "hsl(var(--chart-1))",
    },
  };

  const monthlyComparisonConfig: ChartConfig = useMemo(() => {
    const config: ChartConfig = {};
    months.forEach((month, index) => {
      config[month] = {
        label: month,
        color: yearlyComparisonColors[index],
      };
    });
    return config;
  }, []);

  if (isLoading && expenses.length === 0 && allCategories.length === 0) {
    return (
      <div className="flex justify-center items-center h-screen">
        <Loader2 className="h-16 w-16 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-3xl font-bold tracking-tight font-headline">Reports</h1>
        {years.length > 0 && selectedYear && (
          <Select
            value={selectedYear.toString()}
            onValueChange={(value) => setSelectedYear(parseInt(value))}
          >
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Select year" />
            </SelectTrigger>
            <SelectContent>
              {years.map(year => (
                <SelectItem key={year} value={year.toString()}>
                  {year}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>
      
      {isLoading ? (
         <div className="flex justify-center items-center h-[400px]">
            <Loader2 className="h-12 w-12 animate-spin text-primary" />
         </div>
      ) : expenses.length === 0 ? (
        <Card className="text-center p-8">
          <CardTitle>No Expense Data for {selectedYear}</CardTitle>
          <CardDescription className="mt-2">
            Once you start adding expenses, your yearly report will show up here.
          </CardDescription>
        </Card>
      ) : selectedYear && (
        <div className="grid gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Yearly Report: {selectedYear}</CardTitle>
              <CardDescription>Total Spent: {totalSpentForYear.toLocaleString('en-IN', { style: 'currency', currency: 'INR' })}</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-6 md:grid-cols-2">
              {pieChartData.length > 0 ? (
                <ChartContainer config={pieChartConfig} className="mx-auto aspect-square max-h-[400px]">
                  <PieChart>
                    <ChartTooltip content={<CustomPieTooltip />} />
                    <Pie data={pieChartData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={150}>
                      {pieChartData.map((item, index) => (
                        <Cell key={`cell-${index}`} fill={pieChartConfig[item.name]?.color} />
                      ))}
                    </Pie>
                  </PieChart>
                </ChartContainer>
              ) : (
                <div className="flex h-[400px] items-center justify-center text-muted-foreground">
                  No spending data for {selectedYear}.
                </div>
              )}
               <ChartContainer config={monthlyComparisonConfig} className="h-[400px] w-full">
                <BarChart data={monthlyComparisonData} margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                  <CartesianGrid vertical={false} />
                  <XAxis dataKey="month" tickLine={false} tickMargin={10} axisLine={false} tickFormatter={(value) => value.slice(0,3)} />
                  <YAxis tickFormatter={(value) => `₹${Number(value) / 1000}k`} />
                  <ChartTooltip content={<ChartTooltipContent formatter={(value) => Number(value).toLocaleString('en-IN', { style: 'currency', currency: 'INR' })} />} />
                  <Bar dataKey="total" radius={4}>
                    {monthlyComparisonData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={yearlyComparisonColors[index % yearlyComparisonColors.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ChartContainer>
            </CardContent>
          </Card>
          
          <h2 className="text-2xl font-bold tracking-tight font-headline mt-4">Category Expense Trends</h2>
          
          <div className="grid gap-6 md:grid-cols-2">
            {categoryMonthlySpendingData.filter(c => c.hasSpending).map(({ category, chartData }) => (
              <Card key={category}>
                <CardHeader>
                    <CardTitle>{category} Trend</CardTitle>
                    <CardDescription>Monthly spending in {selectedYear}.</CardDescription>
                </CardHeader>
                <CardContent>
                    <ChartContainer config={barChartConfig} className="h-[300px] w-full">
                        <BarChart accessibilityLayer data={chartData} margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                           <CartesianGrid vertical={false} />
                            <XAxis
                                dataKey="month"
                                tickLine={false}
                                tickMargin={10}
                                axisLine={false}
                                tickFormatter={(value) => value.slice(0,3)}
                            />
                            <YAxis 
                              tickFormatter={(value) => `₹${Number(value) / 1000}k`}
                            />
                            <ChartTooltip 
                                content={<ChartTooltipContent 
                                    formatter={(value) => Number(value).toLocaleString('en-IN', { style: 'currency', currency: 'INR' })}
                                />} 
                            />
                            <Bar dataKey="total" radius={4}>
                                {chartData.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={categoryMonthColors[index]} />
                                ))}
                            </Bar>
                        </BarChart>
                    </ChartContainer>
                </CardContent>
              </Card>
            ))}
          </div>

        </div>
        )}
    </div>
  );
}

    
