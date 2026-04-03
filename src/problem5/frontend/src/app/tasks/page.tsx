'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2, ArrowRight, CheckSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { FilterBar } from '@/components/filter-bar';
import { TaskForm } from '@/components/task-form';
import { PaginationBar } from '@/components/pagination-bar';
import { api } from '@/lib/api-client';
import type { Task } from 'shared/types/task';

const NEXT_STATUS: Record<string, string> = {
  TODO: 'IN_PROGRESS',
  IN_PROGRESS: 'DONE',
};

const NEXT_STATUS_LABEL: Record<string, string> = {
  TODO: 'Start',
  IN_PROGRESS: 'Complete',
};

const STATUS_STYLE: Record<string, string> = {
  TODO: 'bg-gray-100 text-gray-500',
  IN_PROGRESS: 'bg-sky-100 text-sky-600',
  DONE: 'bg-emerald-100 text-emerald-600',
};

const STATUS_LABEL: Record<string, string> = {
  TODO: 'To Do',
  IN_PROGRESS: 'In Progress',
  DONE: 'Done',
};

const PRIORITY_STYLE: Record<string, string> = {
  LOW: 'bg-green-100 text-green-600',
  MEDIUM: 'bg-yellow-100 text-yellow-600',
  HIGH: 'bg-red-100 text-red-600',
};

const CARD_BORDER: Record<string, string> = {
  TODO: 'border-gray-200 shadow-[0_4px_0_0_rgba(0,0,0,0.06)]',
  IN_PROGRESS: 'border-sky-200 shadow-[0_4px_0_0_rgba(56,189,248,0.25)]',
  DONE: 'border-emerald-200 shadow-[0_4px_0_0_rgba(52,211,153,0.25)]',
};

const PAGE_SIZE = 5;

