'use client';

import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2, Users, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select';
import { UserForm } from '@/components/user-form';
import { UserDetailPanel } from '@/components/user-detail-panel';
import { PaginationBar } from '@/components/pagination-bar';
import { api } from '@/lib/api-client';
import type { User } from 'shared/types/user';

const PAGE_SIZE = 10;

export default function UsersPage() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState('');
  const [department, setDepartment] = useState('');
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);

  const { data: users = [], isLoading } = useQuery({
    queryKey: ['users'],
    queryFn: api.users.list,
  });

  const departments = useMemo(() => {
    const set = new Set(users.map((u) => u.department).filter(Boolean));
    return Array.from(set).sort() as string[];
  }, [users]);

  const filtered = useMemo(() => {
    return users.filter((u) => {
      const matchName = !search || u.name.toLowerCase().includes(search.toLowerCase());
      const matchDept = !department || u.department === department;
      return matchName && matchDept;
    });
  }, [users, search, department]);

  const handleFilterChange = () => setPage(0);

  const createMutation = useMutation({
    mutationFn: api.users.create,
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['users'] }); toast.success('User created'); },
    onError: (err: Error) => toast.error(err.message),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Parameters<typeof api.users.update>[1] }) =>
      api.users.update(id, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['users'] }); toast.success('User updated'); },
    onError: (err: Error) => toast.error(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: api.users.delete,
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['users'] }); toast.success('User deleted'); },
    onError: (err: Error) => toast.error(err.message),
  });

  const handleDelete = (user: User) => {
    if (confirm(`Delete ${user.name}? This cannot be undone.`)) {
      deleteMutation.mutate(user.id);
    }
  };

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const safePage = Math.min(page, Math.max(0, totalPages - 1));
  const pageUsers = filtered.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-violet-400 flex items-center justify-center shadow-[0_3px_0_0_rgba(0,0,0,0.15)]">
            <Users className="h-6 w-6 text-white" />
          </div>
          <div>
            <h1 className="text-3xl font-extrabold text-gray-800">Team Members</h1>
            <p className="text-sm font-semibold text-gray-400">Manage your team</p>
          </div>
        </div>
        <UserForm
          trigger={
            <Button className="rounded-2xl bg-orange-400 hover:bg-orange-500 text-white font-bold shadow-[0_4px_0_0_rgba(0,0,0,0.15)] hover:shadow-[0_2px_0_0_rgba(0,0,0,0.15)] hover:translate-y-0.5 transition-all border-0 px-5 py-2.5">
              <Plus className="h-4 w-4 mr-1.5" />Add Member
            </Button>
          }
          onSubmit={(data) => createMutation.mutateAsync(data)}
        />
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

      {isLoading ? (
        <p className="text-gray-400 font-semibold">Loading...</p>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl bg-white border-b-4 border-gray-200 shadow-[0_4px_0_0_rgba(0,0,0,0.06)] p-12 text-center">
          <p className="text-gray-400 font-semibold">
            {search || department ? 'No members match the current filters.' : 'No team members yet. Add one to get started.'}
          </p>
        </div>
      ) : (
        <div className="rounded-xl bg-white border-b-4 border-violet-200 shadow-[0_4px_0_0_rgba(139,92,246,0.20)] overflow-hidden">
          {/* Table header */}
          <div className="grid grid-cols-[1fr_1.5fr_1fr_80px] gap-4 px-6 py-3 bg-violet-50 border-b border-violet-100">
            <span className="text-xs font-extrabold text-violet-500 uppercase tracking-wider">Name</span>
            <span className="text-xs font-extrabold text-violet-500 uppercase tracking-wider">Email</span>
            <span className="text-xs font-extrabold text-violet-500 uppercase tracking-wider">Department</span>
            <span className="text-xs font-extrabold text-violet-500 uppercase tracking-wider text-right">Actions</span>
          </div>

          {/* Rows */}
          <div className="divide-y divide-gray-50">
            {pageUsers.map((user) => (
              <div key={user.id} className="grid grid-cols-[1fr_1.5fr_1fr_80px] gap-4 px-6 py-4 items-center hover:bg-orange-50/40 transition-colors cursor-pointer" onClick={() => setSelectedUserId(user.id)}>
                <span className="font-bold text-gray-700 text-sm truncate">{user.name}</span>
                <span className="text-sm text-gray-500 font-semibold truncate">{user.email}</span>
                <span className="text-sm">
                  <span className="px-2.5 py-1 rounded-full bg-violet-100 text-violet-600 text-xs font-bold">
                    {user.department || '—'}
                  </span>
                </span>
                <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                  <UserForm
                    user={user}
                    trigger={
                      <Button variant="ghost" size="icon" className="h-8 w-8 rounded-xl hover:bg-violet-100 hover:text-violet-600">
                        <Pencil className="h-4 w-4" />
                      </Button>
                    }
                    onSubmit={(data) => updateMutation.mutateAsync({ id: user.id, data })}
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 rounded-xl hover:bg-red-100 hover:text-red-500"
                    onClick={() => handleDelete(user)}
                    disabled={deleteMutation.isPending}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
            {/* Pad rows */}
            {Array.from({ length: PAGE_SIZE - pageUsers.length }).map((_, i) => (
              <div key={`pad-${i}`} className="px-6 py-4 opacity-0 pointer-events-none select-none">
                <span>&nbsp;</span>
              </div>
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="px-6 py-3 border-t border-violet-100 bg-violet-50/40">
              <PaginationBar
                page={safePage}
                totalPages={totalPages}
                onPageChange={setPage}
                totalItems={filtered.length}
                pageSize={PAGE_SIZE}
                itemLabel="members"
                accentClass="bg-violet-400 hover:bg-violet-500"
              />
            </div>
          )}
        </div>
      )}
      <UserDetailPanel userId={selectedUserId} onClose={() => setSelectedUserId(null)} />
    </div>
  );
}
