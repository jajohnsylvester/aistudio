
"use client";

import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
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
import { Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

const setPasswordSchema = z.object({
  password: z.string().min(4, 'Password must be at least 4 characters.'),
  confirmPassword: z.string(),
}).refine(data => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ['confirmPassword'],
});

const enterPasswordSchema = z.object({
  password: z.string().min(1, 'Password is required.'),
});

type MasterPasswordDialogProps = {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  description: string;
  isPasswordSet: boolean;
  verifyPassword: (password: string) => boolean;
  setPassword: (password: string) => void;
  onSuccess: () => void;
};

export function MasterPasswordDialog({
  isOpen,
  onClose,
  title,
  description,
  isPasswordSet,
  verifyPassword,
  setPassword,
  onSuccess,
}: MasterPasswordDialogProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();
  
  const formSchema = isPasswordSet ? enterPasswordSchema : setPasswordSchema;
  type FormValues = z.infer<typeof formSchema>;
  
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: isPasswordSet ? { password: '' } : { password: '', confirmPassword: '' },
  });
  
  useEffect(() => {
    form.reset();
  }, [isOpen, form]);

  function onSubmit(data: FormValues) {
    setIsSubmitting(true);
    if (isPasswordSet) {
      if (verifyPassword(data.password)) {
        toast({ title: 'Password verified successfully.' });
        onSuccess();
        onClose();
      } else {
        toast({ variant: 'destructive', title: 'Incorrect password.' });
        form.setError('password', { type: 'manual', message: 'Incorrect password.' });
      }
    } else {
      setPassword(data.password);
      toast({ title: 'Master password has been set.' });
      onSuccess();
      onClose();
    }
    setIsSubmitting(false);
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="password"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{isPasswordSet ? 'Master Password' : 'New Master Password'}</FormLabel>
                  <FormControl>
                    <Input type="password" placeholder="••••••••" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            {!isPasswordSet && (
              <FormField
                control={form.control}
                name="confirmPassword"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Confirm Master Password</FormLabel>
                    <FormControl>
                      <Input type="password" placeholder="••••••••" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}
            <DialogFooter>
                <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
                <Button type="submit" disabled={isSubmitting}>
                    {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    {isPasswordSet ? 'Submit' : 'Set Password'}
                </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
