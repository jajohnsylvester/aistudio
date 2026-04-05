
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { Expense, Budget } from '@/lib/types';
import { ArrowDownCircle, Banknote, CreditCard, CheckCircle, Wallet, PlusCircle } from 'lucide-react';

type DashboardSummaryProps = {
  expenses: Expense[];
  budgets: Budget[];
};

export function DashboardSummary({ expenses, budgets }: DashboardSummaryProps) {
  const expensesWithoutCreditCard = expenses.filter(e => e.category !== 'Credit Card');
  
  const unpaidCreditCardExpenses = expenses.filter(e => e.category === 'Credit Card' && !e.paid);
  const paidCreditCardExpenses = expenses.filter(e => e.category === 'Credit Card' && e.paid);
  
  const totalSpentExcludingCC = expensesWithoutCreditCard.reduce((sum, expense) => sum + expense.amount, 0);
  const unpaidCreditCardSpent = unpaidCreditCardExpenses.reduce((sum, expense) => sum + expense.amount, 0);
  const paidCreditCardSpent = paidCreditCardExpenses.reduce((sum, expense) => sum + expense.amount, 0);

  const totalMonthlySpent = totalSpentExcludingCC + unpaidCreditCardSpent + paidCreditCardSpent;

  const totalBudget = budgets.reduce((sum, budget) => sum + budget.amount, 0);
  const remainingBudget = totalBudget - totalSpentExcludingCC;
  const isOverBudget = remainingBudget < 0;

  return (
    <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-5">
        <Card className="border-primary/20 bg-primary/5">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Monthly Spent</CardTitle>
            <PlusCircle className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold truncate">
              {totalMonthlySpent.toLocaleString('en-IN', { style: 'currency', currency: 'INR' })}
            </div>
             <p className="text-xs text-muted-foreground">All transactions included</p>
          </CardContent>
        </Card>
        <Card className="hover:bg-muted/50 transition-colors">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Spent (Ex-CC)</CardTitle>
            <ArrowDownCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold truncate">
              {totalSpentExcludingCC.toLocaleString('en-IN', { style: 'currency', currency: 'INR' })}
            </div>
             <p className="text-xs text-muted-foreground">Cash, FoodCard, etc.</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Unpaid Credit Card</CardTitle>
            <CreditCard className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive truncate">
                {unpaidCreditCardSpent.toLocaleString('en-IN', { style: 'currency', currency: 'INR' })}
            </div>
            <p className="text-xs text-muted-foreground">Outstanding CC bills</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Paid Credit Card</CardTitle>
            <CheckCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600 truncate">
                {paidCreditCardSpent.toLocaleString('en-IN', { style: 'currency', currency: 'INR' })}
            </div>
            <p className="text-xs text-muted-foreground">Cleared CC transactions</p>
          </CardContent>
        </Card>
        <Card className={isOverBudget ? "bg-destructive/10 border-destructive" : ""}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
                {isOverBudget ? "Over Budget By" : "Remaining Budget"}
            </CardTitle>
            <Banknote className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold truncate ${isOverBudget ? 'text-destructive' : ''}`}>
                 {Math.abs(remainingBudget).toLocaleString('en-IN', { style: 'currency', currency: 'INR' })}
            </div>
            <p className="text-xs text-muted-foreground">Budget vs Ex-CC spending</p>
          </CardContent>
        </Card>
    </div>
  );
}
