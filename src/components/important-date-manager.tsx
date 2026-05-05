
"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Loader2, PlusCircle, Pencil, Trash2, CalendarHeart } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { type ImportantDate } from '@/lib/types';
import { getImportantDates, addImportantDate, updateImportantDate, deleteImportantDate } from '@/lib/sheets';
import { ImportantDateDialog } from './important-date-dialog';
import { useMasterPassword } from '@/hooks/use-master-password';
import { MasterPasswordDialog } from '@/components/master-password-dialog';
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

type ImportantDateManagerProps = {
  sheetName: string;
  title: string;
};

export function ImportantDateManager({ sheetName, title }: ImportantDateManagerProps) {
  const [dates, setDates] = useState<ImportantDate[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingDate, setEditingDate] = useState<ImportantDate | null>(null);
  const [deletingDate, setDeletingDate] = useState<ImportantDate | null>(null);
  const { toast } = useToast();
  const { isPasswordSet, showPasswordDialog, passwordDialogProps } = useMasterPassword();

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await getImportantDates(sheetName);
      setDates(data);
    } catch (error) {
      console.error(`Failed to load important dates for ${sheetName}:`, error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to load data from Google Sheets.',
      });
    } finally {
      setIsLoading(false);
    }
  }, [sheetName, toast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleAddOrUpdate = async (data: Omit<ImportantDate, 'id'> | ImportantDate) => {
    try {
      if ('id' in data) {
        await updateImportantDate(sheetName, data as ImportantDate);
        toast({ title: 'Success', description: 'Important date updated.' });
      } else {
        await addImportantDate(sheetName, data);
        toast({ title: 'Success', description: 'Important date added.' });
      }
      setIsDialogOpen(false);
      setEditingDate(null);
      loadData();
    } catch (error) {
      console.error('Failed to save important date:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to save changes to Google Sheets.',
      });
    }
  };

  const handleDelete = async () => {
    if (!deletingDate) return;
    try {
      await deleteImportantDate(sheetName, deletingDate);
      toast({ title: 'Deleted', description: 'Important date removed.' });
      setDeletingDate(null);
      loadData();
    } catch (error) {
      console.error('Failed to delete important date:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to delete from Google Sheets.',
      });
    }
  };

  const handleEditClick = (date: ImportantDate) => {
    showPasswordDialog({
      title: isPasswordSet ? "Enter Master Password" : "Set Master Password",
      description: isPasswordSet 
        ? "Please enter your master password to edit this record."
        : "Before editing, please set a master password for sensitive actions.",
      onSuccess: () => {
        setEditingDate(date);
        setIsDialogOpen(true);
      },
    });
  };

  const handleDeleteClick = (date: ImportantDate) => {
    showPasswordDialog({
      title: isPasswordSet ? "Enter Master Password" : "Set Master Password",
      description: isPasswordSet 
        ? "Please enter your master password to delete this record."
        : "Before deleting, please set a master password for sensitive actions.",
      onSuccess: () => {
        setDeletingDate(date);
      },
    });
  };

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0">
          <div>
            <CardTitle className="flex items-center gap-2">
              <CalendarHeart className="h-6 w-6 text-primary" />
              {title}
            </CardTitle>
            <CardDescription>Manage your list of important dates and events.</CardDescription>
          </div>
          <Button onClick={() => { setEditingDate(null); setIsDialogOpen(true); }}>
            <PlusCircle className="mr-2 h-4 w-4" /> Add Date
          </Button>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center p-12">
              <Loader2 className="h-12 w-12 animate-spin text-primary" />
            </div>
          ) : dates.length === 0 ? (
            <div className="text-center py-12 border-2 border-dashed rounded-lg">
              <CalendarHeart className="h-12 w-12 mx-auto text-muted-foreground opacity-20 mb-4" />
              <p className="text-muted-foreground">No important dates recorded yet.</p>
              <Button variant="link" onClick={() => setIsDialogOpen(true)}>Add your first important date</Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Title</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead className="hidden md:table-cell">Description</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {dates.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="font-medium">{item.title}</TableCell>
                      <TableCell className="whitespace-nowrap">{item.date}</TableCell>
                      <TableCell className="hidden md:table-cell text-sm text-muted-foreground max-w-xs truncate">
                        {item.description}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button variant="ghost" size="icon" onClick={() => handleEditClick(item)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" className="text-destructive" onClick={() => handleDeleteClick(item)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <ImportantDateDialog
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        onSubmit={handleAddOrUpdate}
        editingDate={editingDate}
        title={title}
      />

      <MasterPasswordDialog {...passwordDialogProps} />

      <AlertDialog open={!!deletingDate} onOpenChange={(open) => !open && setDeletingDate(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the event "{deletingDate?.title}". This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
