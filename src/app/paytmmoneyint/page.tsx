'use client';

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Workflow } from 'lucide-react';

// Actors in the sequence diagram, in left-to-right order
const actors = [
  'GoogleAIStudio',
  'Github',
  'Boltnew',
  'OnRenderApp',
  'GoogleSheets',
  'PaytmMoney',
  'GeminiLLM',
  'UptimeRobot',
];

// x-position (center) for each actor's lifeline, evenly spaced
const ACTOR_GAP = 140;
const ACTOR_START_X = 90;
const actorX: Record<string, number> = actors.reduce((acc, name, i) => {
  acc[name] = ACTOR_START_X + i * ACTOR_GAP;
  return acc;
}, {} as Record<string, number>);

const HEADER_Y = 40;
const HEADER_HEIGHT = 44;
const LIFELINE_TOP = HEADER_Y + HEADER_HEIGHT;
const LIFELINE_BOTTOM = 640;

interface Message {
  step: number;
  from: string;
  to: string;
  label: string;
}

// direction is inferred automatically from actorX(from) vs actorX(to)
const messages: Message[] = [
  { step: 1, from: 'GoogleAIStudio', to: 'Github', label: 'Push Code' },
  { step: 2, from: 'Boltnew', to: 'Github', label: 'Push Code' },
  { step: 3, from: 'Github', to: 'OnRenderApp', label: 'Deploy to Render' },
  { step: 4, from: 'OnRenderApp', to: 'GoogleSheets', label: 'Persist data' },
  { step: 5, from: 'GoogleSheets', to: 'OnRenderApp', label: 'Retrieve data' },
  { step: 6, from: 'OnRenderApp', to: 'PaytmMoney', label: 'request_token' },
  { step: 7, from: 'PaytmMoney', to: 'OnRenderApp', label: 'access_token valid till midnight' },
  { step: 8, from: 'OnRenderApp', to: 'PaytmMoney', label: 'Call get user holding API' },
  { step: 9, from: 'PaytmMoney', to: 'OnRenderApp', label: 'Return the Portfolio details' },
  { step: 10, from: 'OnRenderApp', to: 'GeminiLLM', label: 'Send the Portfolio for Insights' },
  { step: 11, from: 'GeminiLLM', to: 'OnRenderApp', label: 'Display the insights in OnRenderApp.' },
  { step: 12, from: 'UptimeRobot', to: 'OnRenderApp', label: 'Keep App alive every 5 min' },
];

// Notes shown before step 6, spanning the diagram width
const notes = [
  'Paytm money API Key & API secret need to be created first',
  'Paytm money requires static IP, webshare.io is used to get Static ip',
];

const ROW_START_Y = 100;
const ROW_GAP = 42;
const NOTE_GAP = 26;

function SequenceDiagram() {
  const width = ACTOR_START_X * 2 + (actors.length - 1) * ACTOR_GAP;

  // Lay out rows top-to-bottom, inserting the notes block before step 6
  const rows: { y: number; kind: 'message' | 'note'; message?: Message; noteIndex?: number }[] = [];
  let y = ROW_START_Y;
  messages.forEach((m) => {
    if (m.step === 6) {
      notes.forEach((_, i) => {
        rows.push({ y, kind: 'note', noteIndex: i });
        y += NOTE_GAP;
      });
      y += 8;
    }
    rows.push({ y, kind: 'message', message: m });
    y += ROW_GAP;
  });
  const bottom = y + 20;

  return (
    <svg
      viewBox={`0 0 ${width} ${bottom}`}
      className="w-full h-auto"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <marker id="arrow" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto" markerUnits="strokeWidth">
          <path d="M0,0 L8,3 L0,6 Z" className="fill-foreground" />
        </marker>
      </defs>

      {/* Lifelines */}
      {actors.map((name) => (
        <g key={name}>
          <line
            x1={actorX[name]}
            y1={LIFELINE_TOP}
            x2={actorX[name]}
            y2={bottom}
            className="stroke-border"
            strokeDasharray="4 4"
            strokeWidth={1}
          />
        </g>
      ))}

      {/* Actor headers */}
      {actors.map((name) => (
        <g key={`header-${name}`}>
          <rect
            x={actorX[name] - 62}
            y={HEADER_Y}
            width={124}
            height={HEADER_HEIGHT}
            rx={8}
            className="fill-card stroke-border"
            strokeWidth={1.5}
          />
          <text
            x={actorX[name]}
            y={HEADER_Y + HEADER_HEIGHT / 2 + 4}
            textAnchor="middle"
            className="fill-foreground text-[12px] font-medium"
          >
            {name}
          </text>
        </g>
      ))}

      {/* Notes */}
      {rows
        .filter((r) => r.kind === 'note')
        .map((r) => (
          <text
            key={`note-${r.noteIndex}`}
            x={actorX[actors[0]]}
            y={r.y}
            className="fill-muted-foreground text-[11px] italic"
          >
            {notes[r.noteIndex!]}
          </text>
        ))}

      {/* Messages */}
      {rows
        .filter((r) => r.kind === 'message')
        .map((r) => {
          const m = r.message!;
          const x1 = actorX[m.from];
          const x2 = actorX[m.to];
          const leftX = Math.min(x1, x2);
          const rightX = Math.max(x1, x2);
          const midX = (x1 + x2) / 2;
          const pointsRight = x2 > x1;

          return (
            <g key={m.step}>
              <text
                x={leftX - 14}
                y={r.y - 8}
                className="fill-muted-foreground text-[11px]"
              >
                {m.step}
              </text>
              <text
                x={midX}
                y={r.y - 8}
                textAnchor="middle"
                className="fill-foreground text-[12px] font-medium"
              >
                {m.label}
              </text>
              <line
                x1={pointsRight ? x1 : rightX}
                y1={r.y}
                x2={pointsRight ? rightX : x1}
                y2={r.y}
                className="stroke-foreground"
                strokeWidth={1.5}
                markerEnd="url(#arrow)"
                transform={pointsRight ? undefined : `translate(${leftX + rightX}, 0) scale(-1, 1)`}
              />
            </g>
          );
        })}
    </svg>
  );
}

export default function PaytmIntegrationArchitecturePage() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-2">
        <Workflow className="h-8 w-8 text-primary" />
        <h1 className="text-3xl font-bold tracking-tight font-headline">
          Paytm Integration Architecture
        </h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Sequence Diagram</CardTitle>
          <CardDescription>
            End-to-end flow from code push through deployment, data persistence, Paytm Money token
            exchange, portfolio insights, and uptime monitoring.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="w-full overflow-x-auto rounded-md border bg-background p-4">
            <div className="min-w-[1100px]">
              <SequenceDiagram />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

