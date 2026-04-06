'use client';

import { useState } from 'react';
import { CheckSquare, ListTodo, Users, Trophy } from 'lucide-react';
import { PaginationBar } from '@/components/pagination-bar';
import type { DashboardStats } from '@/lib/api-client';

const PAGE_SIZE = 5;

interface TasksByMemberProps {
  tasksByUser: DashboardStats['tasksByUser'];
}

function TasksByMember({ tasksByUser }: TasksByMemberProps) {
  const [page, setPage] = useState(0);
  const sorted = [...tasksByUser].sort((a, b) => b.taskCount - a.taskCount);
  const totalPages = Math.ceil(sorted.length / PAGE_SIZE);
  const slice = sorted.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);

  return (
    <>
      <ul className="space-y-2 min-h-[180px]">
        {slice.map(({ userId, userName, taskCount }, i) => (
          <li key={userId} className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-orange-100 text-orange-500 text-xs font-bold flex items-center justify-center">
                {page * PAGE_SIZE + i + 1}
              </span>
              <span className="text-sm font-semibold text-gray-700">{userName}</span>
            </div>
            <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-orange-100 text-orange-600">
              {taskCount} task{taskCount !== 1 ? 's' : ''}
            </span>
          </li>
        ))}
      </ul>
      {totalPages > 1 && (
        <div className="mt-3 pt-3 border-t border-orange-100">
          <PaginationBar
            page={page}
            totalPages={totalPages}
            onPageChange={setPage}
            totalItems={sorted.length}
            pageSize={PAGE_SIZE}
            itemLabel="members"
            accentClass="bg-orange-400 hover:bg-orange-500"
          />
        </div>
      )}
    </>
  );
}

interface StatsCardsProps {
  stats: DashboardStats;
}

const statCards = [
  {
    key: 'totalTasks',
    label: 'Total Tasks',
    icon: ListTodo,
    bg: 'bg-violet-400',
    border: 'border-violet-500',
    shadow: 'shadow-[0_4px_0_0_#6d28d9]',
    text: 'text-violet-50',
    sub: 'text-violet-200',
    iconBg: 'bg-violet-300/40',
  },
  {
    key: 'completedTasks',
    label: 'Completed',
    icon: CheckSquare,
    bg: 'bg-emerald-400',
    border: 'border-emerald-500',
    shadow: 'shadow-[0_4px_0_0_#059669]',
    text: 'text-emerald-50',
    sub: 'text-emerald-200',
    iconBg: 'bg-emerald-300/40',
  },
  {
    key: 'activeMembers',
    label: 'Active Members',
    icon: Users,
    bg: 'bg-sky-400',
    border: 'border-sky-500',
    shadow: 'shadow-[0_4px_0_0_#0284c7]',
    text: 'text-sky-50',
    sub: 'text-sky-200',
    iconBg: 'bg-sky-300/40',
  },
  {
    key: 'topScore',
    label: 'Top Score',
    icon: Trophy,
    bg: 'bg-orange-400',
    border: 'border-orange-500',
    shadow: 'shadow-[0_4px_0_0_#ea580c]',
    text: 'text-orange-50',
    sub: 'text-orange-200',
    iconBg: 'bg-orange-300/40',
  },
];

export function StatsCards({ stats }: StatsCardsProps) {
  const completionRate = stats.totalTasks > 0
    ? Math.round((stats.completedTasks / stats.totalTasks) * 100)
    : 0;

  const values: Record<string, { main: string; sub?: string }> = {
    totalTasks: { main: String(stats.totalTasks) },
    completedTasks: { main: String(stats.completedTasks), sub: `${completionRate}% completion rate` },
    activeMembers: { main: String(stats.tasksByUser.length), sub: 'with assigned tasks' },
    topScore: {
      main: `${stats.topPerformers[0]?.totalScore ?? 0} pts`,
      sub: stats.topPerformers[0]?.userName,
    },
  };

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {statCards.map(({ key, label, icon: Icon, bg, border, shadow, text, sub, iconBg }) => (
          <div
            key={key}
            className={`rounded-3xl border-b-4 ${bg} ${border} ${shadow} p-5 flex flex-col gap-3 hover:-translate-y-0.5 hover:shadow-[0_6px_0_0_rgba(0,0,0,0.2)] transition-all duration-150`}
          >
            <div className="flex items-center justify-between">
              <span className={`text-sm font-bold ${text}`}>{label}</span>
              <div className={`w-9 h-9 rounded-2xl ${iconBg} flex items-center justify-center`}>
                <Icon className={`h-5 w-5 ${text}`} />
              </div>
            </div>
            <div>
              <p className={`text-3xl font-extrabold ${text} leading-tight`}>{values[key].main}</p>
              {values[key].sub && (
                <p className={`text-xs font-semibold mt-0.5 ${sub}`}>{values[key].sub}</p>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <div className="rounded-3xl bg-white border-b-4 border-orange-200 shadow-[0_4px_0_0_rgba(251,146,60,0.25)] p-6">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-8 rounded-xl bg-orange-100 flex items-center justify-center">
              <Users className="h-4 w-4 text-orange-500" />
            </div>
            <h2 className="font-extrabold text-gray-700 text-base">Tasks by Member</h2>
          </div>
          {stats.tasksByUser.length === 0 ? (
            <p className="text-sm text-gray-400 font-semibold">No tasks assigned yet.</p>
          ) : (
            <TasksByMember tasksByUser={stats.tasksByUser} />
          )}
        </div>

        <div className="rounded-3xl bg-white border-b-4 border-yellow-200 shadow-[0_4px_0_0_rgba(234,179,8,0.25)] p-6">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-8 rounded-xl bg-yellow-100 flex items-center justify-center">
              <Trophy className="h-4 w-4 text-yellow-500" />
            </div>
            <h2 className="font-extrabold text-gray-700 text-base">Top Performers</h2>
          </div>
          {stats.topPerformers.length === 0 ? (
            <p className="text-sm text-gray-400 font-semibold">No scores yet.</p>
          ) : (
            <ul className="space-y-2">
              {stats.topPerformers.map((p, i) => (
                <li key={p.userId} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className={`w-7 h-7 rounded-full text-xs font-extrabold flex items-center justify-center ${
                      i === 0 ? 'bg-yellow-400 text-white' :
                      i === 1 ? 'bg-gray-300 text-gray-700' :
                      i === 2 ? 'bg-orange-300 text-white' :
                      'bg-gray-100 text-gray-500'
                    }`}>
                      {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${p.rank}`}
                    </span>
                    <span className="text-sm font-semibold text-gray-700">{p.userName}</span>
                  </div>
                  <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-yellow-100 text-yellow-700">
                    {p.totalScore} pts
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
