
"use client";

import { useState, useEffect, useCallback } from 'react';
import { getMasterPassword, setMasterPassword as setSheetPassword } from '@/lib/sheets';

type DialogOptions = {
    title: string;
    description: string;
    onSuccess: () => void;
    onCancel?: () => void;
};

export function useMasterPassword() {
  const [storedPassword, setStoredPassword] = useState<string | null>(null);
  const [isPasswordSet, setIsPasswordSet] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [dialogOptions, setDialogOptions] = useState<DialogOptions>({
      title: '',
      description: '',
      onSuccess: () => {},
  });

  useEffect(() => {
    async function fetchPassword() {
        setIsLoading(true);
        try {
            const password = await getMasterPassword();
            if (password) {
                setStoredPassword(password);
                setIsPasswordSet(true);
            }
        } catch (error) {
            console.error("Could not fetch master password from sheet", error);
        } finally {
            setIsLoading(false);
        }
    }
    fetchPassword();
  }, []);

  const setPassword = useCallback(async (password: string) => {
    try {
        await setSheetPassword(password);
        setStoredPassword(password);
        setIsPasswordSet(true);
    } catch (error) {
        console.error("Could not save password to sheet", error);
        // Here you might want to show a toast to the user
    }
  }, []);

  const verifyPassword = useCallback((password: string) => {
    return password === storedPassword;
  }, [storedPassword]);

  const showPasswordDialog = useCallback((options: DialogOptions) => {
      setDialogOptions(options);
      setIsDialogOpen(true);
  }, []);

  const handleCloseDialog = useCallback(() => {
    setIsDialogOpen(false);
    if (dialogOptions.onCancel) {
        dialogOptions.onCancel();
    }
  }, [dialogOptions]);

  const passwordDialogProps = {
    isOpen: isDialogOpen,
    onClose: handleCloseDialog,
    title: dialogOptions.title,
    description: dialogOptions.description,
    isPasswordSet,
    verifyPassword,
    setPassword,
    onSuccess: dialogOptions.onSuccess,
  };

  return {
    isPasswordSet,
    isLoading, // Expose loading state
    setPassword,
    verifyPassword,
    showPasswordDialog,
    passwordDialogProps,
  };
}
