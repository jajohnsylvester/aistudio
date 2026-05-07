
import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import {
  Utensils,
  Car,
  Ticket,
  Bolt,
  Home,
  HeartPulse,
  ShoppingBag,
  Plane,
  Book,
  User,
  MoreHorizontal,
  type LucideProps,
  Receipt,
  Apple,
  Carrot,
  Drumstick,
  Cookie,
  Plus,
  Fuel,
  CreditCard,
  Shapes,
  Search,
  WalletCards,
  CheckCircle2
} from 'lucide-react';
import React from "react";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export const getCategoryIcon = (category: string, props?: LucideProps) => {
  const iconProps = { className: 'h-4 w-4 text-muted-foreground', ...props };
  switch (category) {
    case 'Grocery':
      return <ShoppingBag {...iconProps} />;
    case 'Fruits':
      return <Apple {...iconProps} />;
    case 'Veggi':
      return <Carrot {...iconProps} />;
    case 'NonVeg':
      return <Drumstick {...iconProps} />;
    case 'Snacks':
      return <Cookie {...iconProps} />;
    case 'Extra':
      return <Plus {...iconProps} />;
    case 'Petrol':
      return <Fuel {...iconProps} />;
    case 'Food':
      return <Utensils {...iconProps} />;
    case 'FoodCard':
      return <WalletCards {...iconProps} />;
    case 'Transportation':
      return <Car {...iconProps} />;
    case 'Entertainment':
      return <Ticket {...iconProps} />;
    case 'Utilities':
      return <Bolt {...iconProps} />;
    case 'Housing':
      return <Home {...iconProps} />;
    case 'Healthcare':
      return <HeartPulse {...iconProps} />;
    case 'Shopping':
      return <ShoppingBag {...iconProps} />;
    case 'Travel':
      return <Plane {...iconProps} />;
    case 'Education':
      return <Book {...iconProps} />;
    case 'Personal':
      return <User {...iconProps} />;
    case 'Transactions':
      return <Receipt {...iconProps} />;
    case 'Credit Card':
      return <CreditCard {...iconProps} />;
    case 'Categories':
      return <Shapes {...iconProps} />;
    case 'Search':
      return <Search {...iconProps} />;
    default:
      return <MoreHorizontal {...iconProps} />;
  }
};
