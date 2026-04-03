'use client';

import { useState, useMemo } from 'react';
import { Trophy, Medal, Search } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { PaginationBar } from '@/components/pagination-bar';
import type { LeaderboardEntry } from 'shared/types/leaderboard';

interface LeaderboardTableProps {
  entries: LeaderboardEntry[];
}

const PAGE_SIZE = 10;

const RANK_BG: Record<number, string> = {
  1: 'bg-yellow-400 text-white shadow-[0_3px_0_0_rgba(0,0,0,0.15)]',
  2: 'bg-gray-300 text-gray-700 shadow-[0_3px_0_0_rgba(0,0,0,0.12)]',
  3: 'bg-orange-300 text-white shadow-[0_3px_0_0_rgba(0,0,0,0.12)]',
};

export function LeaderboardTable({ entries }: LeaderboardTableProps) {
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState('');
  const [department, setDepartment] = useState('');

  const departments = useMemo(() => {
    const set = new Set(entries.map((e) => e.userDepartment).filter(Boolean));
    return Array.from(set).sort() as string[];
  }, [entries]);

  const filtered = useMemo(() => {
    return entries.filter((e) => {
      const matchName = !search || e.userName.toLowerCase().includes(search.toLowerCase());
      const matchDept = !department || e.userDepartment === department;
      return matchName && matchDept;
    });
  }, [entries, search, department]);

  const handleFilterChange = () => setPage(0);

  // Top 3 always from the full unfiltered entries (global ranking)
  const top3 = entries.slice(0, 3);

  if (entries.length === 0) {
    return (
      <div className="rounded-xl bg-white border-b-4 border-gray-200 shadow-[0_4px_0_0_rgba(0,0,0,0.06)] p-12 text-center">
        <p className="text-gray-400 font-semibold">No scores yet. Complete tasks to appear on the leaderboard.</p>
      </div>
    );
  }

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const safePage = Math.min(page, Math.max(0, totalPages - 1));
  const pageEntries = filtered.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);
  const padRows = PAGE_SIZE - pageEntries.length;

  return (
    <div className="space-y-3">
      {/* Top 3 podium (always visible, always global top 3) */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-2 items-end">
        {[top3[1], top3[0], top3[2]].map((entry, i) => {
          const podiumOrder = [2, 1, 3];
          const rank = podiumOrder[i];
          const heights = ['h-28', 'h-36', 'h-24'];
          const colors = [
            'bg-gray-200 border-gray-300 shadow-[0_4px_0_0_rgba(0,0,0,0.10)]',
            'bg-yellow-300 border-yellow-400 shadow-[0_6px_0_0_rgba(0,0,0,0.15)]',
            'bg-orange-200 border-orange-300 shadow-[0_4px_0_0_rgba(0,0,0,0.10)]',
          ];
          if (!entry) return <div key={`empty-${i}`} className={heights[i]} />;
          return (
            <div
              key={entry.userId}
              className={`rounded-3xl border-b-4 ${colors[i]} p-4 flex flex-col items-center justify-center ${heights[i]} transition-all`}
            >
              <div className="mb-1">
                {rank === 1
                  ? <Trophy className="w-6 h-6 text-yellow-600" />
                  : <Medal className={`w-5 h-5 ${rank === 2 ? 'text-gray-500' : 'text-orange-500'}`} />}
              </div>
              <p className="font-extrabold text-gray-800 text-sm text-center leading-tight">{entry.userName}</p>
              <p className="text-xs font-bold text-gray-500 mt-0.5">{entry.totalScore} pts</p>
            </div>
          );
        })}
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
          <input
            type="text"
            placeholder="Search by name..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); handleFilterChange(); }}
            className="w-full pl-9 pr-4 py-2 h-9 rounded-xl border border-input bg-background text-sm font-semibold text-gray-700 placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
        <Select
          value={department || 'all'}
          onValueChange={(v) => { setDepartment(v === 'all' ? '' : (v ?? '')); handleFilterChange(); }}
        >
          <SelectTrigger className="w-44">
            <span>{department || 'All departments'}</span>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All departments</SelectItem>
            {departments.map((d) => (
              <SelectItem key={d} value={d}>{d}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {(search || department) && (
          <Button variant="ghost" size="sm" onClick={() => { setSearch(''); setDepartment(''); setPage(0); }}>
            Clear filters
          </Button>
        )}
      </div>

      {/* Table */}
      <div className="rounded-xl bg-white border-b-4 border-amber-200 shadow-[0_4px_0_0_rgba(251,191,36,0.20)] overflow-hidden">
        {/* Header */}
        <div className="grid grid-cols-[60px_1fr_140px_100px_100px] gap-4 px-6 py-3 bg-amber-50 border-b border-amber-100">
          <span className="text-xs font-extrabold text-amber-600 uppercase tracking-wider">Rank</span>
          <span className="text-xs font-extrabold text-amber-600 uppercase tracking-wider">Name</span>
          <span className="text-xs font-extrabold text-amber-600 uppercase tracking-wider hidden sm:block">Department</span>
          <span className="text-xs font-extrabold text-amber-600 uppercase tracking-wider text-right">Score</span>
          <span className="text-xs font-extrabold text-amber-600 uppercase tracking-wider text-right hidden sm:block">Tasks Done</span>
        </div>

        {/* Rows */}
        <div className="divide-y divide-gray-50">
          {filtered.length === 0 ? (
            <div className="px-6 py-12 text-center">
              <p className="text-gray-400 font-semibold">No members match the current filters.</p>
            </div>
          ) : (
            <>
              {pageEntries.map((entry) => (
                <div
                  key={entry.userId}
                  className={`grid grid-cols-[60px_1fr_140px_100px_100px] gap-4 px-6 py-3.5 items-center hover:bg-amber-50/40 transition-colors ${
                    entry.rank <= 3 ? 'font-bold' : ''
                  }`}
                >
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-extrabold ${
                    RANK_BG[entry.rank] ?? 'bg-gray-100 text-gray-500'
                  }`}>
                    {entry.rank === 1
                      ? <Trophy className="w-4 h-4 text-yellow-700" />
                      : entry.rank === 2
                      ? <Medal className="w-4 h-4 text-gray-500" />
                      : entry.rank === 3
                      ? <Medal className="w-4 h-4 text-orange-600" />
                      : `#${entry.rank}`}
                  </div>
                  <span className="font-bold text-gray-700 text-sm truncate">{entry.userName}</span>
                  <span className="text-sm text-gray-400 font-semibold hidden sm:block truncate">{entry.userDepartment}</span>
                  <div className="text-right">
                    <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${
                      entry.rank === 1 ? 'bg-yellow-200 text-yellow-700' :
                      entry.rank === 2 ? 'bg-gray-200 text-gray-600' :
                      entry.rank === 3 ? 'bg-orange-200 text-orange-600' :
                      'bg-amber-100 text-amber-700'
                    }`}>
                      {entry.totalScore} pts
                    </span>
                  </div>
                  <span className="text-sm text-gray-400 font-semibold text-right hidden sm:block">{entry.tasksCompleted}</span>
                </div>
              ))}
              {/* Pad rows - same structure as real rows to maintain fixed height */}
              {Array.from({ length: padRows }).map((_, i) => (
                <div key={`pad-${i}`} className="grid grid-cols-[60px_1fr_140px_100px_100px] gap-4 px-6 py-3.5 items-center opacity-0 pointer-events-none select-none" aria-hidden="true">
                  <div className="w-8 h-8 rounded-full bg-gray-100" />
                  <span className="text-sm">&nbsp;</span>
                  <span className="text-sm hidden sm:block">&nbsp;</span>
                  <div className="text-right"><span className="text-xs px-2.5 py-1 rounded-full bg-amber-100">&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</span></div>
                  <span className="text-sm hidden sm:block text-right">&nbsp;</span>
                </div>
              ))}
            </>
          )}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="px-6 py-3 border-t border-amber-100 bg-amber-50/40">
            <PaginationBar
              page={safePage}
              totalPages={totalPages}
              onPageChange={setPage}
              totalItems={filtered.length}
              pageSize={PAGE_SIZE}
              itemLabel="members"
              accentClass="bg-amber-400 hover:bg-amber-500"
            />
          </div>
        )}
      </div>
    </div>
  );
}
