
"use client";

import React, { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { type ImportantDate } from '@/lib/types';
import { Loader2 } from 'lucide-react';

const importantDateSchema = z.object({
  title: z.string().min(2, { message: 'Title must be at least 2 characters.' }),
  date: z.string().min(1, { message: 'Date is required.' }),
  description: z.string().optional(),
});

type ImportantDateFormValues = z.infer<typeof importantDateSchema>;

type ImportantDateDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: Omit<ImportantDate, 'id'> | ImportantDate) => Promise<void>;
  editingDate?: ImportantDate | null;
  title: string;
};

export function ImportantDateDialog({
  open,
  onOpenChange,
  onSubmit,
  editingDate,
  title,
}: ImportantDateDialogProps) {
  const form = useForm<ImportantDateFormValues>({
    resolver: zodResolver(importantDateSchema),
    defaultValues: {
      title: '',
      date: '',
      description: '',
    },
  });

  useEffect(() => {
    if (editingDate) {
      form.reset({
        title: editingDate.title,
        date: editingDate.date,
        description: editingDate.description || '',
      });
    } else {
      form.reset({
        title: '',
        date: '',
        description: '',
      });
    }
  }, [editingDate, form, open]);

  const handleSubmit = async (data: ImportantDateFormValues) => {
    if (editingDate) {
      await onSubmit({ ...editingDate, ...data });
    } else {
      await onSubmit(data);
    }
  };

  const isSubmitting = form.formState.isSubmitting;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{editingDate ? 'Edit Date' : 'Add New Date'}</DialogTitle>
          <DialogDescription>
            {editingDate ? 'Update the details for this important date.' : 'Add a new important date to the list.'}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Title</FormLabel>
                  <FormControl>
                    <Input placeholder="Event title..." {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="date"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Date</FormLabel>
                  <FormControl>
                    <Input type="text" placeholder="e.g., 20th Oct, every year or specific date" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description (Optional)</FormLabel>
                  <FormControl>
                    <Textarea placeholder="Add some notes..." {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {editingDate ? 'Save Changes' : 'Add Date'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
