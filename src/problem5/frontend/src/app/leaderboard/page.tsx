'use client';

import { useState, useEffect } from 'react';
import { Trophy } from 'lucide-react';
import { LeaderboardTable } from '@/components/leaderboard-table';
import type { LeaderboardEntry } from 'shared/types/leaderboard';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

export default function LeaderboardPage() {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  useEffect(() => {
    const es = new EventSource(`${API_BASE}/api/leaderboard/stream`);

    es.addEventListener('score-update', (e: MessageEvent) => {
      const data = JSON.parse(e.data) as LeaderboardEntry[];
      setEntries(data);
      setLastUpdated(new Date());
      setIsLoading(false);
    });

    es.onerror = () => {
      setIsLoading(false);
    };

    return () => {
      es.close();
    };
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-amber-400 flex items-center justify-center shadow-[0_3px_0_0_rgba(0,0,0,0.15)]">
            <Trophy className="h-6 w-6 text-white" />
          </div>
          <div>
            <h1 className="text-3xl font-extrabold text-gray-800">Leaderboard</h1>
            <p className="text-sm font-semibold text-gray-400">Top performers ranked by score</p>
          </div>
        </div>
        {lastUpdated && (
          <p className="text-xs font-semibold text-gray-400">
            Live · updated {lastUpdated.toLocaleTimeString()}
          </p>
        )}
      </div>

      {isLoading ? (
        <p className="text-muted-foreground">Connecting to live feed...</p>
      ) : (
        <LeaderboardTable entries={entries} />
      )}
    </div>
  );
}
