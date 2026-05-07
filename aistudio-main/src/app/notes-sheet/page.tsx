import { NoteManager } from "@/components/note-manager";

export default function NotesPage() {
  return (
    <div className="container py-8 max-w-7xl mx-auto space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight mb-2">Notes</h1>
        <p className="text-muted-foreground">
          Store and manage your personal notes here. These notes are backed by your Google Sheet under the "Notes" tab.
        </p>
      </div>
      
      <NoteManager />
    </div>
  );
}
