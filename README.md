# Ai Studio Mermaid diagram
graph TB
    subgraph "Frontend Layer" 
        UI["React UI Components<br/>Radix UI + TailwindCSS"]
        Pages["Multi-Page App<br/>NextJS App Router"]
        Hooks["Custom Hooks<br/>State Management"]
    end
    
    subgraph "Application Features"
        Dashboard["Dashboard<br/>Expense tracking & budgets"]
        ExpenseOps["Expense Operations<br/>Add/Edit/Delete/Export"]
        Categories["Category Management<br/>Custom categories & budgets"]
        Notes["Scratch Notes<br/>Quick note-taking"]
        ImportantDates["Important Dates<br/>Event tracking"]
        Utils["Stock Tools<br/>Calculators & analyzers"]
    end
    
    subgraph "API/Business Logic Layer"
        SheetOps["Google Sheets Operations<br/>CRUD for all data"]
        SearchEngine["Search Engine<br/>Full expense search"]
        Auth["Authentication<br/>Master password validation"]
        Parsers["Data Parsers<br/>Sheet rows → objects"]
    end
    
    subgraph "External Services"
        GoogleSheets["Google Sheets API<br/>Data persistence"]
        GoogleDocs["Google Docs API<br/>Document content"]
        GoogleAuth["Google Auth<br/>Service account credentials"]
    end
    
    subgraph "Data Models"
        ExpenseModel["Expense<br/>id, date, amount, category<br/>description, paid status"]
        BudgetModel["Budget<br/>category, amount limit"]
        DateModel["ImportantDate<br/>title, date, description<br/>price, shop"]
        NoteModel["Note<br/>content, date"]
    end
    
    UI --> Pages
    UI --> Hooks
    
    Pages --> Dashboard
    Pages --> ExpenseOps
    Pages --> Categories
    Pages --> Notes
    Pages --> ImportantDates
    Pages --> Utils
    
    Dashboard --> SheetOps
    ExpenseOps --> SheetOps
    Categories --> SheetOps
    Notes --> SheetOps
    ImportantDates --> SheetOps
    
    SheetOps --> Parsers
    SheetOps --> Auth
    SheetOps --> SearchEngine
    
    ExpenseOps --> ExpenseModel
    Dashboard --> ExpenseModel
    Dashboard --> BudgetModel
    
    ImportantDates --> DateModel
    Notes --> NoteModel
    
    Auth --> GoogleAuth
    SheetOps --> GoogleSheets
    SheetOps --> GoogleDocs
    
    GoogleAuth -.->|Provides credentials| GoogleSheets
    GoogleAuth -.->|Provides credentials| GoogleDocs



    <img width="1437" height="662" alt="image" src="https://github.com/user-attachments/assets/92852534-7ee8-44b8-99e0-e7c2b0feec62" />
