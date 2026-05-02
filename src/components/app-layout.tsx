
"use client";

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  SidebarProvider,
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarInset,
  SidebarTrigger,
} from '@/components/ui/sidebar';
import {
  LayoutDashboard,
  PieChart,
  Wallet,
  ReceiptIndianRupee,
  Shapes,
  Search,
  BrainCircuit,
  TrendingUp,
  LineChart,
  Crosshair,
  FileSpreadsheet,
  Wand2,
  FileText,
  TableProperties,
  CalendarDays,
} from 'lucide-react';

export function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  const menuItems = [
    { href: '/', label: 'Dashboard', icon: LayoutDashboard },
    { href: '/transactions', label: 'Transactions', icon: ReceiptIndianRupee },
    { href: '/date-range', label: 'Date Range Analysis', icon: CalendarDays },
    { href: '/age-calculator', label: 'Current Age Calculator', icon: CalendarDays },
    { href: '/categories', label: 'Categories', icon: Shapes },
    { href: '/reports', label: 'Reports', icon: PieChart },
    { href: '/search', label: 'Search', icon: Search },
    { href: '/personal-perplexity', label: 'Personal Perplexity App', icon: BrainCircuit },
    { href: '/stock-predictor', label: 'Stock Predictor App', icon: TrendingUp },
    { href: '/crossover-strategy', label: 'Personalized Stock Analyser App', icon: LineChart },
    { href: '/alpha-advantage', label: 'Alpha Advantage App', icon: Crosshair },
    { href: '/spreadsheet', label: 'StockMarketPortfolio sheet', icon: FileSpreadsheet },
    { href: '/notes', label: 'Indian Stock Screening Strategy Doc', icon: FileText },
    { href: '/appsheet', label: 'AppSheet Sheet', icon: TableProperties },
    { href: '/stocknotes', label: 'StockNotes Sheet', icon: FileText },
    { href: '/magic-formula', label: 'Magic formula Sheet', icon: Wand2 },
  ];

  return (
    <SidebarProvider>
      <Sidebar>
        <SidebarHeader>
          <div className="flex items-center gap-2 p-2">
            <Wallet className="h-8 w-8 text-primary" />
            <h1 className="text-xl font-bold font-headline">PersonalExpenseTracker</h1>
          </div>
        </SidebarHeader>
        <SidebarContent>
          <SidebarMenu>
            {menuItems.map((item) => (
              <SidebarMenuItem key={item.href}>
                <Link href={item.href}>
                  <SidebarMenuButton
                    asChild
                    isActive={pathname === item.href}
                    tooltip={item.label}
                  >
                    <span className="flex w-full items-center gap-2">
                      <item.icon />
                      <span>{item.label}</span>
                    </span>
                  </SidebarMenuButton>
                </Link>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarContent>
      </Sidebar>
      <SidebarInset>
        <header className="sticky top-0 z-10 flex h-14 items-center gap-4 border-b bg-background/80 px-4 backdrop-blur-sm sm:h-16 sm:px-6 md:hidden">
          <SidebarTrigger />
          <div className="flex items-center gap-2">
            <Wallet className="h-6 w-6 text-primary" />
            <h1 className="text-lg font-bold font-headline">PersonalExpenseTracker</h1>
          </div>
        </header>
        <main className="flex-1 p-4 sm:p-6">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  );
}
