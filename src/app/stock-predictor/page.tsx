
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function StockPredictorPage() {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-3xl font-bold tracking-tight font-headline">
        Stock Predictor App
      </h1>
      <Card className="w-full h-[80vh]">
        <CardContent className="p-0 h-full">
          <iframe
            src="https://largecappredictor.streamlit.app/?embed=true"
            className="w-full h-full border-0"
            title="Stock Predictor App"
          ></iframe>
        </CardContent>
      </Card>
    </div>
  );
}
