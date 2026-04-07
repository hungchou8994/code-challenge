import type { User, CreateUserInput, UpdateUserInput } from 'shared/types/user';
import type { Task, CreateTaskInput, UpdateTaskInput } from 'shared/types/task';
import type { LeaderboardEntry } from 'shared/types/leaderboard';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

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
    list: (params?: {
      search?: string;
      department?: string;
      page?: number;
      limit?: number;
    }): Promise<PaginatedResponse<User>> => {
      const qs = params
        ? '?' + new URLSearchParams(
            Object.entries(params)
              .filter(([, v]) => v !== undefined)
              .map(([k, v]) => [k, String(v)])
          ).toString()
        : '';
      return request(`/api/users${qs}`);
    },

    listAll: (): Promise<PaginatedResponse<User>> =>
      request('/api/users?limit=1000'),

    search: (q?: string): Promise<Array<{ id: string; name: string; email: string }>> => {
      const qs = q ? `?q=${encodeURIComponent(q)}` : '';
      return request(`/api/users/search${qs}`);
    },

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
      page?: number;
      limit?: number;
    }): Promise<PaginatedResponse<Task>> => {
      const qs = params
        ? '?' + new URLSearchParams(
            Object.entries(params)
              .filter(([, v]) => v !== undefined)
              .map(([k, v]) => [k, String(v)])
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

    forceDelete: (id: string): Promise<void> =>
      request(`/api/tasks/${id}?force=true`, { method: 'DELETE' }),
  },

  leaderboard: {
    get: (): Promise<LeaderboardEntry[]> =>
      request('/api/leaderboard'),
  },

  dashboard: {
    getStats: async (): Promise<DashboardStats> => {
      const [totalResult, completedResult, leaderboard] = await Promise.all([
        api.tasks.list({ limit: 1 }),
        api.tasks.list({ status: 'DONE', limit: 1 }),
        api.leaderboard.get(),
      ]);

      // Derive per-member task counts from leaderboard (completed tasks)
      const tasksByUser = leaderboard
        .filter(e => e.tasksCompleted > 0)
        .map(e => ({
          userId: e.userId,
          userName: e.userName,
          taskCount: e.tasksCompleted,
        }));

      const topPerformers = leaderboard.slice(0, 5);

      return {
        totalTasks: totalResult.total,
        completedTasks: completedResult.total,
        tasksByUser,
        topPerformers,
      };
    },
  },
};
