
export type Expense = {
  id: string;
  description: string;
  amount: number;
  category: string;
  date: string; // Using string for simplicity, can be parsed to Date
  paid?: boolean;
};

// This list contains default categories that cannot be deleted.
// User-defined categories will be added from Google Sheets.
export const CATEGORIES = [
  'Grocery',
  'Fruits',
  'Veggi',
  'NonVeg',
  'Snacks',
  'Extra',
  'Petrol',
  'Credit Card',
  'FoodCard',
  'Other',
] as const;

export type Category = (typeof CATEGORIES)[number];

export type Budget = {
    category: string;
    amount: number;
};

export type CategoryWithBudget = {
    name: string;
    budget: number;
    isStatic: boolean;
};
