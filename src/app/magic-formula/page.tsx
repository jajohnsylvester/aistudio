'use client';

import { useState, useEffect, useCallback } from 'react';
import { getRawSheetData, updateRawSheetData, getAllSheetNames } from '@/lib/sheets';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableRow, TableHead, TableHeader } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Loader2, Save, PlusCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

// Configuration for the sheet
const SPREADSHEET_ID = '18sADTBE7eRsSC1NtPoihN3eg5MhW_nKZv09AaOztnz8';
const PAGE_TITLE = 'Magic formula Sheet';

export default function MagicFormulaPage() {
  const [gridData, setGridData] = useState<string[][]>([]);
  const [isDataLoading, setIsDataLoading] = useState(false);
  const [areSheetsLoading, setAreSheetsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const { toast } = useToast();
  const [sheetNames, setSheetNames] = useState<string[]>([]);
  const [activeSheetName, setActiveSheetName] = useState<string>('');

  useEffect(() => {
    async function fetchSheetNames() {
      setAreSheetsLoading(true);
      try {
        const names = await getAllSheetNames(SPREADSHEET_ID);
        if (names && names.length > 0) {
          setSheetNames(names);
          setActiveSheetName(names[0]);
        } else {
          toast({
            variant: 'destructive',
            title: 'No Sheets Found',
            description: 'The spreadsheet is empty or could not be accessed.',
          });
        }
      } catch (error: any) {
        toast({
          variant: 'destructive',
          title: 'Failed to load sheet tabs',
          description: error.message,
        });
      } finally {
        setAreSheetsLoading(false);
      }
    }
    fetchSheetNames();
  }, [toast]);

  const fetchData = useCallback(async () => {
    if (!activeSheetName) return;
    setIsDataLoading(true);
    try {
      const sheetRange = `${activeSheetName}!A1:Z100`;
      const data = await getRawSheetData(SPREADSHEET_ID, sheetRange);
      
      const numRows = Math.max(data.length, 20); // ensure at least 20 rows
      const numCols = Math.max(data[0]?.length || 0, 10); // ensure at least 10 columns

      const paddedData = Array.from({ length: numRows }, (_, r) => 
          Array.from({ length: numCols }, (_, c) => data[r]?.[c] || '')
      );

      setGridData(paddedData);
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Failed to load sheet data',
        description: error.message || 'Could not fetch data. Check sheet permissions.',
      });
      // Initialize with an empty grid on error
      setGridData(Array.from({ length: 20 }, () => Array.from({ length: 10 }, () => '')));
    } finally {
      setIsDataLoading(false);
    }
  }, [toast, activeSheetName]);

  useEffect(() => {
    if(activeSheetName) {
      fetchData();
    }
  }, [fetchData, activeSheetName]);

  const handleCellChange = (rowIndex: number, colIndex: number, value: string) => {
    const newData = gridData.map(row => [...row]);
    newData[rowIndex][colIndex] = value;
    setGridData(newData);
  };

  const handleSave = async () => {
    if (!activeSheetName) {
        toast({ variant: 'destructive', title: 'Cannot Save', description: 'No active sheet selected.' });
        return;
    }
    
    setIsSaving(true);
    let maxRow = -1;
    let maxCol = -1;
    gridData.forEach((row, rIdx) => {
        row.forEach((cell, cIdx) => {
            if (cell && cell.trim() !== '') {
                maxRow = Math.max(maxRow, rIdx);
                maxCol = Math.max(maxCol, cIdx);
            }
        });
    });

    if (maxRow === -1 || maxCol === -1) {
        const saveRange = `${activeSheetName}!A1`;
         try {
            await updateRawSheetData(SPREADSHEET_ID, saveRange, [['']]); // Clear the sheet
            toast({ title: 'Sheet Cleared', description: 'Your changes have been saved.' });
            fetchData();
        } catch (error: any) {
            toast({ variant: 'destructive', title: 'Failed to save', description: error.message });
        } finally {
            setIsSaving(false);
        }
        return;
    }
    
    const dataToSave = gridData.slice(0, maxRow + 1).map(row => row.slice(0, maxCol + 1));
    const saveRange = `${activeSheetName}!A1`;

    try {
      await updateRawSheetData(SPREADSHEET_ID, saveRange, dataToSave);
      toast({
        title: 'Sheet Saved',
        description: 'Your changes have been saved to Google Sheets.',
      });
      fetchData();
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Failed to save data',
        description: error.message,
      });
    } finally {
      setIsSaving(false);
    }
  };
  
  const addRow = () => {
      const numCols = gridData[0]?.length || 10;
      setGridData([...gridData, Array(numCols).fill('')]);
  }
  
  const addColumn = () => {
      setGridData(gridData.map(row => [...row, '']));
  }

  const isLoading = areSheetsLoading || isDataLoading;

  if (isLoading && sheetNames.length === 0) {
    return (
      <div className="flex justify-center items-center h-[80vh]">
        <Loader2 className="h-16 w-16 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
       <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4">
            <div>
                <CardTitle>{PAGE_TITLE}</CardTitle>
                <CardDescription>
                    Custom sheet editor. Your changes will be saved to the Google Sheet.
                </CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
                <Button onClick={addRow} variant="outline"><PlusCircle className="mr-2 h-4 w-4" /> Add Row</Button>
                <Button onClick={addColumn} variant="outline"><PlusCircle className="mr-2 h-4 w-4" /> Add Column</Button>
                <Button onClick={handleSave} disabled={isSaving}>
                    {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                    {isSaving ? 'Saving...' : 'Save Changes'}
                </Button>
            </div>
        </CardHeader>
        <CardContent>
            {sheetNames.length > 1 && (
                <Tabs value={activeSheetName} onValueChange={setActiveSheetName} className="mb-4">
                    <TabsList>
                        {sheetNames.map((name) => (
                            <TabsTrigger key={name} value={name}>{name}</TabsTrigger>
                        ))}
                    </TabsList>
                </Tabs>
            )}
            
            {isDataLoading ? (
              <div className="flex justify-center items-center h-64">
                <Loader2 className="h-12 w-12 animate-spin text-primary" />
              </div>
            ) : (
              <div className="overflow-x-auto border rounded-lg">
                  <Table className="w-auto min-w-full">
                      <TableHeader>
                          <TableRow className="bg-muted/50 hover:bg-muted/50">
                              {gridData[0]?.map((_, colIndex) => (
                                  <TableHead key={colIndex} className="p-2 text-center font-semibold">
                                      {String.fromCharCode(65 + colIndex)}
                                  </TableHead>
                              ))}
                          </TableRow>
                      </TableHeader>
                      <TableBody>
                          {gridData.map((row, rowIndex) => (
                              <TableRow key={rowIndex}>
                                  {row.map((cell, colIndex) => (
                                      <TableCell key={colIndex} className="p-0 border-r last:border-r-0">
                                          <Input
                                              value={cell}
                                              onChange={(e) => handleCellChange(rowIndex, colIndex, e.target.value)}
                                              className="w-full h-10 rounded-none border-0 border-t focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-primary"
                                          />
                                      </TableCell>
                                  ))}
                              </TableRow>
                          ))}
                      </TableBody>
                  </Table>
              </div>
            )}
        </CardContent>
       </Card>
    </div>
  );
}
