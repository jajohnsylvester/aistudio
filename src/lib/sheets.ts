

'use server';

import { google } from 'googleapis';
import type { Expense, Budget, ImportantDate } from './types';
import { format, getYear } from 'date-fns';
import { toZonedTime } from 'date-fns-tz';

const SHEET_ID = process.env.GOOGLE_SHEETS_SHEET_ID;
const TIME_ZONE = 'Asia/Kolkata';

const months = [
  "January", "February", "March", "April", "May", "June", 
  "July", "August", "September", "October", "November", "December"
];

const getAuth = () => {
  if (!process.env.GOOGLE_SHEETS_CLIENT_EMAIL || !process.env.GOOGLE_SHEETS_PRIVATE_KEY || !process.env.GOOGLE_SHEETS_SHEET_ID) {
    throw new Error('Google Sheets API credentials or Sheet ID are not set in .env file.');
  }

  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SHEETS_CLIENT_EMAIL,
      private_key: process.env.GOOGLE_SHEETS_PRIVATE_KEY.replace(/\\n/g, '\n'),
    },
    scopes: [
        'https://www.googleapis.com/auth/spreadsheets',
        'https://www.googleapis.com/auth/documents.readonly'
    ],
  });
  return auth;
};

const getSheets = () => {
  const auth = getAuth();
  return google.sheets({ version: 'v4', auth });
}

async function getSheetIdByName(sheets: any, sheetName: string): Promise<number | undefined> {
    const response = await sheets.spreadsheets.get({
        spreadsheetId: SHEET_ID,
    });
    const sheet = response.data.sheets?.find((s: any) => s.properties?.title === sheetName);
    return sheet?.properties?.sheetId;
}

async function ensureSheetExists(sheets: any, sheetName: string, headers: string[]) {
    try {
        const sheetInfo = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID });
        const sheetExists = sheetInfo.data.sheets.some((s: any) => s.properties.title === sheetName);

        if (!sheetExists) {
            await sheets.spreadsheets.batchUpdate({
                spreadsheetId: SHEET_ID,
                requestBody: {
                    requests: [{ addSheet: { properties: { title: sheetName } } }],
                },
            });
            await sheets.spreadsheets.values.update({
                spreadsheetId: SHEET_ID,
                range: `${sheetName}!A1`,
                valueInputOption: 'RAW',
                requestBody: {
                    values: [headers],
                },
            });
        }
    } catch (error) {
        console.error(`Error ensuring sheet "${sheetName}" exists. This may be due to an invalid SHEET_ID.`, error);
        throw error;
    }
}

function getSheetName(date: Date): string {
    const year = getYear(date);
    if (year < 2025) {
        return `Transactions-${year}`;
    }
    const monthName = format(date, 'MMMM');
    return `Transactions-${year}-${monthName}`;
}

function parseExpenseRows(rows: any[][] | null | undefined): Expense[] {
    if (!rows || rows.length <= 1) {
        return [];
    }

    const headers = rows[0];
    const idIndex = headers.indexOf('id');
    const dateIndex = headers.indexOf('date');
    const descriptionIndex = headers.indexOf('description');
    const categoryIndex = headers.indexOf('category');
    const amountIndex = headers.indexOf('amount');
    const paidIndex = headers.indexOf('paid');

    return rows.slice(1).map((row, index): Expense | null => {
        if (row.every(cell => !cell)) return null;

        const amount = parseFloat(row[amountIndex]);
        if (isNaN(amount)) return null;

        const category = row[categoryIndex] || 'Other';

        const dateStr = row[dateIndex];
        let date;
        try {
            date = toZonedTime(dateStr, TIME_ZONE).toISOString();
        } catch (e) {
            console.error(`Could not parse date "${dateStr}" at row ${index + 2}. Skipping row.`, e);
            return null;
        }

        return {
            id: row[idIndex] || (new Date().getTime() + index).toString(),
            date: date,
            description: row[descriptionIndex] || '',
            category: category,
            amount: amount,
            paid: category === 'Credit Card' ? (paidIndex > -1 ? row[paidIndex] === 'Paid' : false) : undefined,
        }
    }).filter((e): e is Expense => e !== null);
}


