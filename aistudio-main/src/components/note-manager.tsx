"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, PlusCircle, Pencil, Trash2, FileText } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { type NoteItem } from '@/lib/types';
import { getNotes, addNote, updateNote, deleteNote } from '@/lib/sheets';
import { NoteDialog } from './note-dialog';
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
import { format } from "date-fns";

export function NoteManager() {
  const [notes, setNotes] = useState<NoteItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingNote, setEditingNote] = useState<NoteItem | null>(null);
  const [deletingNote, setDeletingNote] = useState<NoteItem | null>(null);
  const { toast } = useToast();
  const { isPasswordSet, showPasswordDialog, passwordDialogProps } = useMasterPassword();

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await getNotes();
      setNotes(data || []);
    } catch (error) {
      console.error(`Failed to load notes:`, error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to load data from Google Sheets.',
      });
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleAddOrUpdate = async (data: Omit<NoteItem, 'id' | 'updatedAt'> | NoteItem) => {
    try {
      if ('id' in data) {
        await updateNote(data as NoteItem);
        toast({ title: 'Success', description: 'Note updated.' });
      } else {
        await addNote(data);
        toast({ title: 'Success', description: 'Note added.' });
      }
      setIsDialogOpen(false);
      setEditingNote(null);
      loadData();
    } catch (error) {
      console.error('Failed to save note:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to save changes to Google Sheets.',
      });
    }
  };

  const handleDelete = async () => {
    if (!deletingNote) return;
    try {
      await deleteNote(deletingNote.id);
      toast({ title: 'Deleted', description: 'Note removed.' });
      setDeletingNote(null);
      loadData();
    } catch (error) {
      console.error('Failed to delete note:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to delete from Google Sheets.',
      });
    }
  };

  const handleEditClick = (note: NoteItem) => {
    showPasswordDialog({
      title: isPasswordSet ? "Enter Master Password" : "Set Master Password",
      description: isPasswordSet 
        ? "Please enter your master password to edit this note."
        : "Before editing, please set a master password for sensitive actions.",
      onSuccess: () => {
        setEditingNote(note);
        setIsDialogOpen(true);
      },
    });
  };

  const handleDeleteClick = (note: NoteItem) => {
    showPasswordDialog({
      title: isPasswordSet ? "Enter Master Password" : "Set Master Password",
      description: isPasswordSet 
        ? "Please enter your master password to delete this note."
        : "Before deleting, please set a master password for sensitive actions.",
      onSuccess: () => {
        setDeletingNote(note);
      },
    });
  };

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0">
          <div>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-6 w-6 text-primary" />
              Notes
            </CardTitle>
            <CardDescription>Manage your personal notes.</CardDescription>
          </div>
          <Button onClick={() => { setEditingNote(null); setIsDialogOpen(true); }}>
            <PlusCircle className="mr-2 h-4 w-4" /> Add Note
          </Button>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center p-12">
              <Loader2 className="h-12 w-12 animate-spin text-primary" />
            </div>
          ) : notes.length === 0 ? (
            <div className="text-center py-12 border-2 border-dashed rounded-lg">
              <FileText className="h-12 w-12 mx-auto text-muted-foreground opacity-20 mb-4" />
              <p className="text-muted-foreground">No notes recorded yet.</p>
              <Button variant="link" onClick={() => setIsDialogOpen(true)}>Add your first note</Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {notes.map((item) => (
                <Card key={item.id} className="flex flex-col justify-between">
                  <CardHeader className="pb-3 border-b border-border/50">
                    <CardTitle className="text-lg">{item.title}</CardTitle>
                    <CardDescription className="text-xs">
                        Last updated: {item.updatedAt ? format(new Date(item.updatedAt), "PP p") : "Unknown"}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="pt-4 flex-grow">
                    <p className="whitespace-pre-wrap text-sm">{item.content}</p>
                  </CardContent>
                  <div className="p-4 pt-0 flex justify-end gap-2">
                    <Button variant="outline" size="sm" onClick={() => handleEditClick(item)}>
                      <Pencil className="h-4 w-4 mr-2" /> Edit
                    </Button>
                    <Button variant="outline" size="sm" className="text-destructive hover:bg-destructive hover:text-white" onClick={() => handleDeleteClick(item)}>
                      <Trash2 className="h-4 w-4 mr-2" /> Delete
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <NoteDialog
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        onSubmit={handleAddOrUpdate}
        editingNote={editingNote}
      />

      <MasterPasswordDialog {...passwordDialogProps} />

      <AlertDialog open={!!deletingNote} onOpenChange={(open) => !open && setDeletingNote(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete "{deletingNote?.title}". This action cannot be undone.
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
