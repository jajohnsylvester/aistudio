'use client';

import React, { useMemo, useState, useEffect } from 'react';
import { intervalToDuration, parse, format, isValid } from 'date-fns';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { CalendarDays, User } from 'lucide-react';

interface TeamMember {
  name: string;
  dob: string; // DD/MM/YYYY
  actualDob?: string; // DD/MM/YYYY
  note?: string;
}

const teamMembers: TeamMember[] = [
  { name: 'John Sylvester', dob: '18/11/1980' },
  { 
    name: 'Petritia Selvi', 
    dob: '08/05/1982', 
    actualDob: '08/07/1982',
    note: 'Recorded DOB: 08/05/1982, Actual DOB: 08/07/1982'
  },
  { name: 'Ashley Sylvester', dob: '26/08/2009' },
  { name: 'Joseph Alphonse', dob: '05/11/1949' },
  { name: 'Siriapushpam', dob: '27/03/1959' },
];

const calculateAge = (dobString: string, now: Date) => {
  const dob = parse(dobString, 'dd/MM/yyyy', new Date());
  if (!isValid(dob)) return null;

  const duration = intervalToDuration({
    start: dob,
    end: now,
  });

  return {
    years: duration.years || 0,
    months: duration.months || 0,
    days: duration.days || 0,
  };
};

export default function AgeCalculatorPage() {
  const [now, setNow] = useState<Date>(new Date());

  useEffect(() => {
    // Update "now" every minute to keep it reasonably fresh
    const timer = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  const results = useMemo(() => {
    return teamMembers.map((member) => {
      // For Petritia Selvi, we use the Actual DOB for the age calculation as per request context
      const dobToUse = member.actualDob || member.dob;
      const age = calculateAge(dobToUse, now);
      return {
        ...member,
        age,
        dobToUse,
      };
    });
  }, [now]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-2">
        <CalendarDays className="h-8 w-8 text-primary" />
        <h1 className="text-3xl font-bold tracking-tight font-headline">Current Age Calculator</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Team Member Ages</CardTitle>
          <CardDescription>
            Calculated as of {format(now, 'PPP p')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[200px]">Name</TableHead>
                <TableHead>Date of Birth</TableHead>
                <TableHead>Current Age (Y / M / D)</TableHead>
                <TableHead className="text-right">Details</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {results.map((member) => (
                <TableRow key={member.name}>
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2">
                      <User className="h-4 w-4 text-muted-foreground" />
                      {member.name}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col">
                      <span>{member.dobToUse}</span>
                      {member.actualDob && (
                         <span className="text-xs text-muted-foreground">Recorded: {member.dob}</span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    {member.age ? (
                      <div className="flex gap-2">
                        <Badge variant="outline" className="bg-primary/5 text-primary border-primary/20">
                          {member.age.years} Years
                        </Badge>
                        <Badge variant="outline" className="bg-secondary/10 text-secondary-foreground border-secondary/20">
                          {member.age.months} Months
                        </Badge>
                        <Badge variant="outline" className="bg-muted text-muted-foreground">
                          {member.age.days} Days
                        </Badge>
                      </div>
                    ) : (
                      <span className="text-destructive">Invalid Date</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right text-xs text-muted-foreground">
                     {member.note || ''}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {results.map((member) => (
           <Card key={member.name + "_stats"} className="overflow-hidden">
             <div className="h-1 bg-primary" />
             <CardHeader className="pb-2">
               <CardTitle className="text-lg">{member.name}</CardTitle>
               <CardDescription>{member.dobToUse}</CardDescription>
             </CardHeader>
             <CardContent>
               <div className="flex justify-between items-end">
                 <div className="flex flex-col">
                   <span className="text-3xl font-bold text-primary">{member.age?.years}</span>
                   <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Years Old</span>
                 </div>
                 <div className="text-right text-sm">
                   <p><span className="font-semibold">{member.age?.months}</span> months</p>
                   <p><span className="font-semibold">{member.age?.days}</span> days</p>
                 </div>
               </div>
             </CardContent>
           </Card>
        ))}
      </div>
    </div>
  );
}
