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
  SidebarMenuSub,
  SidebarMenuSubItem,
  SidebarMenuSubButton,
  SidebarInset,
  SidebarTrigger,
} from '@/components/ui/sidebar';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  LayoutDashboard,
  PieChart,
  Wallet,
  ReceiptIndianRupee,
  Shapes,
  Search,
  FileSpreadsheet,
  Wand2,
  FileText,
  TableProperties,
  CalendarDays,
  CalendarHeart,
  Briefcase,
  ChevronRight,
  Layers,
  Sheet as SheetIcon,
} from 'lucide-react';

export function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  // Top-level, always-visible items
  const menuItems = [
    { href: '/', label: 'Dashboard', icon: LayoutDashboard },
    { href: '/scratch-notes', label: 'Notes', icon: FileText },
    { href: '/transactions', label: 'Transactions', icon: ReceiptIndianRupee },
    { href: '/paytm-portfolio', label: 'Paytm Money Portfolio', icon: Briefcase },
    { href: '/paytmmoneyint', label: 'Paytm Money Integ Arch', icon: Briefcase },
  ];

  // Grouped under "AddOn"
  const addOnItems = [
    { href: '/date-range', label: 'Date Range Analysis', icon: CalendarDays },
    { href: '/age-calculator', label: 'Current Age Calculator', icon: CalendarDays },
    { href: '/pondy-dates', label: 'Pondy Important Dates', icon: CalendarHeart },
    { href: '/chennai-dates', label: 'Chennai Important Dates', icon: CalendarHeart },
    { href: '/categories', label: 'Categories', icon: Shapes },
    { href: '/reports', label: 'Reports', icon: PieChart },
    { href: '/search', label: 'Search', icon: Search },
  ];

  // Grouped under "Sheet"
  const sheetItems = [
    { href: '/spreadsheet', label: 'StockMarketPortfolio sheet', icon: FileSpreadsheet },
    { href: '/appsheet', label: 'AppSheet Sheet', icon: TableProperties },
    { href: '/stocknotes', label: 'StockNotes Sheet', icon: FileText },
    { href: '/magic-formula', label: 'Magic formula Sheet', icon: Wand2 },
  ];

  const isGroupActive = (items: { href: string }[]) =>
    items.some((item) => item.href === pathname);

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

            {/* AddOn collapsible group */}
            <Collapsible defaultOpen={isGroupActive(addOnItems)} className="group/collapsible">
              <SidebarMenuItem>
                <CollapsibleTrigger asChild>
                  <SidebarMenuButton tooltip="AddOn">
                    <Layers />
                    <span>AddOn</span>
                    <ChevronRight className="ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
                  </SidebarMenuButton>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <SidebarMenuSub>
                    {addOnItems.map((item) => (
                      <SidebarMenuSubItem key={item.href}>
                        <Link href={item.href}>
                          <SidebarMenuSubButton asChild isActive={pathname === item.href}>
                            <span className="flex w-full items-center gap-2">
                              <item.icon className="h-4 w-4" />
                              <span>{item.label}</span>
                            </span>
                          </SidebarMenuSubButton>
                        </Link>
                      </SidebarMenuSubItem>
                    ))}
                  </SidebarMenuSub>
                </CollapsibleContent>
              </SidebarMenuItem>
            </Collapsible>

            {/* Sheet collapsible group */}
            <Collapsible defaultOpen={isGroupActive(sheetItems)} className="group/collapsible">
              <SidebarMenuItem>
                <CollapsibleTrigger asChild>
                  <SidebarMenuButton tooltip="Sheet">
                    <SheetIcon />
                    <span>Sheet</span>
                    <ChevronRight className="ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
                  </SidebarMenuButton>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <SidebarMenuSub>
                    {sheetItems.map((item) => (
                      <SidebarMenuSubItem key={item.href}>
                        <Link href={item.href}>
                          <SidebarMenuSubButton asChild isActive={pathname === item.href}>
                            <span className="flex w-full items-center gap-2">
                              <item.icon className="h-4 w-4" />
                              <span>{item.label}</span>
                            </span>
                          </SidebarMenuSubButton>
                        </Link>
                      </SidebarMenuSubItem>
                    ))}
                  </SidebarMenuSub>
                </CollapsibleContent>
              </SidebarMenuItem>
            </Collapsible>
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
