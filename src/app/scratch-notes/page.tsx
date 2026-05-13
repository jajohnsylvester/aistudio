
'use client';

import { useState, useEffect, useCallback } from 'react';
import { getNotes, addNote, updateNote, deleteNote } from '@/lib/sheets';
import { Note } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Plus, Trash2, Edit2, Save, X } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useMasterPassword } from '@/hooks/use-master-password';
import { MasterPasswordDialog } from '@/components/master-password-dialog';
import { format } from 'date-fns';

export default function ScratchNotesPage() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isActionLoading, setIsActionLoading] = useState(false);
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [newNoteContent, setNewNoteContent] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  
  const { toast } = useToast();
  const { isPasswordSet, showPasswordDialog, passwordDialogProps } = useMasterPassword();

  const fetchNotes = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await getNotes();
      setNotes(data);
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to load notes.',
      });
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchNotes();
  }, [fetchNotes]);

  const handleAddNote = async () => {
    if (!newNoteContent.trim()) return;

    const action = async () => {
      setIsActionLoading(true);
      try {
        await addNote({
          content: newNoteContent,
          date: new Date().toISOString(),
        });
        setNewNoteContent('');
        setIsAdding(false);
        await fetchNotes();
        toast({ title: 'Note added' });
      } catch (error) {
        toast({ variant: 'destructive', title: 'Error', description: 'Failed to add note' });
      } finally {
        setIsActionLoading(false);
      }
    };

    showPasswordDialog(
      action,
      isPasswordSet 
        ? "Please enter your master password to add a note."
        : "Before adding notes, please set a master password."
    );
  };

  const handleUpdateNote = async (id: string) => {
    if (!editContent.trim()) return;

    const action = async () => {
      setIsActionLoading(true);
      try {
        await updateNote({
          id,
          content: editContent,
          date: new Date().toISOString(),
        });
        setEditingNoteId(null);
        await fetchNotes();
        toast({ title: 'Note updated' });
      } catch (error) {
        toast({ variant: 'destructive', title: 'Error', description: 'Failed to update note' });
      } finally {
        setIsActionLoading(false);
      }
    };

    showPasswordDialog(
      action,
      "Please enter your master password to edit this note."
    );
  };

  const handleDeleteNote = async (id: string) => {
    const action = async () => {
      setIsActionLoading(true);
      try {
        await deleteNote(id);
        await fetchNotes();
        toast({ title: 'Note deleted' });
      } catch (error) {
        toast({ variant: 'destructive', title: 'Error', description: 'Failed to delete note' });
      } finally {
        setIsActionLoading(false);
      }
    };

    showPasswordDialog(
      action,
      "Please enter your master password to delete this note."
    );
  };

  const startEditing = (note: Note) => {
    setEditingNoteId(note.id);
    setEditContent(note.content);
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-[60vh]">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight font-headline">Scratch Notes</h1>
          <p className="text-muted-foreground">Keep your thoughts and ideas organized.</p>
        </div>
        {!isAdding && (
          <Button onClick={() => setIsAdding(true)}>
            <Plus className="mr-2 h-4 w-4" /> Add Note
          </Button>
        )}
      </div>

      {isAdding && (
        <Card className="border-primary/50 shadow-md">
          <CardHeader>
            <CardTitle className="text-lg">New Note</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Textarea
              placeholder="Start typing your note here..."
              value={newNoteContent}
              onChange={(e) => setNewNoteContent(e.target.value)}
              className="min-h-[150px] resize-none"
              autoFocus
            />
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setIsAdding(false)}>Cancel</Button>
              <Button onClick={handleAddNote} disabled={isActionLoading || !newNoteContent.trim()}>
                {isActionLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save Note
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4">
        {notes.length === 0 ? (
          <Card className="flex flex-col items-center justify-center p-12 text-center border-dashed">
            <p className="text-muted-foreground mb-4">You haven't added any notes yet.</p>
            <Button variant="outline" onClick={() => setIsAdding(true)}>
              <Plus className="mr-2 h-4 w-4" /> Create your first note
            </Button>
          </Card>
        ) : (
          notes.map((note) => (
            <Card key={note.id} className="group">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardDescription>
                  {format(new Date(note.date), 'PPP p')}
                </CardDescription>
                <div className="flex items-center gap-2">
                  {editingNoteId !== note.id && (
                    <>
                      <Button variant="ghost" size="icon" onClick={() => startEditing(note)}>
                        <Edit2 className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => handleDeleteNote(note.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                {editingNoteId === note.id ? (
                  <div className="space-y-4">
                    <Textarea
                      value={editContent}
                      onChange={(e) => setEditContent(e.target.value)}
                      className="min-h-[150px] resize-none"
                      autoFocus
                    />
                    <div className="flex justify-end gap-2">
                      <Button variant="ghost" size="sm" onClick={() => setEditingNoteId(null)}>
                        <X className="mr-2 h-4 w-4" /> Cancel
                      </Button>
                      <Button size="sm" onClick={() => handleUpdateNote(note.id)} disabled={isActionLoading || !editContent.trim()}>
                        {isActionLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        <Save className="mr-2 h-4 w-4" /> Save
                      </Button>
                    </div>
                  </div>
                ) : (
                  <p className="whitespace-pre-wrap leading-relaxed">
                    {note.content}
                  </p>
                )}
              </CardContent>
            </Card>
          ))
        )}
      </div>

      <MasterPasswordDialog {...passwordDialogProps} />
    </div>
  );
}
