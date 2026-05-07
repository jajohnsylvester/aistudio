
"use client";

import React, { useState, useRef, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { format } from 'date-fns';
import { toZonedTime } from 'date-fns-tz';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, SearchIcon, FileQuestion, Send, Trash2, Settings, MessageSquare, Zap, Check, AlertCircle } from "lucide-react";
import { searchAllExpenses } from '@/lib/sheets';
import { useToast } from '@/hooks/use-toast';
import { getCategoryIcon } from '@/lib/utils';
import { Expense } from '@/lib/types';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';


const searchFormSchema = z.object({
  query: z.string().min(1, { message: 'Please enter a search term.' }),
});

type SearchFormValues = z.infer<typeof searchFormSchema>;

type SearchResult = Omit<Expense, 'id' | 'paid'>;

const TIME_ZONE = 'Asia/Kolkata';

function PerplexityChat() {
  const [messages, setMessages] = useState<{ role: 'user' | 'assistant'; content: string; isError?: boolean }[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  
  const [model, setModel] = useState('sonar');
  const [temperature, setTemperature] = useState(0.7);
  const [maxTokens, setMaxTokens] = useState(1024);
  
  const messagesEndRef = useRef<null | HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  const clearChat = () => {
    setMessages([]);
  };

  const handleSubmit = async (e?: React.FormEvent<HTMLFormElement>) => {
    if (e) e.preventDefault();
    
    if (!input.trim() || isLoading) return;
    
    const userMessage = { role: 'user' as const, content: input.trim() };
    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setInput('');
    setIsLoading(true);

    // Add a placeholder for the assistant's response
    setMessages(prev => [...prev, { role: 'assistant', content: '' }]);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: model,
          messages: newMessages, // Send messages up to the user's latest
          temperature: temperature,
          max_tokens: maxTokens,
          stream: true,
        })
      });
      
      if (!response.ok || !response.body) {
          const errorText = await response.text();
          throw new Error(errorText || `API Error: ${response.status}`);
      }
      
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      
      while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split('\n').filter(line => line.trim() !== '');

          for (const line of lines) {
              if (line.startsWith('data: ')) {
                  const jsonStr = line.substring(6);
                   if (jsonStr === '[DONE]') {
                      continue;
                  }
                  try {
                      const parsed = JSON.parse(jsonStr);
                      const delta = parsed.choices[0]?.delta?.content || '';
                      
                      setMessages(prev => {
                          const lastMessage = prev[prev.length - 1];
                          if (lastMessage.role === 'assistant') {
                              lastMessage.content += delta;
                              return [...prev.slice(0, -1), lastMessage];
                          }
                          // This case should ideally not happen with the placeholder logic
                          return [...prev, { role: 'assistant', content: delta }];
                      });

                  } catch (e) {
                      console.error('Error parsing streaming data:', e);
                  }
              }
          }
      }

    } catch (error: any) {
      console.error('Error:', error);
      const errorMessage = {
        role: 'assistant' as const,
        content: `Error: ${error.message}.`,
        isError: true
      };
      // Replace the placeholder with the error message
      setMessages(prev => [...prev.slice(0, -1), errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };
  
  return (
    <Card className="mt-6">
      <CardContent className="p-0">
        <div className="flex h-[80vh] bg-gradient-to-br from-blue-50 to-indigo-100 rounded-lg">
          {/* Sidebar */}
          <div className={`${showSettings ? 'block' : 'hidden'} lg:block w-full lg:w-80 bg-white shadow-lg border-r overflow-y-auto rounded-l-lg`}>
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                  <Settings size={24} />
                  Configuration
                </h2>
                <button
                  onClick={() => setShowSettings(false)}
                  className="lg:hidden text-gray-500 hover:text-gray-700"
                >
                  ✕
                </button>
              </div>

              <div className="space-y-4">
                 <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Model
                  </label>
                  <Select value={model} onValueChange={setModel}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select a model" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="sonar">Sonar</SelectItem>
                      <SelectItem value="sonar-pro">Sonar Pro</SelectItem>
                      <SelectItem value="sonar-reasoning">Sonar Reasoning</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="mt-1 text-xs text-gray-500">
                    Choose the Perplexity model
                  </p>
                </div>


                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Temperature: {temperature}
                  </label>
                  <input
                    type="range"
                    min="0"
                    max="2"
                    step="0.1"
                    value={temperature}
                    onChange={(e) => setTemperature(parseFloat(e.target.value))}
                    className="w-full"
                  />
                  <div className="flex justify-between text-xs text-gray-500 mt-1">
                    <span>Precise</span>
                    <span>Creative</span>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Max Tokens
                  </label>
                  <input
                    type="number"
                    min="100"
                    max="4096"
                    step="100"
                    value={maxTokens}
                    onChange={(e) => setMaxTokens(parseInt(e.target.value))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                  <p className="mt-1 text-xs text-gray-500">
                    Maximum response length (100-4096)
                  </p>
                </div>

                <button
                  onClick={clearChat}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition"
                >
                  <Trash2 size={18} />
                  Clear Chat History
                </button>
              </div>

              <div className="mt-6 p-4 bg-blue-50 rounded-lg">
                <h3 className="font-semibold text-sm text-gray-800 mb-2">About Perplexity API</h3>
                <ul className="text-xs text-gray-600 space-y-1">
                  <li>• Real-time, web-grounded responses</li>
                  <li>• API key is managed on the server</li>
                  <li>• Messages: {messages.length}</li>
                </ul>
              </div>
            </div>
          </div>

          {/* Main Chat Area */}
          <div className="flex-1 flex flex-col">
            {/* Header */}
            <div className="bg-white shadow-sm border-b p-4 rounded-tr-lg">
              <div className="flex items-center justify-between max-w-4xl mx-auto">
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setShowSettings(!showSettings)}
                    className="lg:hidden p-2 hover:bg-gray-100 rounded-lg"
                  >
                    <Settings size={20} />
                  </button>
                  <Zap size={28} className="text-blue-600" />
                  <div>
                    <h1 className="text-xl font-bold text-gray-800">
                      Perplexity AI Chat
                    </h1>
                    <p className="text-sm text-gray-600">
                      Web-grounded AI responses
                    </p>
                  </div>
                </div>
                <div className="text-sm text-gray-500">
                  Model: <span className="font-medium text-gray-700">{model}</span>
                </div>
              </div>
            </div>

            {/* Messages */}
            <div
              className="flex-1 overflow-y-auto p-4"
            >
              <div className="max-w-4xl mx-auto space-y-4">
                {messages.length === 0 ? (
                  <div className="text-center py-12">
                    <MessageSquare size={64} className="mx-auto text-gray-300 mb-4" />
                    <h2 className="text-2xl font-semibold text-gray-600 mb-2">
                      Start a Conversation
                    </h2>
                    <p className="text-gray-500">
                      Ask me anything and get real-time, web-grounded responses
                    </p>
                    <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-3 max-w-2xl mx-auto">
                      {[
                        'What are the latest developments in AI?',
                        'Explain quantum computing simply',
                        'What is happening in tech news today?',
                        'Compare different programming languages'
                      ].map((suggestion, idx) => (
                        <button
                          key={idx}
                          onClick={() => setInput(suggestion)}
                          className="p-3 text-left text-sm bg-white border border-gray-200 rounded-lg hover:border-blue-500 hover:bg-blue-50 transition"
                        >
                          {suggestion}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  messages.map((message, index) => (
                    <div
                      key={index}
                      className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                    >
                      <div
                        className={`max-w-3xl rounded-lg p-4 ${
                          message.role === 'user'
                            ? 'bg-blue-600 text-white'
                            : message.isError
                            ? 'bg-red-50 text-red-800 border border-red-200'
                            : 'bg-white text-gray-800 shadow-sm border border-gray-200'
                        }`}
                      >
                         {message.role === 'assistant' && message.content === '' && !message.isError ? (
                            <div className="flex items-center gap-2">
                                <Zap size={18} className="text-blue-600 animate-pulse" />
                                <div className="flex gap-1">
                                <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></span>
                                <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></span>
                                <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></span>
                                </div>
                            </div>
                         ) : (
                            <div className="flex items-start gap-2">
                            {message.role === 'assistant' && !message.isError && (
                                <Zap size={18} className="text-blue-600 flex-shrink-0 mt-1" />
                            )}
                            {message.isError && (
                                <AlertCircle size={18} className="text-red-600 flex-shrink-0 mt-1" />
                            )}
                            <div className="flex-1">
                                <div className="text-sm whitespace-pre-wrap">{message.content}</div>
                            </div>
                            </div>
                         )}
                      </div>
                    </div>
                  ))
                )}
                
                <div ref={messagesEndRef} />
              </div>
            </div>

            {/* Input */}
            <div className="bg-white border-t p-4 rounded-b-lg">
              <div className="max-w-4xl mx-auto">
                <form onSubmit={handleSubmit} className="flex gap-2">
                  <input
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyPress={handleKeyPress}
                    placeholder="Ask me anything..."
                    disabled={isLoading}
                    className="flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100"
                  />
                  <button
                    type="submit"
                    disabled={isLoading || !input.trim()}
                    className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition flex items-center gap-2"
                  >
                    <Send size={20} />
                    <span className="hidden sm:inline">Send</span>
                  </button>
                </form>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}


export default function SearchPage() {
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const { toast } = useToast();

  const form = useForm<SearchFormValues>({
    resolver: zodResolver(searchFormSchema),
    defaultValues: { query: '' },
  });

  async function onSubmit(data: SearchFormValues) {
    setIsSearching(true);
    setHasSearched(true);
    try {
      const results = await searchAllExpenses(data.query);
      setSearchResults(results);
    } catch (error) {
      console.error("Search failed:", error);
      toast({
        variant: 'destructive',
        title: 'Search Failed',
        description: 'Could not fetch search results from Google Sheets.',
      });
    } finally {
      setIsSearching(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
        <h1 className="text-3xl font-bold tracking-tight font-headline">
            Global Expense Search
        </h1>
        <Card>
            <CardHeader>
                <CardTitle>Search Transactions</CardTitle>
                <CardDescription>Search for expenses across all years by description.</CardDescription>
            </CardHeader>
            <CardContent>
            <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="flex items-end gap-4">
                <FormField
                    control={form.control}
                    name="query"
                    render={({ field }) => (
                    <FormItem className="flex-grow">
                        <FormLabel>Search Term</FormLabel>
                        <FormControl>
                        <div className="relative">
                            <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input placeholder="e.g., Coffee, Movie tickets..." className="pl-10" {...field} />
                        </div>
                        </FormControl>
                        <FormMessage />
                    </FormItem>
                    )}
                />
                <Button type="submit" disabled={isSearching}>
                    {isSearching ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <SearchIcon className="mr-2 h-4 w-4" />}
                    {isSearching ? 'Searching...' : 'Search'}
                </Button>
                </form>
            </Form>
            </CardContent>
        </Card>

        <Card>
            <CardHeader>
                <CardTitle>Search Results</CardTitle>
            </CardHeader>
            <CardContent>
                {isSearching ? (
                    <div className="flex justify-center items-center h-60">
                        <Loader2 className="h-12 w-12 animate-spin text-primary" />
                    </div>
                ) : !hasSearched ? (
                    <div className="flex flex-col items-center justify-center text-center h-60 text-muted-foreground">
                        <FileQuestion className="h-12 w-12 mb-4" />
                        <p>Enter a term above to search for your expenses.</p>
                    </div>
                ) : searchResults.length === 0 ? (
                    <div className="flex flex-col items-center justify-center text-center h-60 text-muted-foreground">
                        <p>No results found for your query.</p>
                    </div>
                ) : (
                    <Table>
                        <TableHeader>
                            <TableRow>
                            <TableHead>Description</TableHead>
                            <TableHead>Category</TableHead>
                            <TableHead className="text-right">Amount</TableHead>
                            <TableHead className="text-right">Date</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {searchResults.map((expense, index) => (
                            <TableRow key={index}>
                                <TableCell className="font-medium">{expense.description}</TableCell>
                                <TableCell className="flex items-center gap-2">
                                    {getCategoryIcon(expense.category)}
                                    {expense.category}
                                </TableCell>
                                <TableCell className="text-right">{Number(expense.amount).toLocaleString('en-IN', { style: 'currency', currency: 'INR' })}</TableCell>
                                <TableCell className="text-right">{format(toZonedTime(new Date(expense.date), TIME_ZONE), 'PP')}</TableCell>
                            </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                )}
            </CardContent>
        </Card>
        
        <PerplexityChat />
    </div>
  );
}

    