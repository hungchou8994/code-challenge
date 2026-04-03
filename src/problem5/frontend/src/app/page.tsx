'use client';

import { useQuery } from '@tanstack/react-query';
import { StatsCards } from '@/components/stats-cards';
import { api } from '@/lib/api-client';
import { BarChart3 } from 'lucide-react';

export default function DashboardPage() {
  const { data: stats, isLoading, error } = useQuery({
    queryKey: ['dashboard'],
    queryFn: api.dashboard.getStats,
    refetchInterval: 30_000,
  });

  return (
    <div className="space-y-6">
      {/* Hero header */}
      <div className="flex items-center gap-3">
        <div className="w-12 h-12 rounded-2xl bg-orange-400 flex items-center justify-center shadow-[0_3px_0_0_rgba(0,0,0,0.15)]">
          <BarChart3 className="h-6 w-6 text-white" />
        </div>
        <div>
          <h1 className="text-3xl font-extrabold text-gray-800 leading-tight">
            Dashboard
          </h1>
          <p className="text-sm font-semibold text-gray-400 mt-0.5">
            Track your team&apos;s productivity at a glance
          </p>
        </div>
      </div>

      {isLoading && (
        <p className="text-gray-400 font-semibold">Loading stats...</p>
      )}
      {error && (
        <p className="text-red-400 text-sm font-semibold">
          Failed to load dashboard data. Is the backend running?
        </p>
      )}
      {stats && <StatsCards stats={stats} />}
    </div>
  );
}
