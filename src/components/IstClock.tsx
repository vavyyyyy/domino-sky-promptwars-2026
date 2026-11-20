import React, { useEffect, useState } from 'react';
import { Clock } from 'lucide-react';

interface IstClockProps {
  operatingDay: string;
}

function formatCurrentIstClock(now: Date): string {
  try {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Kolkata',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).format(now);
  } catch {
    return now.toISOString().slice(11, 19);
  }
}

export const IstClock: React.FC<IstClockProps> = React.memo(({ operatingDay }) => {
  const [now, setNow] = useState<Date>(() => new Date());

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);

  return (
    <div className="hidden md:flex items-center gap-1.5 text-[#596775] font-mono tabular-nums">
      <Clock className="w-3.5 h-3.5 text-[#647D91]" aria-hidden="true" />
      <span>
        {operatingDay} · {formatCurrentIstClock(now)} IST
      </span>
    </div>
  );
});

IstClock.displayName = 'IstClock';
