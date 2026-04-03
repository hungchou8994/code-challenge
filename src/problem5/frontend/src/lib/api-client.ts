import type { User, CreateUserInput, UpdateUserInput } from 'shared/types/user';
import type { Task, CreateTaskInput, UpdateTaskInput } from 'shared/types/task';
import type { LeaderboardEntry } from 'shared/types/leaderboard';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

export interface DashboardStats {
  totalTasks: number;
  completedTasks: number;
  tasksByUser: Array<{ userId: string; userName: string; taskCount: number }>;
  topPerformers: LeaderboardEntry[];
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const message = body?.error?.message || `Request failed: ${res.status}`;
    throw new Error(message);
  }

  if (res.status === 204) return undefined as T;
  return res.json();
}

export const api = {
  users: {
    list: (): Promise<User[]> =>
      request('/api/users'),

    get: (id: string): Promise<User> =>
      request(`/api/users/${id}`),

    create: (data: CreateUserInput): Promise<User> =>
      request('/api/users', {
        method: 'POST',
        body: JSON.stringify(data),
      }),

    update: (id: string, data: UpdateUserInput): Promise<User> =>
      request(`/api/users/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }),

    delete: (id: string): Promise<void> =>
      request(`/api/users/${id}`, { method: 'DELETE' }),
  },

  tasks: {
    list: (params?: {
      status?: string;
      assigneeId?: string;
      sortBy?: string;
      sortOrder?: 'asc' | 'desc';
    }): Promise<Task[]> => {
      const qs = params
        ? '?' + new URLSearchParams(
            Object.entries(params).filter(([, v]) => v !== undefined) as [string, string][]
          ).toString()
        : '';
      return request(`/api/tasks${qs}`);
    },

    get: (id: string): Promise<Task> =>
      request(`/api/tasks/${id}`),

    create: (data: CreateTaskInput): Promise<Task> =>
      request('/api/tasks', {
        method: 'POST',
        body: JSON.stringify(data),
      }),

    update: (id: string, data: UpdateTaskInput): Promise<Task> =>
      request(`/api/tasks/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),

    delete: (id: string): Promise<void> =>
      request(`/api/tasks/${id}`, { method: 'DELETE' }),
  },

  leaderboard: {
    get: (): Promise<LeaderboardEntry[]> =>
      request('/api/leaderboard'),
  },

  dashboard: {
    getStats: async (): Promise<DashboardStats> => {
      const [tasks, leaderboard] = await Promise.all([
        api.tasks.list(),
        api.leaderboard.get(),
      ]);

      const completedTasks = tasks.filter(t => t.status === 'DONE').length;

      const taskCountMap = new Map<string, { userName: string; count: number }>();
      for (const task of tasks) {
        if (task.assigneeId && task.assignee) {
          const existing = taskCountMap.get(task.assigneeId);
          if (existing) {
            existing.count += 1;
          } else {
            taskCountMap.set(task.assigneeId, {
              userName: task.assignee.name,
              count: 1,
            });
          }
        }
      }

      const tasksByUser = Array.from(taskCountMap.entries()).map(([userId, data]) => ({
        userId,
        userName: data.userName,
        taskCount: data.count,
      }));

      const topPerformers = leaderboard.slice(0, 5);

      return {
        totalTasks: tasks.length,
        completedTasks,
        tasksByUser,
        topPerformers,
      };
    },
  },
};
