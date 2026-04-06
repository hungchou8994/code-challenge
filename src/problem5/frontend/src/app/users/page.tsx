'use client';

import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2, Users, Search, Check, ChevronsUpDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
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
  const [deptOpen, setDeptOpen] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);

  // Unfiltered fetch used only to populate the department dropdown
  const { data: allUsersData } = useQuery({
    queryKey: ['users', 'all'],
    queryFn: () => api.users.listAll(),
    staleTime: 5 * 60 * 1000,
  });

  const departments = useMemo(() => {
    const allUsers = allUsersData?.data ?? [];
    const set = new Set(allUsers.map((u) => u.department).filter(Boolean));
    return Array.from(set).sort() as string[];
  }, [allUsersData]);

  // Server-side paginated + filtered query
  const { data: usersResult, isLoading } = useQuery({
    queryKey: ['users', 'list', page, search, department],
    queryFn: () => api.users.list({
      search: search || undefined,
      department: department || undefined,
      page: page + 1,
      limit: PAGE_SIZE,
    }),
  });

  const users = usersResult?.data ?? [];
  const totalPages = usersResult?.totalPages ?? 0;
  const totalItems = usersResult?.total ?? 0;

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
    onSuccess: () => {
      if (users.length === 1 && page > 0) setPage(page - 1);
      queryClient.invalidateQueries({ queryKey: ['users'] });
      toast.success('User deleted');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const handleDelete = (user: User) => {
    if (confirm(`Delete ${user.name}? This cannot be undone.`)) {
      deleteMutation.mutate(user.id);
    }
  };

  return (
    <div className="space-y-6">
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
        <Popover open={deptOpen} onOpenChange={setDeptOpen}>
          <PopoverTrigger
            className="inline-flex h-9 w-44 items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm hover:bg-accent hover:text-accent-foreground focus:outline-none"
            aria-expanded={deptOpen}
          >
            <span className="truncate">{department || 'All departments'}</span>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </PopoverTrigger>
          <PopoverContent className="w-52 p-0" side="bottom" align="start">
            <Command>
              <CommandInput placeholder="Search department..." />
              <CommandList>
                <CommandEmpty>No department found.</CommandEmpty>
                <CommandGroup>
                  <CommandItem
                    value="all"
                    onSelect={() => { setDepartment(''); handleFilterChange(); setDeptOpen(false); }}
                  >
                    <Check className={`mr-2 h-4 w-4 ${!department ? 'opacity-100' : 'opacity-0'}`} />
                    All departments
                  </CommandItem>
                  {departments.map((d) => (
                    <CommandItem
                      key={d}
                      value={d}
                      onSelect={() => { setDepartment(d === department ? '' : d); handleFilterChange(); setDeptOpen(false); }}
                    >
                      <Check className={`mr-2 h-4 w-4 ${department === d ? 'opacity-100' : 'opacity-0'}`} />
                      {d}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
        {(search || department) && (
          <Button variant="ghost" size="sm" onClick={() => { setSearch(''); setDepartment(''); setPage(0); }}>
            Clear filters
          </Button>
        )}
      </div>

      {isLoading ? (
        <p className="text-gray-400 font-semibold">Loading...</p>
      ) : users.length === 0 ? (
        <div className="rounded-xl bg-white border-b-4 border-gray-200 shadow-[0_4px_0_0_rgba(0,0,0,0.06)] p-12 text-center">
          <p className="text-gray-400 font-semibold">
            {search || department ? 'No members match the current filters.' : 'No team members yet. Add one to get started.'}
          </p>
        </div>
      ) : (
        <div className="rounded-xl bg-white border-b-4 border-violet-200 shadow-[0_4px_0_0_rgba(139,92,246,0.20)] overflow-hidden">
          <div className="grid grid-cols-[1fr_1.5fr_1fr_80px] gap-4 px-6 py-3 bg-violet-50 border-b border-violet-100">
            <span className="text-xs font-extrabold text-violet-500 uppercase tracking-wider">Name</span>
            <span className="text-xs font-extrabold text-violet-500 uppercase tracking-wider">Email</span>
            <span className="text-xs font-extrabold text-violet-500 uppercase tracking-wider">Department</span>
            <span className="text-xs font-extrabold text-violet-500 uppercase tracking-wider text-right">Actions</span>
          </div>

          <div className="divide-y divide-gray-50">
            {users.map((user) => (
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
            {Array.from({ length: PAGE_SIZE - users.length }).map((_, i) => (
              <div key={`pad-${i}`} className="px-6 py-4 opacity-0 pointer-events-none select-none">
                <span>&nbsp;</span>
              </div>
            ))}
          </div>

          {totalPages > 1 && (
            <div className="px-6 py-3 border-t border-violet-100 bg-violet-50/40">
              <PaginationBar
                page={page}
                totalPages={totalPages}
                onPageChange={setPage}
                totalItems={totalItems}
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
