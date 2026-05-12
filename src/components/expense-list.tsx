
"use client";

import React from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { Expense } from '@/lib/types';
import { getCategoryIcon } from '@/lib/utils.tsx';
import { format } from 'date-fns';
import { toZonedTime } from 'date-fns-tz';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from './ui/dropdown-menu';
import { Button } from './ui/button';
import { MoreHorizontal, Pencil, Trash2, CheckCircle2, CircleOff } from 'lucide-react';
import { type GroupedExpenses } from '@/app/transactions/page';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './ui/tooltip';
import { cn } from '@/lib/utils';

const TIME_ZONE = 'Asia/Kolkata';

type ExpenseListProps = {
    expenses: GroupedExpenses | Expense[];
    onEdit: (expense: Expense) => void;
    onDelete: (expense: Expense) => void;
    onTogglePaid?: (expense: Expense) => void;
};


// Helper to check if expenses is GroupedExpenses
function isGrouped(expenses: GroupedExpenses | Expense[]): expenses is GroupedExpenses {
    if (Array.isArray(expenses)) return false;
    if (typeof expenses === 'object' && expenses !== null) {
       // Check if it has the structure of GroupedExpenses
       const keys = Object.keys(expenses);
       if (keys.length === 0) return true; // Can be an empty object
       const firstValue = expenses[keys[0]];
       return typeof firstValue === 'object' && firstValue !== null && 'expenses' in firstValue && 'total' in firstValue;
    }
    return false;
}


export function ExpenseList({ expenses, onEdit, onDelete, onTogglePaid }: ExpenseListProps) {

  const renderExpenseRow = (expense: Expense) => (
    <TableRow key={expense.id}>
        <TableCell>
            <div className="flex items-center gap-2">
            {getCategoryIcon(expense.category, {})}
            <span className="hidden sm:inline">{expense.category}</span>
            </div>
        </TableCell>
        <TableCell className="font-medium">
          <div className="flex items-center gap-2">
            <span className={cn("font-semibold", {
                "text-destructive": expense.category === 'Credit Card' && !expense.paid,
                "text-green-600": expense.category === 'Credit Card' && expense.paid,
            })}>{expense.description}</span>
            {expense.category === 'Credit Card' && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger>
                    {expense.paid ? (
                      <CheckCircle2 className="h-4 w-4 text-green-500" />
                    ) : (
                      <CircleOff className="h-4 w-4 text-destructive" />
                    )}
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>{expense.paid ? 'Paid' : 'Not Paid'}</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </div>
        </TableCell>
        <TableCell className="text-right">
            <span className={cn({
                "text-destructive": expense.category === 'Credit Card' && !expense.paid,
                "text-green-600": expense.category === 'Credit Card' && expense.paid,
            })}>{Math.abs(expense.amount).toLocaleString('en-IN', { style: 'currency', currency: 'INR' })}</span>
        </TableCell>
        <TableCell className="hidden md:table-cell text-right">
            {format(toZonedTime(new Date(expense.date), TIME_ZONE), 'PP')}
        </TableCell>
        <TableCell className="text-right">
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8">
                        <MoreHorizontal className="h-4 w-4" />
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => onEdit(expense)}>
                        <Pencil className="mr-2 h-4 w-4" /> Edit
                    </DropdownMenuItem>
                    {onTogglePaid && expense.category === 'Credit Card' && (
                        <>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => onTogglePaid(expense)}>
                                {expense.paid ? (
                                    <><CircleOff className="mr-2 h-4 w-4" /> Mark as Unpaid</>
                                ) : (
                                    <><CheckCircle2 className="mr-2 h-4 w-4" /> Mark as Paid</>
                                )}
                            </DropdownMenuItem>
                        </>
                    )}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => onDelete(expense)} className="text-destructive">
                        <Trash2 className="mr-2 h-4 w-4" /> Delete
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>
        </TableCell>
    </TableRow>
  );


  if (!expenses || (Array.isArray(expenses) && expenses.length === 0) || (!Array.isArray(expenses) && Object.keys(expenses).length === 0) ) {
    return <p className="text-sm text-muted-foreground text-center py-8">No expenses recorded yet.</p>;
  }

  return (
    <div className="w-full overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[100px]">Category</TableHead>
            <TableHead>Description</TableHead>
            <TableHead className="text-right">Amount</TableHead>
            <TableHead className="hidden md:table-cell text-right">Date</TableHead>
            <TableHead className="w-12 text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        
        {isGrouped(expenses) ? (
             Object.entries(expenses).map(([date, { expenses: dailyExpenses, total }]) => (
                <React.Fragment key={date}>
                    <TableBody>
                        <TableRow className="bg-muted/50 hover:bg-muted">
                            <TableCell colSpan={2} className="font-bold text-primary">
                                {format(toZonedTime(new Date(date), TIME_ZONE), 'EEEE, MMMM d, yyyy')}
                            </TableCell>
                            <TableCell colSpan={3} className="text-right font-bold text-primary">
                                Daily Total: {total.toLocaleString('en-IN', { style: 'currency', currency: 'INR' })}
                            </TableCell>
                        </TableRow>
                    </TableBody>
                    <TableBody>
                        {dailyExpenses.map(renderExpenseRow)}
                    </TableBody>
                </React.Fragment>
            ))
        ) : (
            <TableBody>
                {(expenses as Expense[]).map(renderExpenseRow)}
            </TableBody>
        )}
      </Table>
    </div>
  );
}