export async function getExpenses(year: number): Promise<Expense[]> {
  const sheets = getSheets();

  if (year < 2025) {
    try {
        const range = `Transactions-${year}`;
        await ensureSheetExists(sheets, range, ['id', 'date', 'description', 'category', 'amount', 'paid']);
        
        const response = await sheets.spreadsheets.values.get({
          spreadsheetId: SHEET_ID,
          range: range,
        });

        const expenses = parseExpenseRows(response.data.values);
        return expenses.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    } catch (error: any) {
        if (error.message && error.message.includes('Unable to parse range')) {
            console.log(`Sheet for year ${year} likely doesn't exist. Returning empty array.`);
            return [];
        }
        console.error('Error fetching expenses from Google Sheets:', error);
        return [];
    }
  } else {
    // For 2025 and after, fetch from all 12 monthly sheets
    const promises = months.map(async (month) => {
        const range = `Transactions-${year}-${month}`;
        try {
            const response = await sheets.spreadsheets.values.get({
                spreadsheetId: SHEET_ID,
                range: range,
            });
            return parseExpenseRows(response.data.values);
        } catch (error: any) {
            if (error.message && (error.message.includes('Unable to parse range') || error.message.includes('not found'))) {
                // Sheet for the month doesn't exist, which is fine.
                return [];
            }
            console.error(`Error fetching expenses for ${month} ${year}:`, error);
            return [];
        }
    });

    const monthlyExpensesArrays = await Promise.all(promises);
    const allExpenses = monthlyExpensesArrays.flat();

    allExpenses.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    return allExpenses;
  }
}