export default function TasksPage() {
  const queryClient = useQueryClient();
  const [filters, setFilters] = useState({ status: '', assigneeId: '' });
  const [page, setPage] = useState(1);

  const handleFilterChange = (newFilters: { status: string; assigneeId: string }) => {
    setFilters(newFilters);
    setPage(1);
  };

  const { data: tasks = [], isLoading } = useQuery({
    queryKey: ['tasks', filters],
    queryFn: () => api.tasks.list({
      status: filters.status || undefined,
      assigneeId: filters.assigneeId || undefined,
    }),
  });

  const { data: users = [] } = useQuery({
    queryKey: ['users'],
    queryFn: api.users.list,
  });

  const totalPages = Math.max(1, Math.ceil(tasks.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paginated = tasks.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const createMutation = useMutation({
    mutationFn: api.tasks.create,
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['tasks'] }); toast.success('Task created'); },
    onError: (err: Error) => toast.error(err.message),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Parameters<typeof api.tasks.update>[1] }) =>
      api.tasks.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['leaderboard'] });
      toast.success('Task updated');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: api.tasks.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['leaderboard'] });
      toast.success('Task deleted');
      const remaining = tasks.length - 1;
      const newTotalPages = Math.max(1, Math.ceil(remaining / PAGE_SIZE));
      if (safePage > newTotalPages) setPage(newTotalPages);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const handleTransition = (task: Task) => {
    const nextStatus = NEXT_STATUS[task.status];
    if (!nextStatus) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    updateMutation.mutate({ id: task.id, data: { status: nextStatus as any } });
  };

  const handleDelete = (task: Task) => {
    if (confirm(`Delete "${task.title}"? This cannot be undone.`)) {
      deleteMutation.mutate(task.id);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-sky-400 flex items-center justify-center shadow-[0_3px_0_0_rgba(0,0,0,0.15)]">
            <CheckSquare className="h-6 w-6 text-white" />
          </div>
          <div>
            <h1 className="text-3xl font-extrabold text-gray-800">Tasks</h1>
            <p className="text-sm font-semibold text-gray-400">Manage and track team tasks</p>
          </div>
        </div>
        <TaskForm
          users={users}
          trigger={
            <Button className="rounded-2xl bg-orange-400 hover:bg-orange-500 text-white font-bold shadow-[0_4px_0_0_rgba(0,0,0,0.15)] hover:shadow-[0_2px_0_0_rgba(0,0,0,0.15)] hover:translate-y-0.5 transition-all border-0 px-5 py-2.5">
              <Plus className="h-4 w-4 mr-1.5" />Add Task
            </Button>
          }
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          onSubmit={(data) => createMutation.mutateAsync(data as any)}
        />
      </div>

      {/* Filters */}
      <FilterBar
        status={filters.status}
        assigneeId={filters.assigneeId}
        users={users}
        onChange={handleFilterChange}
      />

      {/* Task list */}
      {isLoading ? (
        <p className="text-gray-400 font-semibold">Loading...</p>
      ) : tasks.length === 0 ? (
        <div className="rounded-xl bg-white border-b-4 border-gray-200 shadow-[0_4px_0_0_rgba(0,0,0,0.06)] p-12 text-center">
          <p className="text-gray-400 font-semibold">
            {filters.status || filters.assigneeId ? 'No tasks match the current filters.' : 'No tasks yet. Create one to get started.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {paginated.map((task) => (

            <div
              key={task.id}
              className={`rounded-xl bg-white border-b-4 ${CARD_BORDER[task.status]} p-5 flex items-center gap-4 hover:-translate-y-0.5 transition-all duration-150`}
            >

              {/* Status dot */}
              <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${
                task.status === 'DONE' ? 'bg-emerald-400' :
                task.status === 'IN_PROGRESS' ? 'bg-sky-400' :
                'bg-gray-300'
              }`} />

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2 mb-1">
                  <span className="font-extrabold text-gray-800 truncate">{task.title}</span>
                  <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full ${STATUS_STYLE[task.status]}`}>
                    {STATUS_LABEL[task.status]}
                  </span>
                  <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full ${PRIORITY_STYLE[task.priority]}`}>
                    {task.priority}
                  </span>
                </div>
                {task.description && (
                  <p className="text-sm text-gray-400 font-semibold truncate">{task.description}</p>
                )}
                <div className="flex flex-wrap gap-3 mt-1 text-xs font-semibold text-gray-400">
                  {task.assignee && <span>👤 {task.assignee.name}</span>}
                  <span>📅 {new Date(task.dueDate).toLocaleDateString()}</span>
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-1.5 flex-shrink-0">
                {NEXT_STATUS[task.status] && !task.assigneeId && (
                  <span className="text-xs text-gray-400 font-semibold italic mr-1">Assign first</span>
                )}
                {NEXT_STATUS[task.status] && task.assigneeId && (
                  <Button
                    size="sm"
                    onClick={() => handleTransition(task)}
                    disabled={updateMutation.isPending}
                    className="rounded-xl bg-orange-400 hover:bg-orange-500 text-white font-bold text-xs shadow-[0_3px_0_0_rgba(0,0,0,0.12)] hover:shadow-[0_1px_0_0_rgba(0,0,0,0.12)] hover:translate-y-0.5 transition-all border-0"
                  >
                    <ArrowRight className="h-3 w-3 mr-1" />
                    {NEXT_STATUS_LABEL[task.status]}
                  </Button>
                )}
                <TaskForm
                  task={task}
                  users={users}
                  trigger={
                    <Button variant="ghost" size="icon" className="h-8 w-8 rounded-xl hover:bg-sky-100 hover:text-sky-600">
                      <Pencil className="h-4 w-4" />
                    </Button>
                  }
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  onSubmit={(data) => updateMutation.mutateAsync({ id: task.id, data: data as any })}
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 rounded-xl hover:bg-red-100 hover:text-red-500"
                  onClick={() => handleDelete(task)}
                  disabled={deleteMutation.isPending}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
          {/* Pad empty rows so last page keeps same height as full pages */}
          {Array.from({ length: PAGE_SIZE - paginated.length }).map((_, i) => (
            <div key={`empty-${i}`} className="rounded-xl bg-white border-b-4 border-transparent p-5 flex items-center gap-4 opacity-0 pointer-events-none select-none" aria-hidden="true">
              <div className="w-2.5 h-2.5 rounded-full flex-shrink-0 bg-gray-300" />
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2 mb-1">
                  <span className="font-extrabold text-gray-800">&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</span>
                  <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-gray-100">&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</span>
                </div>
                <p className="text-sm text-gray-400 font-semibold">&nbsp;</p>
                <div className="flex flex-wrap gap-3 mt-1 text-xs font-semibold text-gray-400">
                  <span>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</span>
                  <span>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</span>
                </div>
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <div className="h-8 w-8" />
                <div className="h-8 w-8" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {!isLoading && tasks.length > 0 && totalPages > 1 && (
        <PaginationBar
          page={safePage - 1}
          totalPages={totalPages}
          onPageChange={(p) => setPage(p + 1)}
          totalItems={tasks.length}
          pageSize={PAGE_SIZE}
          itemLabel="tasks"
          accentClass="bg-orange-400 hover:bg-orange-500"
        />
      )}
    </div>
  );
}
