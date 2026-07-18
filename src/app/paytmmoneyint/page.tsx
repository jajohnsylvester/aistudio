'use client';

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import {
  Workflow,
  Sparkles,
  Github as GithubIcon,
  Zap,
  Server,
  Table2,
  Wallet,
  Bot,
  Activity,
} from 'lucide-react';

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

// Visual identity per actor: icon + gradient colors
const actorStyle: Record<
  string,
  { icon: React.ElementType; from: string; to: string; text: string }
> = {
  GoogleAIStudio: { icon: Sparkles, from: '#4F46E5', to: '#818CF8', text: '#FFFFFF' },
  Github: { icon: GithubIcon, from: '#1F2937', to: '#4B5563', text: '#FFFFFF' },
  Boltnew: { icon: Zap, from: '#D97706', to: '#FBBF24', text: '#FFFFFF' },
  OnRenderApp: { icon: Server, from: '#7C3AED', to: '#A78BFA', text: '#FFFFFF' },
  GoogleSheets: { icon: Table2, from: '#15803D', to: '#4ADE80', text: '#FFFFFF' },
  PaytmMoney: { icon: Wallet, from: '#0EA5E9', to: '#38BDF8', text: '#FFFFFF' },
  GeminiLLM: { icon: Bot, from: '#DB2777', to: '#F472B6', text: '#FFFFFF' },
  UptimeRobot: { icon: Activity, from: '#DC2626', to: '#F87171', text: '#FFFFFF' },
};

// x-position (center) for each actor's lifeline, evenly spaced
const ACTOR_GAP = 150;
const ACTOR_START_X = 90;
const actorX: Record<string, number> = actors.reduce((acc, name, i) => {
  acc[name] = ACTOR_START_X + i * ACTOR_GAP;
  return acc;
}, {} as Record<string, number>);

const HEADER_Y = 24;
const HEADER_HEIGHT = 56;
const HEADER_WIDTH = 130;
const LIFELINE_TOP = HEADER_Y + HEADER_HEIGHT;

interface Message {
  step: number;
  from: string;
  to: string;
  label: string;
}

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

// Note shown before step 6, placed between OnRenderApp and PaytmMoney
const noteLines = [
  'Paytm money API Key & API secret need to be created first',
  'Paytm money requires static IP, webshare.io is used to get Static ip',
];

const ROW_START_Y = 130;
const ROW_GAP = 46;
const NOTE_LINE_HEIGHT = 18;
const NOTE_PADDING = 10;

function SequenceDiagram() {
  const width = ACTOR_START_X * 2 + (actors.length - 1) * ACTOR_GAP;

  // Lay out message rows top-to-bottom, reserving a block for the note before step 6
  const noteHeight = noteLines.length * NOTE_LINE_HEIGHT + NOTE_PADDING * 2;
  const messageRows: { y: number; message: Message }[] = [];
  let y = ROW_START_Y;
  let noteY = 0;
  messages.forEach((m) => {
    if (m.step === 6) {
      noteY = y;
      y += noteHeight + 30;
    }
    messageRows.push({ y, message: m });
    y += ROW_GAP;
  });
  const bottom = y + 20;

  // Note box centered between OnRenderApp and PaytmMoney
  const noteCenterX = (actorX['OnRenderApp'] + actorX['PaytmMoney']) / 2;
  const noteWidth = 300;

  return (
    <svg
      viewBox={`0 0 ${width} ${bottom}`}
      className="w-full h-auto"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <marker id="arrow" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto" markerUnits="strokeWidth">
          <path d="M0,0 L8,3 L0,6 Z" fill="#334155" />
        </marker>
        <filter id="actorShadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="2" stdDeviation="2" floodColor="#0f172a" floodOpacity="0.25" />
        </filter>
      </defs>

      {/* Lifelines */}
      {actors.map((name) => (
        <line
          key={name}
          x1={actorX[name]}
          y1={LIFELINE_TOP}
          x2={actorX[name]}
          y2={bottom}
          stroke="#64748B"
          strokeOpacity={0.55}
          strokeDasharray="5 4"
          strokeWidth={1.75}
        />
      ))}

      {/* Note box, between OnRenderApp and PaytmMoney */}
      <g>
        <rect
          x={noteCenterX - noteWidth / 2}
          y={noteY}
          width={noteWidth}
          height={noteHeight}
          rx={6}
          fill="#FEF9C3"
          stroke="#EAB308"
          strokeWidth={1}
        />
        {noteLines.map((line, i) => (
          <text
            key={i}
            x={noteCenterX}
            y={noteY + NOTE_PADDING + (i + 1) * NOTE_LINE_HEIGHT - 4}
            textAnchor="middle"
            fill="#854D0E"
            fontStyle="italic"
            fontSize={11}
          >
            {line}
          </text>
        ))}
      </g>

      {/* Actor headers */}
      {actors.map((name) => {
        const style = actorStyle[name];
        const Icon = style.icon;
        return (
          <g key={`header-${name}`} filter="url(#actorShadow)">
            <foreignObject
              x={actorX[name] - HEADER_WIDTH / 2}
              y={HEADER_Y}
              width={HEADER_WIDTH}
              height={HEADER_HEIGHT}
            >
              <div
                style={{
                  background: `linear-gradient(135deg, ${style.from}, ${style.to})`,
                  color: style.text,
                }}
                className="w-full h-full rounded-xl flex flex-col items-center justify-center gap-0.5 px-2"
              >
                <Icon className="h-4 w-4" strokeWidth={2.25} />
                <span className="text-[11px] font-semibold text-center leading-tight">
                  {name}
                </span>
              </div>
            </foreignObject>
          </g>
        );
      })}

      {/* Messages */}
      {messageRows.map(({ y: rowY, message: m }) => {
        const x1 = actorX[m.from];
        const x2 = actorX[m.to];
        const midX = (x1 + x2) / 2;
        const leftX = Math.min(x1, x2);

        return (
          <g key={m.step}>
            <text x={leftX - 16} y={rowY - 8} fill="#64748B" fontSize={11}>
              {m.step}
            </text>
            <text
              x={midX}
              y={rowY - 8}
              textAnchor="middle"
              fill="#0F172A"
              fontSize={12}
              fontWeight={600}
            >
              {m.label}
            </text>
            <line
              x1={x1}
              y1={rowY}
              x2={x2}
              y2={rowY}
              stroke="#334155"
              strokeWidth={1.75}
              markerEnd="url(#arrow)"
            />
          </g>
        );
      })}
    </svg>
  );
}

export default function PaytmIntegrationArchitecturePage() {
  return (
    <div className="flex flex-col gap-6 bg-slate-50 dark:bg-slate-950 min-h-screen p-6 -m-6">
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
          <div className="w-full overflow-x-auto rounded-md border bg-white dark:bg-slate-900 p-4">
            <div className="min-w-[1200px]">
              <SequenceDiagram />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