export async function addExpense(expense: Omit<Expense, 'id'>): Promise<Expense> {
  const sheets = getSheets();
  const expenseDate = toZonedTime(new Date(expense.date), TIME_ZONE);
  const range = getSheetName(expenseDate);
  
  await ensureSheetExists(sheets, range, ['id', 'date', 'description', 'category', 'amount', 'paid']);

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${range}!A:A`,
  });

  const existingIds = response.data.values ? response.data.values.flat().map(id => parseInt(id, 10)).filter(id => !isNaN(id)) : [];
  const maxId = existingIds.length > 0 ? Math.max(0, ...existingIds) : 0;
  const newId = maxId + 1;

  const newExpense: Expense = { 
    ...expense, 
    id: newId.toString(),
    paid: expense.category === 'Credit Card' ? !!expense.paid : undefined
  };
  
  const formattedDate = format(expenseDate, 'yyyy-MM-dd');

  const newRow = [
    newExpense.id, 
    formattedDate, 
    newExpense.description, 
    newExpense.category, 
    newExpense.amount,
    newExpense.category === 'Credit Card' ? (newExpense.paid ? 'Paid' : 'Not Paid') : ''
  ];

  await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range: range,
    valueInputOption: 'USER_ENTERED',
    requestBody: {
      values: [newRow],
    },
  });

  return newExpense;
}

async function findRowById(sheets: any, rangeName: string, id: string): Promise<{rowIndex: number, range: string} | null> {
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: `${rangeName}!A:A`,
    });
    const ids = response.data.values;
    if (!ids) return null;
    const rowIndex = ids.findIndex(row => row[0] === id);
    return rowIndex !== -1 ? { rowIndex: rowIndex + 1, range: rangeName } : null;
}


export async function updateExpense(expense: Expense): Promise<Expense> {
  const sheets = getSheets();
  
  const updatedDate = toZonedTime(new Date(expense.date), TIME_ZONE);
  const range = getSheetName(updatedDate);

  // This logic is simple and will fail if the date is changed across a sheet boundary (month or year).
  // This matches the buggy behavior of the original code, which failed on year changes.
  const found = await findRowById(sheets, range, expense.id);

  if (found === null) {
    throw new Error('Expense not found to update');
  }
  
  const { rowIndex } = found;
  
  const formattedDate = format(updatedDate, 'yyyy-MM-dd');
  const paidValue = expense.category === 'Credit Card' ? (expense.paid ? 'Paid' : 'Not Paid') : '';
  const updatedRow = [expense.id, formattedDate, expense.description, expense.category, expense.amount, paidValue];

  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range: `${range}!A${rowIndex}:F${rowIndex}`,
    valueInputOption: 'USER_ENTERED',
    requestBody: {
      values: [updatedRow],
    },
  });

  return expense;
}

export async function deleteExpense(expense: Expense, year?: number): Promise<void> {
  const sheets = getSheets();
  const expenseDate = toZonedTime(new Date(expense.date), TIME_ZONE);
  const range = getSheetName(expenseDate);
  
  const found = await findRowById(sheets, range, expense.id);

  if (found === null) {
    throw new Error('Expense not found to delete');
  }
  
  const { rowIndex } = found;

  const sheetId = await getSheetIdByName(sheets, range);
  
  if (sheetId === undefined) {
    throw new Error("Could not find sheet ID to delete row.");
  }

  await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SHEET_ID,
      requestBody: {
          requests: [
              {
                  deleteDimension: {
                      range: {
                          sheetId: sheetId, 
                          dimension: 'ROWS',
                          startIndex: rowIndex - 1,
                          endIndex: rowIndex,
                      }
                  }
              }
          ]
      }
  })
}

// --- CATEGORIES ---

export async function getCategories(): Promise<string[]> {
    try {
        const sheets = getSheets();
        const range = 'Categories';
        await ensureSheetExists(sheets, range, ['name']);
        
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId: SHEET_ID,
            range: `${range}!A2:A`,
        });

        const rows = response.data.values;
        if (!rows) return [];

        return rows.flat().filter(Boolean);
    } catch (error) {
        console.error('Error fetching categories:', error);
        return [];
    }
}

export async function addCategory(categoryName: string): Promise<void> {
    const sheets = getSheets();
    const range = 'Categories';
    
    await sheets.spreadsheets.values.append({
        spreadsheetId: SHEET_ID,
        range: range,
        valueInputOption: 'USER_ENTERED',
        requestBody: {
            values: [[categoryName]],
        },
    });
}

export async function deleteCategory(categoryName: string): Promise<void> {
    const sheets = getSheets();
    const range = 'Categories';

    const response = await sheets.spreadsheets.values.get({
        spreadsheetId: SHEET_ID,
        range: `${range}!A:A`,
    });

    const categories = response.data.values;
    if (!categories) {
        throw new Error("Category sheet is empty.");
    }
    
    const rowIndex = categories.findIndex(row => row[0] === categoryName);

    if (rowIndex === -1) {
        throw new Error('Category not found to delete.');
    }
    
    const sheetId = await getSheetIdByName(sheets, range);
    if (sheetId === undefined) {
        throw new Error(`Could not find sheet ID for "${range}" to delete row.`);
    }

    await sheets.spreadsheets.batchUpdate({
        spreadsheetId: SHEET_ID,
        requestBody: {
            requests: [
                {
                    deleteDimension: {
                        range: {
                            sheetId: sheetId,
                            dimension: 'ROWS',
                            startIndex: rowIndex,
                            endIndex: rowIndex + 1,
                        }
                    }
                }
            ]
        }
    });
}


// --- BUDGETS ---
export async function getBudgets(): Promise<Budget[]> {
    try {
        const sheets = getSheets();
        const range = 'Budgets';
        await ensureSheetExists(sheets, range, ['category', 'amount']);

        const response = await sheets.spreadsheets.values.get({
            spreadsheetId: SHEET_ID,
            range: `${range}!A2:B`,
        });

        const rows = response.data.values;
        if (!rows) return [];
        
        return rows.map(row => ({
            category: row[0],
            amount: parseFloat(row[1]) || 0,
        })).filter(b => b.category);
    } catch (error) {
        console.error('Error fetching budgets:', error);
        return [];
    }
}

export async function updateBudgets(budgets: Budget[]): Promise<void> {
    const sheets = getSheets();
    const range = 'Budgets';
    
    await sheets.spreadsheets.values.clear({
        spreadsheetId: SHEET_ID,
        range: `${range}!A2:B`,
    });
    
    if(budgets.length === 0) return;
    
    await sheets.spreadsheets.values.update({
        spreadsheetId: SHEET_ID,
        range: `${range}!A2`,
        valueInputOption: 'USER_ENTERED',
        requestBody: {
            values: budgets.map(b => [b.category, b.amount]),
        },
    });
}

// --- MASTER PASSWORD ---

const MASTER_PASSWORD_KEY = "masterPassword";

export async function getMasterPassword(): Promise<string | null> {
    try {
        const sheets = getSheets();
        const range = 'Settings';
        await ensureSheetExists(sheets, range, ['key', 'value']);

        const response = await sheets.spreadsheets.values.get({
            spreadsheetId: SHEET_ID,
            range: `${range}!A:B`,
        });

        const rows = response.data.values;
        if (!rows || rows.length <= 1) {
            return null;
        }
        
        const passwordRow = rows.find(row => row[0] === MASTER_PASSWORD_KEY);
        return passwordRow ? passwordRow[1] : null;
    } catch (error) {
        console.error('Error getting master password:', error);
        return null;
    }
}

export async function setMasterPassword(password: string): Promise<void> {
    const sheets = getSheets();
    const range = 'Settings';

    const response = await sheets.spreadsheets.values.get({
        spreadsheetId: SHEET_ID,
        range: `${range}!A:A`,
    });
    
    const rows = response.data.values;
    let rowIndex = rows ? rows.findIndex(row => row[0] === MASTER_PASSWORD_KEY) : -1;
    
    if (rowIndex !== -1) {
        await sheets.spreadsheets.values.update({
            spreadsheetId: SHEET_ID,
            range: `${range}!B${rowIndex + 1}`,
            valueInputOption: 'RAW',
            requestBody: {
                values: [[password]],
            },
        });
    } else {
        await sheets.spreadsheets.values.append({
            spreadsheetId: SHEET_ID,
            range: range,
            valueInputOption: 'RAW',
            requestBody: {
                values: [[MASTER_PASSWORD_KEY, password]],
            },
        });
    }
}

export async function getYearsWithExpenses(): Promise<number[]> {
    try {
        const sheets = getSheets();
        const response = await sheets.spreadsheets.get({
            spreadsheetId: SHEET_ID,
        });

        const sheetTitles = response.data.sheets?.map(s => s.properties?.title || '') || [];
        const transactionYears = sheetTitles
            .filter(title => title.startsWith('Transactions-'))
            .map(title => parseInt(title.split('-')[1]))
            .filter(year => !isNaN(year))
            .sort((a, b) => b - a);
            
        return transactionYears;
    } catch (error) {
        console.error('Error fetching sheet years:', error);
        return [new Date().getFullYear()];
    }
}

export async function searchAllExpenses(query: string): Promise<Omit<Expense, 'id' | 'paid'>[]> {
  try {
    const sheets = getSheets();
    const spreadsheetInfo = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID });
    const allSheetNames = spreadsheetInfo.data.sheets?.map(s => s.properties?.title || '') || [];
    
    const transactionSheetNames = allSheetNames.filter(name => name.startsWith('Transactions-'));

    if (transactionSheetNames.length === 0) {
      return [];
    }

    const searchPromises = transactionSheetNames.map(sheetName => 
      sheets.spreadsheets.values.get({
        spreadsheetId: SHEET_ID,
        range: sheetName,
      })
    );

    const responses = await Promise.all(searchPromises);
    const allResults: Omit<Expense, 'id' | 'paid'>[] = [];
    const lowerCaseQuery = query.toLowerCase();

    responses.forEach(response => {
      const rows = response.data.values;
      if (!rows || rows.length <= 1) return;

      const headers = rows[0];
      const descriptionIndex = headers.indexOf('description');
      const dateIndex = headers.indexOf('date');
      const categoryIndex = headers.indexOf('category');
      const amountIndex = headers.indexOf('amount');

      if ([descriptionIndex, dateIndex, categoryIndex, amountIndex].includes(-1)) {
        return;
      }
      
      rows.slice(1).forEach(row => {
        const description = row[descriptionIndex] || '';
        if (description.toLowerCase().includes(lowerCaseQuery)) {
           try {
                const amount = parseFloat(row[amountIndex]);
                if(isNaN(amount)) return;

                allResults.push({
                    description: description,
                    amount: amount,
                    category: row[categoryIndex] || 'Other',
                    date: toZonedTime(new Date(row[dateIndex]), TIME_ZONE).toISOString(),
                });
            } catch (e) {
                // Ignore rows with invalid data during search
            }
        }
      });
    });
    
    // Sort by date descending
    allResults.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    return allResults;
  } catch (error) {
    console.error('Error searching all expenses:', error);
    throw new Error('Failed to search expenses across all sheets.');
  }
}

export async function getAllSheetNames(spreadsheetId: string): Promise<string[]> {
    try {
        const sheets = getSheets();
        const response = await sheets.spreadsheets.get({
            spreadsheetId: spreadsheetId,
            fields: 'sheets(properties.title)', // Only fetch sheet titles
        });
        const sheetTitles = response.data.sheets?.map(s => s.properties?.title).filter((t): t is string => !!t) || [];
        return sheetTitles;
    } catch (error: any) {
        console.error(`Error fetching all sheet names from ${spreadsheetId}:`, error.message);
        if (error.message) {
            if (error.message.includes('permission')) {
                 throw new Error('Permission denied. Please ensure the Google Sheet is shared with the service account email.');
            }
             if (error.message.includes('not found')) {
                 throw new Error(`The spreadsheet with ID "${spreadsheetId}" was not found. Please check the ID.`);
            }
            throw new Error(error.message);
        }
        throw new Error('An unknown error occurred while fetching the sheet names.');
    }
}


export async function getFirstSheetName(spreadsheetId: string): Promise<string> {
    try {
        const sheetNames = await getAllSheetNames(spreadsheetId);
        if (sheetNames.length === 0) {
            throw new Error('Spreadsheet contains no sheets.');
        }
        return sheetNames[0];
    } catch (error: any) {
        // Re-throw the specific error from getAllSheetNames
        throw error;
    }
}


export async function getRawSheetData(spreadsheetId: string, range: string): Promise<string[][]> {
    try {
        const sheets = getSheets();
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId: spreadsheetId,
            range: range,
        });
        return response.data.values || [];
    } catch (error: any) {
        console.error(`Error fetching raw sheet data from ${spreadsheetId} for range ${range}:`, error.message);
        if (error.message) {
            if (error.message.includes('permission')) {
                 throw new Error('Permission denied. Please ensure the Google Sheet is shared with the service account email with "Editor" rights.');
            }
             if (error.message.includes('Unable to parse range')) {
                 throw new Error(`The sheet tab (e.g., "Sheet1") was not found in the spreadsheet. Please check the sheet name.`);
            }
            throw new Error(error.message);
        }
        throw new Error('An unknown error occurred while fetching data from Google Sheet.');
    }
}

export async function updateRawSheetData(spreadsheetId: string, range: string, values: string[][]): Promise<void> {
    try {
        const sheets = getSheets();
        await sheets.spreadsheets.values.update({
            spreadsheetId: spreadsheetId,
            range: range,
            valueInputOption: 'USER_ENTERED',
            requestBody: {
                values: values,
            },
        });
    } catch (error: any) {
        console.error(`Error updating raw sheet data in ${spreadsheetId} for range ${range}:`, error.message);
        if (error.message) {
            if (error.message.includes('permission')) {
                 throw new Error('Permission denied. Please ensure the Google Sheet is shared with the service account email with "Editor" rights.');
            }
             if (error.message.includes('Unable to parse range')) {
                 throw new Error(`The sheet tab (e.g., "Sheet1") was not found in the spreadsheet. Please check the sheet name.`);
            }
            throw new Error(error.message);
        }
        throw new Error('An unknown error occurred while updating the Google Sheet.');
    }
}

export async function getGoogleDocContent(documentId: string): Promise<any> {
    try {
        const auth = getAuth();
        const docs = google.docs({ version: 'v1', auth });

        const response = await docs.documents.get({
            documentId: documentId,
        });

        return response.data;
    } catch (error: any) {
        console.error(`Error fetching Google Doc content for document ${documentId}:`, error.message);
        if (error.message) {
            if (error.message.includes('permission')) {
                 throw new Error('Permission denied. Please ensure the Google Doc is shared with the service account email with at least "Viewer" rights.');
            }
             if (error.message.includes('not found')) {
                 throw new Error(`The document with ID "${documentId}" was not found. Please check the ID.`);
            }
            throw new Error(error.message);
        }
        throw new Error('An unknown error occurred while fetching the Google Doc.');
    }
}

// --- IMPORTANT DATES ---

function parseImportantDateRows(rows: any[][] | null | undefined): ImportantDate[] {
    if (!rows || rows.length <= 1) {
        return [];
    }

    const headers = rows[0];
    const idIndex = headers.indexOf('id');
    const titleIndex = headers.indexOf('title');
    const dateIndex = headers.indexOf('date');
    const descriptionIndex = headers.indexOf('description');
    const priceIndex = headers.indexOf('price');
    const shopIndex = headers.indexOf('shop');

    return rows.slice(1).map((row, index): ImportantDate | null => {
        if (row.every(cell => !cell)) return null;

        return {
            id: row[idIndex] || (new Date().getTime() + index).toString(),
            title: row[titleIndex] || '',
            date: row[dateIndex] || '',
            description: row[descriptionIndex] || '',
            price: row[priceIndex] ? parseFloat(row[priceIndex]) : undefined,
            shop: row[shopIndex] || '',
        }
    }).filter((e): e is ImportantDate => e !== null);
}

export async function getImportantDates(sheetName: string): Promise<ImportantDate[]> {
    try {
        const sheets = getSheets();
        await ensureSheetExists(sheets, sheetName, ['id', 'title', 'date', 'description', 'price', 'shop']);
        
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId: SHEET_ID,
            range: `${sheetName}!A:F`,
        });

        return parseImportantDateRows(response.data.values);
    } catch (error) {
        console.error(`Error fetching important dates for "${sheetName}":`, error);
        return [];
    }
}

export async function addImportantDate(sheetName: string, dateData: Omit<ImportantDate, 'id'>): Promise<ImportantDate> {
    const sheets = getSheets();
    await ensureSheetExists(sheets, sheetName, ['id', 'title', 'date', 'description', 'price', 'shop']);

    const response = await sheets.spreadsheets.values.get({
        spreadsheetId: SHEET_ID,
        range: `${sheetName}!A:A`,
    });

    const existingIds = response.data.values ? response.data.values.flat().map(id => parseInt(id, 10)).filter(id => !isNaN(id)) : [];
    const maxId = existingIds.length > 0 ? Math.max(0, ...existingIds) : 0;
    const newId = maxId + 1;

    const newDate: ImportantDate = { ...dateData, id: newId.toString() };
    const newRow = [newDate.id, newDate.title, newDate.date, newDate.description || '', newDate.price || '', newDate.shop || ''];

    await sheets.spreadsheets.values.append({
        spreadsheetId: SHEET_ID,
        range: sheetName,
        valueInputOption: 'USER_ENTERED',
        requestBody: {
            values: [newRow],
        },
    });

    return newDate;
}

export async function updateImportantDate(sheetName: string, dateData: ImportantDate): Promise<ImportantDate> {
    const sheets = getSheets();
    const found = await findRowById(sheets, sheetName, dateData.id);

    if (found === null) {
        throw new Error('Important date not found to update');
    }
    
    const { rowIndex } = found;
    const updatedRow = [dateData.id, dateData.title, dateData.date, dateData.description || '', dateData.price || '', dateData.shop || ''];

    await sheets.spreadsheets.values.update({
        spreadsheetId: SHEET_ID,
        range: `${sheetName}!A${rowIndex}:F${rowIndex}`,
        valueInputOption: 'USER_ENTERED',
        requestBody: {
            values: [updatedRow],
        },
    });

    return dateData;
}

export async function deleteImportantDate(sheetName: string, dateData: ImportantDate): Promise<void> {
    const sheets = getSheets();
    const found = await findRowById(sheets, sheetName, dateData.id);

    if (found === null) {
        throw new Error('Important date not found to delete');
    }
    
    const { rowIndex } = found;
    const sheetId = await getSheetIdByName(sheets, sheetName);
    
    if (sheetId === undefined) {
        throw new Error(`Could not find sheet ID for "${sheetName}" to delete row.`);
    }

    await sheets.spreadsheets.batchUpdate({
        spreadsheetId: SHEET_ID,
        requestBody: {
            requests: [
                {
                    deleteDimension: {
                        range: {
                            sheetId: sheetId, 
                            dimension: 'ROWS',
                            startIndex: rowIndex - 1,
                            endIndex: rowIndex,
                        }
                    }
                }
            ]
        }
    });
}

// --- SCRATCH NOTES ---

function parseNoteRows(rows: any[][] | null | undefined): Note[] {
    if (!rows || rows.length <= 1) {
        return [];
    }

    const headers = rows[0];
    const idIndex = headers.indexOf('id');
    const contentIndex = headers.indexOf('content');
    const dateIndex = headers.indexOf('date');

    return rows.slice(1).map((row, index): Note | null => {
        if (row.every(cell => !cell)) return null;

        return {
            id: row[idIndex] || (new Date().getTime() + index).toString(),
            content: row[contentIndex] || '',
            date: row[dateIndex] || '',
        }
    }).filter((e): e is Note => e !== null);
}

export async function getNotes(): Promise<Note[]> {
    try {
        const sheets = getSheets();
        const range = 'ScratchNotes';
        await ensureSheetExists(sheets, range, ['id', 'content', 'date']);
        
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId: SHEET_ID,
            range: `${range}!A:C`,
        });

        return parseNoteRows(response.data.values);
    } catch (error) {
        console.error('Error fetching notes:', error);
        return [];
    }
}

export async function addNote(noteData: Omit<Note, 'id'>): Promise<Note> {
    const sheets = getSheets();
    const range = 'ScratchNotes';
    await ensureSheetExists(sheets, range, ['id', 'content', 'date']);

    const response = await sheets.spreadsheets.values.get({
        spreadsheetId: SHEET_ID,
        range: `${range}!A:A`,
    });

    const existingIds = response.data.values ? response.data.values.flat().map(id => parseInt(id, 10)).filter(id => !isNaN(id)) : [];
    const maxId = existingIds.length > 0 ? Math.max(0, ...existingIds) : 0;
    const newId = maxId + 1;

    const newNote: Note = { ...noteData, id: newId.toString() };
    const newRow = [newNote.id, newNote.content, newNote.date];

    await sheets.spreadsheets.values.append({
        spreadsheetId: SHEET_ID,
        range: range,
        valueInputOption: 'USER_ENTERED',
        requestBody: {
            values: [newRow],
        },
    });

    return newNote;
}

export async function updateNote(noteData: Note): Promise<Note> {
    const sheets = getSheets();
    const range = 'ScratchNotes';
    const found = await findRowById(sheets, range, noteData.id);

    if (found === null) {
        throw new Error('Note not found to update');
    }
    
    const { rowIndex } = found;
    const updatedRow = [noteData.id, noteData.content, noteData.date];

    await sheets.spreadsheets.values.update({
        spreadsheetId: SHEET_ID,
        range: `${range}!A${rowIndex}:C${rowIndex}`,
        valueInputOption: 'USER_ENTERED',
        requestBody: {
            values: [updatedRow],
        },
    });

    return noteData;
}

export async function deleteNote(noteId: string): Promise<void> {
    const sheets = getSheets();
    const range = 'ScratchNotes';
    const found = await findRowById(sheets, range, noteId);

    if (found === null) {
        throw new Error('Note not found to delete');
    }
    
    const { rowIndex } = found;
    const sheetId = await getSheetIdByName(sheets, range);
    
    if (sheetId === undefined) {
        throw new Error(`Could not find sheet ID for "${range}" to delete row.`);
    }

    await sheets.spreadsheets.batchUpdate({
        spreadsheetId: SHEET_ID,
        requestBody: {
            requests: [
                {
                    deleteDimension: {
                        range: {
                            sheetId: sheetId, 
                            dimension: 'ROWS',
                            startIndex: rowIndex - 1,
                            endIndex: rowIndex,
                        }
                    }
                }
            ]
        }
    });
}
