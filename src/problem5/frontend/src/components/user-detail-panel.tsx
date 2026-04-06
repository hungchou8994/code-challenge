'use client';

import { useQuery } from '@tanstack/react-query';
import { Dialog as DialogPrimitive } from '@base-ui/react/dialog';
import { X } from 'lucide-react';
import { api } from '@/lib/api-client';
import { TaskStatus, TaskPriority } from 'shared/types/task';

interface UserDetailPanelProps {
  userId: string | null;
  onClose: () => void;
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .slice(0, 2)
    .map((n) => n[0]?.toUpperCase() ?? '')
    .join('');
}

const statusDotClass: Record<TaskStatus, string> = {
  [TaskStatus.TODO]: 'bg-gray-300',
  [TaskStatus.IN_PROGRESS]: 'bg-orange-400',
  [TaskStatus.DONE]: 'bg-green-400',
};

const priorityBadgeClass: Record<TaskPriority, string> = {
  [TaskPriority.LOW]: 'bg-gray-100 text-gray-500',
  [TaskPriority.MEDIUM]: 'bg-blue-100 text-blue-600',
  [TaskPriority.HIGH]: 'bg-orange-100 text-orange-600',
};

export function UserDetailPanel({ userId, onClose }: UserDetailPanelProps) {
  const { data: user, isLoading: userLoading } = useQuery({
    queryKey: ['user', userId],
    queryFn: () => api.users.get(userId!),
    enabled: !!userId,
  });

  const { data: tasksResult, isLoading: tasksLoading } = useQuery({
    queryKey: ['tasks', 'user', userId],
    queryFn: () => api.tasks.list({ assigneeId: userId!, limit: 1000 }),
    enabled: !!userId,
  });

  const tasks = tasksResult?.data;

  const { data: leaderboard } = useQuery({
    queryKey: ['leaderboard'],
    queryFn: api.leaderboard.get,
    enabled: !!userId,
  });

  const userEntry = leaderboard?.find((e) => e.userId === userId);
  const totalTasks = tasks?.length ?? 0;
  const completedTasks = tasks?.filter((t) => t.status === TaskStatus.DONE).length ?? 0;

  const isLoading = userLoading;

  return (
    <DialogPrimitive.Root
      open={!!userId}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop className="fixed inset-0 z-50 bg-black/20 data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0" />
        <DialogPrimitive.Popup className="fixed inset-y-0 right-0 z-50 w-full max-w-md bg-white shadow-2xl flex flex-col data-open:animate-in data-open:slide-in-from-right data-closed:animate-out data-closed:slide-out-to-right duration-200 outline-none">
          {isLoading ? (
            <div className="flex flex-col gap-4 p-6 h-full">
              <div className="animate-pulse bg-gray-100 rounded-xl h-24 w-full" />
              <div className="animate-pulse bg-gray-100 rounded-xl h-20 w-full" />
              <div className="animate-pulse bg-gray-100 rounded-xl h-48 w-full flex-1" />
            </div>
          ) : (
            <>
              <div className="relative flex items-start gap-4 px-5 pt-5 pb-4 border-b border-gray-100">
                <div className="w-12 h-12 rounded-full bg-violet-400 flex items-center justify-center flex-shrink-0">
                  <span className="text-white text-sm font-extrabold">
                    {user ? getInitials(user.name) : '??'}
                  </span>
                </div>

                <div className="flex-1 min-w-0 pt-0.5">
                  <p className="font-bold text-gray-800 text-lg leading-tight truncate">
                    {user?.name ?? '—'}
                  </p>
                  <p className="text-sm text-gray-500 font-semibold truncate">
                    {user?.email ?? '—'}
                  </p>
                  {user?.department && (
                    <span className="mt-1.5 inline-block px-2.5 py-1 rounded-full bg-violet-100 text-violet-600 text-xs font-bold">
                      {user.department}
                    </span>
                  )}
                </div>

                <DialogPrimitive.Close
                  className="absolute top-3 right-3 h-8 w-8 rounded-xl flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors outline-none focus:ring-2 focus:ring-violet-400"
                  aria-label="Close panel"
                >
                  <X className="h-4 w-4" />
                </DialogPrimitive.Close>
              </div>

              <div className="px-5 py-4 border-b border-gray-100">
                <div className={`grid gap-3 ${userEntry ? 'grid-cols-4' : 'grid-cols-3'}`}>
                  <div className="rounded-xl bg-violet-50 border border-violet-100 p-3 text-center">
                    <p className="text-2xl font-extrabold text-violet-600">{totalTasks}</p>
                    <p className="text-xs text-gray-400 font-semibold mt-0.5">Total Tasks</p>
                  </div>

                  <div className="rounded-xl bg-violet-50 border border-violet-100 p-3 text-center">
                    <p className="text-2xl font-extrabold text-violet-600">{completedTasks}</p>
                    <p className="text-xs text-gray-400 font-semibold mt-0.5">Completed</p>
                  </div>

                  <div className="rounded-xl bg-violet-50 border border-violet-100 p-3 text-center">
                    <p className="text-2xl font-extrabold text-violet-600">
                      {userEntry?.totalScore ?? '—'}
                    </p>
                    <p className="text-xs text-gray-400 font-semibold mt-0.5">Score</p>
                  </div>

                  {userEntry && (
                    <div className="rounded-xl bg-orange-50 border border-orange-100 p-3 text-center">
                      <p className="text-2xl font-extrabold text-orange-500">
                        #{userEntry.rank}
                      </p>
                      <p className="text-xs text-gray-400 font-semibold mt-0.5">Rank</p>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex-1 overflow-y-auto px-5 py-4">
                <p className="text-sm font-extrabold text-gray-500 uppercase tracking-wider mb-3">
                  Assigned Tasks
                </p>

                {tasksLoading ? (
                  <p className="text-sm text-gray-400">Loading tasks…</p>
                ) : !tasks || tasks.length === 0 ? (
                  <p className="text-sm text-gray-400">No tasks assigned.</p>
                ) : (
                  <div>
                    {tasks.map((task) => (
                      <div
                        key={task.id}
                        className="flex items-center gap-3 py-2.5 border-b border-gray-50 last:border-0"
                      >
                        <span
                          className={`w-2 h-2 rounded-full flex-shrink-0 ${statusDotClass[task.status]}`}
                        />

                        <span className="text-sm font-semibold text-gray-700 flex-1 truncate">
                          {task.title}
                        </span>

                        <span
                          className={`px-2.5 py-1 rounded-full text-xs font-bold flex-shrink-0 ${priorityBadgeClass[task.priority]}`}
                        >
                          {task.priority}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
