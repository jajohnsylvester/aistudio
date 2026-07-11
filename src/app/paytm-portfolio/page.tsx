'use client';

import { useState, useEffect, useCallback, Suspense, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import {
  Loader2, RefreshCw, AlertCircle, CheckCircle, Lightbulb, ExternalLink, Key,
  RefreshCcw, Server, Bot, Clock, Laptop, Fingerprint, Timer, Play, ChevronDown, ChevronUp, ArrowUpDown, Plus, Save, Trash2
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { ScrollArea } from '@/components/ui/scroll-area';

interface MCPStatus {
  connected: boolean;
  hasAccessToken: boolean;
  tokenExpired?: boolean;
  apiKeyConfigured: boolean;
  secretConfigured: boolean;
  serverTimestamp?: string;
  jwtMeta?: any;
  refreshIntervalSeconds?: number;
}

interface Holding {
  trading_symbol: string;
  exchange: string;
  quantity: number;
  average_price: number;
  last_price: number;
  pnl: number;
  pnl_percent: number;
  current_value: number;
  investment_value: number;
  sector: string;
}

interface PortfolioData {
  totalInvestment: number;
  totalCurrentValue: number;
  totalPnl: number;
  totalPnlPercent: number;
  holdings: Holding[];
  agentModel?: string;
  lastUpdated: string;
  paytmApiTimestamp?: string;
}

interface CategoryData {
  name: string;
  allocatedHoldings: { symbol: string; units: number }[];
  geminiInsightsEnabled: boolean;
  insightsText?: string;
  isAnalyzing?: boolean;
}

function StatusIndicator({ ok, label, subtext }: { ok: boolean | undefined; label: string; subtext: string }) {
  return (
    <div className="flex items-center gap-3">
      {ok ? <CheckCircle className="h-5 w-5 text-green-500 flex-shrink-0" /> : <AlertCircle className="h-5 w-5 text-destructive flex-shrink-0" />}
      <div>
        <p className="text-sm font-medium leading-none">{label}</p>
        <p className={`text-xs mt-0.5 ${ok ? 'text-green-600' : 'text-destructive'}`}>{subtext}</p>
      </div>
    </div>
  );
}

export default function PaytmPortfolioPage() {
  return <Suspense fallback={<div className="p-8 text-center"><Loader2 className="animate-spin h-8 w-8 mx-auto" /></div>}><PaytmPortfolioContent /></Suspense>;
}

function PaytmPortfolioContent() {
  const searchParams = useSearchParams();
  const requestToken = searchParams.get('request_token');
  const { toast } = useToast();

  const [status, setStatus] = useState<MCPStatus | null>(null);
  const [portfolio, setPortfolio] = useState<PortfolioData | null>(null);
  const [portfolioError, setPortfolioError] = useState<string | null>(null);
  const [isLoadingStatus, setIsLoadingStatus] = useState(true);
  const [isLoadingPortfolio, setIsLoadingPortfolio] = useState(false);
  const [clientTime, setClientTime] = useState<string>('');

  // Dropdown mapping structures
  const [selectedHoldingSymbol, setSelectedHoldingSymbol] = useState<Record<string, string>>({});
  const [holdingUnits, setHoldingUnits] = useState<Record<string, string>>({});

  // Dynamic Framework Categories Container
  const [categories, setCategories] = useState<CategoryData[]>([
    { name: 'Coffee Can Portfolio', allocatedHoldings: [], geminiInsightsEnabled: false },
    { name: 'Magic Formula Joel GreenBlatt', allocatedHoldings: [], geminiInsightsEnabled: false },
    { name: 'Prasenjit Paul', allocatedHoldings: [], geminiInsightsEnabled: false }
  ]);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [isSavingToSheets, setIsSavingToSheets] = useState(false);

  // Layout View Controls
  const [isClocksExpanded, setIsClocksExpanded] = useState(false);
  const [isStatusMatrixExpanded, setIsStatusMatrixExpanded] = useState(false);

  useEffect(() => {
    setClientTime(new Date().toLocaleString());
    const timer = setInterval(() => setClientTime(new Date().toLocaleString()), 1000);
    return () => clearInterval(timer);
  }, []);

  const checkStatus = useCallback(async () => {
    setIsLoadingStatus(true);
    try {
      const response = await fetch('/api/paytm-portfolio?action=status');
      const statusData: MCPStatus = await response.json();
      setStatus(statusData);
    } catch {
      toast({ variant: 'destructive', title: 'Status pipeline validation check aborted.' });
    } finally {
      setIsLoadingStatus(false);
    }
  }, [toast]);

  const fetchPortfolio = useCallback(async () => {
    setIsLoadingPortfolio(true);
    setPortfolioError(null);
    try {
      const response = await fetch('/api/paytm-portfolio?action=portfolio');
      const data = await response.json();
      if (data.error) {
        setPortfolioError(data.error);
        setPortfolio(null);
      } else {
        setPortfolio(data);
      }
    } catch (error: any) {
      setPortfolioError(error.message);
    } finally {
      setIsLoadingPortfolio(false);
    }
  }, []);

  useEffect(() => {
    checkStatus();
    fetchPortfolio();
  }, [checkStatus, fetchPortfolio]);

  // Operational Functions for Categories Structure Handling
  const handleAddCategory = () => {
    const formatName = newCategoryName.trim();
    if (!formatName) return;

    if (categories.some(c => c.name.toLowerCase() === formatName.toLowerCase())) {
      toast({ variant: 'destructive', title: 'Operational Abort', description: 'Strategy profile label matches an existing registry.' });
      return;
    }

    setCategories([...categories, { name: formatName, allocatedHoldings: [], geminiInsightsEnabled: false }]);
    setNewCategoryName('');
    toast({ title: 'Category Declared', description: `Registered Strategy Matrix: "${formatName}"` });
  };

  const handleAddHoldingToCategory = (catIndex: number) => {
    const catName = categories[catIndex].name;
    const symbol = selectedHoldingSymbol[catName];
    const unitCount = parseFloat(holdingUnits[catName]);

    if (!symbol || isNaN(unitCount) || unitCount <= 0) {
      toast({ variant: 'destructive', title: 'Validation Fault', description: 'Verify asset assignments and unit allocations are positive values.' });
      return;
    }

    const updated = [...categories];
    const itemIdx = updated[catIndex].allocatedHoldings.findIndex(h => h.symbol === symbol);

    if (itemIdx > -1) {
      updated[catIndex].allocatedHoldings[itemIdx].units += unitCount;
    } else {
      updated[catIndex].allocatedHoldings.push({ symbol, units: unitCount });
    }

    setCategories(updated);
    // Clearing input registers
    setHoldingUnits(prev => ({ ...prev, [catName]: '' }));
    toast({ title: 'Position Appended', description: `Injected ${unitCount} units of ${symbol} into ${catName}.` });
  };

  const handleRemoveHoldingFromCategory = (catIdx: number, holdingIdx: number) => {
    const updated = [...categories];
    updated[catIdx].allocatedHoldings.splice(holdingIdx, 1);
    setCategories(updated);
    toast({ title: 'Allocation Removed', description: 'Purged target investment layer segment configuration.' });
  };

  // Execution Flow for Gemini Insights Matrix Generation
  const handleToggleGeminiInsights = async (catIdx: number, checked: boolean) => {
    const updated = [...categories];
    updated[catIdx].geminiInsightsEnabled = checked;

    if (!checked) {
      updated[catIdx].insightsText = undefined;
      setCategories(updated);
      return;
    }

    if (updated[catIdx].allocatedHoldings.length === 0) {
      toast({ variant: 'destructive', title: 'Context Construction Blocked', description: 'We cannot prompt Gemini on empty portfolio buckets.' });
      updated[catIdx].geminiInsightsEnabled = false;
      setCategories(updated);
      return;
    }

    updated[catIdx].isAnalyzing = true;
    setCategories([...updated]);

    try {
      // Formulate metadata boundaries parsing matching indices values
      const segmentDetails = updated[catIdx].allocatedHoldings.map(ah => {
        const referenceAsset = portfolio?.holdings.find(h => h.trading_symbol === ah.symbol);
        return {
          symbol: ah.symbol,
          allocatedUnits: ah.units,
          sector: referenceAsset?.sector || 'General',
          pnl: referenceAsset ? (referenceAsset.last_price - referenceAsset.average_price) * ah.units : 0
        };
      });

      const response = await fetch('/api/paytm-portfolio?action=category_insights', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ categoryName: updated[catIdx].name, holdings: segmentDetails })
      });

      const data = await response.json();
      const latest = [...categories];
      latest[catIdx].insightsText = data.insights || 'No insight text patterns generated.';
      latest[catIdx].isAnalyzing = false;
      setCategories(latest);
    } catch {
      const fallback = [...categories];
      fallback[catIdx].isAnalyzing = false;
      fallback[catIdx].geminiInsightsEnabled = false;
      setCategories(fallback);
      toast({ variant: 'destructive', title: 'Inference pipeline failure.' });
    }
  };

  // Synchronizing Strategy Arrays to Google Sheets Database Table
  const handleSaveToGoogleSheets = async () => {
    setIsSavingToSheets(true);
    try {
      const flatDataMatrix = categories.flatMap(cat =>
        cat.allocatedHoldings.map(h => ({
          category: cat.name,
          symbol: h.symbol,
          units: h.units
        }))
      );

      const response = await fetch('/api/paytm-portfolio?action=save_sheets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ matrix: flatDataMatrix })
      });

      if (!response.ok) throw new Error('Failed to update spreadsheet data cells.');

      toast({ title: 'Google Sheets Synced', description: 'Holdings allocation and units written successfully to page(1).' });
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Spreadsheet Pipeline Fault', description: err.message });
    } finally {
      setIsSavingToSheets(false);
    }
  };

  return (
    <div className="flex flex-col gap-6 p-4 max-w-7xl mx-auto">
      {/* HEADER CONTROLS ACTIONS */}
      <div className="flex items-center justify-between flex-wrap gap-3 border-b pb-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">Paytm Money Portfolio Terminal</h1>
          <p className="text-muted-foreground text-sm mt-1">Strategic Allocation Management Hub</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="default" className="bg-emerald-600 hover:bg-emerald-700 text-white" onClick={handleSaveToGoogleSheets} disabled={isSavingToSheets}>
            {isSavingToSheets ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />} Save to Sheets
          </Button>
          <Button variant="outline" onClick={() => { checkStatus(); fetchPortfolio(); }} disabled={isLoadingStatus || isLoadingPortfolio}>
            <RefreshCw className="mr-2 h-4 w-4" /> Refresh Feed
          </Button>
        </div>
      </div>

      {/* STRATEGY EXPANSION INITIALIZER CONTROLS */}
      <Card className="border-slate-200 shadow-sm">
        <CardHeader className="pb-4">
          <CardTitle className="text-base font-bold text-slate-800">Initialize Custom Allocation Category</CardTitle>
          <CardDescription>Append structural buckets alongside standard tracking templates</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2 max-w-md">
            <Input 
              placeholder="e.g. Low Beta Dividends, Smallcap Momentum" 
              value={newCategoryName} 
              onChange={(e) => setNewCategoryName(e.target.value)}
            />
            <Button onClick={handleAddCategory} className="flex-shrink-0"><Plus className="h-4 w-4 mr-1" /> Add Strategy</Button>
          </div>
        </CardContent>
      </Card>

      {/* STRATEGIC CATEGORY RENDER VIEWS PANEL */}
      <div className="flex flex-col gap-6">
        {categories.map((category, catIdx) => (
          <Card key={category.name} className="border-slate-200 overflow-hidden shadow-xs">
            <CardHeader className="bg-slate-50/70 flex flex-row items-center justify-between border-b py-3 flex-wrap gap-2">
              <div>
                <CardTitle className="text-md font-bold text-slate-800">{category.name}</CardTitle>
                <CardDescription className="text-xxs">Classified Allocation Sub-segment</CardDescription>
              </div>
              <div className="flex items-center gap-2 bg-white px-3 py-1 border rounded-md shadow-3xs">
                <Switch 
                  id={`gemini-toggle-${catIdx}`} 
                  checked={category.geminiInsightsEnabled} 
                  onCheckedChange={(checked) => handleToggleGeminiInsights(catIdx, checked)}
                />
                <Label htmlFor={`gemini-toggle-${catIdx}`} className="text-xs font-semibold flex items-center gap-1 cursor-pointer text-slate-700">
                  <Bot className="h-3.5 w-3.5 text-indigo-500" /> Gemini Insights
                </Label>
              </div>
            </CardHeader>

            <CardContent className="pt-4">
              {/* Asset Injector Dynamic Inputs Panel */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end bg-slate-50/60 p-3 rounded-lg border mb-4">
                <div>
                  <label className="text-xxs font-bold text-slate-500 block mb-1 uppercase tracking-wide">Select Available Asset</label>
                  <select
                    className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-xs shadow-3xs focus:outline-none focus:ring-1 focus:ring-ring"
                    value={selectedHoldingSymbol[category.name] || ''}
                    onChange={(e) => setSelectedHoldingSymbol(prev => ({ ...prev, [category.name]: e.target.value }))}
                  >
                    <option value="">-- Choose Share --</option>
                    {portfolio?.holdings.map(h => (
                      <option key={h.trading_symbol} value={h.trading_symbol}>{h.trading_symbol} (LTP: ₹{h.last_price})</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xxs font-bold text-slate-500 block mb-1 uppercase tracking-wide">Units (Quantity)</label>
                  <Input 
                    type="number" 
                    placeholder="Allocated asset volume"
                    value={holdingUnits[category.name] || ''}
                    onChange={(e) => setHoldingUnits(prev => ({ ...prev, [category.name]: e.target.value }))}
                  />
                </div>
                <Button variant="outline" onClick={() => handleAddHoldingToCategory(catIdx)} className="w-full bg-white hover:bg-slate-50 text-xs">
                  Allocate Strategy Block
                </Button>
              </div>

              {/* Categorized Allocation Datatable */}
              {category.allocatedHoldings.length > 0 ? (
                <div className="border rounded-md overflow-hidden">
                  <Table>
                    <TableHeader className="bg-slate-50/40">
                      <TableRow>
                        <TableHead className="h-8 text-xxs font-bold uppercase">Symbol</TableHead>
                        <TableHead className="h-8 text-right text-xxs font-bold uppercase">Allocated Units</TableHead>
                        <TableHead className="h-8 text-right text-xxs font-bold uppercase">Current Value</TableHead>
                        <TableHead className="h-8 text-center text-xxs font-bold uppercase">Action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {category.allocatedHoldings.map((h, hIdx) => {
                        const matchingPrice = portfolio?.holdings.find(ph => ph.trading_symbol === h.symbol)?.last_price || 0;
                        return (
                          <TableRow key={h.symbol} className="hover:bg-slate-50/40">
                            <TableCell className="py-2 font-bold text-slate-800">{h.symbol}</TableCell>
                            <TableCell className="py-2 text-right font-mono text-xs">{h.units}</TableCell>
                            <TableCell className="py-2 text-right font-mono text-xs font-semibold">₹{(h.units * matchingPrice).toFixed(2)}</TableCell>
                            <TableCell className="py-2 text-center">
                              <Button variant="ghost" size="icon" className="h-6 w-6 text-red-500 hover:text-red-700" onClick={() => handleRemoveHoldingFromCategory(catIdx, hIdx)}>
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground italic text-center py-6 bg-slate-50/10 border border-dashed rounded-md">No strategic capital allocated to this layout structure bucket yet.</p>
              )}

              {/* Conditional Segment Specific Gemini Analysis Windows */}
              {category.geminiInsightsEnabled && (
                <div className="mt-4 border border-indigo-100 bg-indigo-50/10 rounded-lg p-3">
                  <h4 className="text-xs font-bold text-indigo-900 flex items-center gap-1.5 mb-2">
                    <Lightbulb className="h-4 w-4 text-amber-500" /> Segment Strategy Context Audit
                  </h4>
                  {category.isAnalyzing ? (
                    <div className="flex items-center gap-2 text-xs text-slate-500 py-1 font-medium">
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-indigo-600" /> Computing portfolio structure variance anomalies...
                    </div>
                  ) : (
                    <p className="text-xs text-slate-700 whitespace-pre-line leading-relaxed font-medium">
                      {category.insightsText}
                    </p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* COLLAPSIBLE REFERENCE ARCHIVES GRID */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Core Asset Custody Vault Log */}
        {portfolio && (
          <Card className="border-slate-200">
            <CardHeader className="py-3 flex flex-row items-center justify-between cursor-pointer select-none" onClick={() => setIsStatusMatrixExpanded(!isStatusMatrixExpanded)}>
              <CardTitle className="text-xs font-bold uppercase tracking-wider text-slate-600">Available Custodial Demat Inventory Reference Feed</CardTitle>
              {isStatusMatrixExpanded ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
            </CardHeader>
            {isStatusMatrixExpanded && (
              <CardContent className="pt-0">
                <ScrollArea className="h-[200px] rounded-md border">
                  <Table>
                    <TableHeader className="bg-slate-50 sticky top-0 z-10">
                      <TableRow>
                        <TableHead className="h-7 text-xxs">Symbol</TableHead>
                        <TableHead className="h-7 text-right text-xxs">Inventory Qty</TableHead>
                        <TableHead className="h-7 text-right text-xxs">LTP</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {portfolio.holdings.map((h, i) => (
                        <TableRow key={i} className="hover:bg-slate-50/50">
                          <TableCell className="py-1.5 font-semibold text-slate-800 text-xs">{h.trading_symbol}</TableCell>
                          <TableCell className="py-1.5 text-right font-mono text-xs">{h.quantity}</TableCell>
                          <TableCell className="py-1.5 text-right font-mono text-xs">₹{h.last_price.toFixed(2)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </ScrollArea>
              </CardContent>
            )}
          </Card>
        )}

        {/* Latency Matrix Monitoring Sync Metrics */}
        <Card className="border-slate-200">
          <CardHeader className="py-3 flex flex-row items-center justify-between cursor-pointer select-none" onClick={() => setIsClocksExpanded(!isClocksExpanded)}>
            <CardTitle className="text-xs font-bold uppercase tracking-wider text-slate-600">System Synchronization Latency Matrix</CardTitle>
            {isClocksExpanded ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
          </CardHeader>
          {isClocksExpanded && (
            <CardContent className="grid grid-cols-1 gap-2 pt-0 text-xs font-medium text-slate-700">
              <div className="p-2 bg-slate-50 border rounded flex justify-between items-center">
                <span className="text-slate-500">Browser Clock:</span>
                <span className="font-mono tabular-nums">{clientTime}</span>
              </div>
              <div className="p-2 bg-slate-50 border rounded flex justify-between items-center">
                <span className="text-slate-500">App Server Time:</span>
                <span className="font-mono tabular-nums">{status?.serverTimestamp ? new Date(status.serverTimestamp).toLocaleTimeString() : 'Syncing...'}</span>
              </div>
            </CardContent>
          )}
        </Card>
      </div>
    </div>
  );
}
