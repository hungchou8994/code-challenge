'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronsUpDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger,
} from '@/components/ui/select';
import {
  Popover, PopoverContent, PopoverTrigger,
} from '@/components/ui/popover';
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from '@/components/ui/command';
import { api } from '@/lib/api-client';
import type { Task } from 'shared/types/task';

interface TaskFormProps {
  task?: Task;
  trigger: React.ReactNode;
  onSubmit: (data: {
    title: string;
    description?: string;
    priority: string;
    assigneeId?: string;
    dueDate: string;
  }) => Promise<unknown>;
}

export function TaskForm({ task, trigger, onSubmit }: TaskFormProps) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(task?.title ?? '');
  const [description, setDescription] = useState(task?.description ?? '');
  const [priority, setPriority] = useState(task?.priority ?? 'MEDIUM');
  const [assigneeId, setAssigneeId] = useState(task?.assigneeId ?? '');
  const [selectedUserName, setSelectedUserName] = useState(task?.assignee?.name ?? '');

  const [comboOpen, setComboOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const formatDate = (d?: Date | string) => {
    if (!d) return '';
    const date = new Date(d);
    return date.toISOString().split('T')[0];
  };
  const [dueDate, setDueDate] = useState(formatDate(task?.dueDate));
  const [loading, setLoading] = useState(false);

  const { data: users = [] } = useQuery({
    queryKey: ['users', 'search', searchQuery],
    queryFn: () => api.users.search(searchQuery || undefined),
    enabled: comboOpen,
    staleTime: 30_000,
  });

  const assigneeLabel = assigneeId ? (selectedUserName || 'Unassigned') : 'Unassigned';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !priority || !dueDate) return;
    setLoading(true);
    try {
      await onSubmit({
        title: title.trim(),
        description: description.trim() || undefined,
        priority,
        assigneeId: assigneeId || undefined,
        dueDate: new Date(dueDate + 'T23:59:59').toISOString(),
      });
      setOpen(false);
      if (!task) {
        setTitle(''); setDescription(''); setPriority('MEDIUM');
        setAssigneeId(''); setSelectedUserName(''); setDueDate('');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={trigger as React.ReactElement} />
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{task ? 'Edit Task' : 'Create Task'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="title">Title</Label>
            <Input id="title" value={title} onChange={e => setTitle(e.target.value)} required />
          </div>
          <div className="space-y-1">
            <Label htmlFor="description">Description</Label>
            <Input id="description" value={description} onChange={e => setDescription(e.target.value)} placeholder="Optional" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Priority</Label>
              <Select value={priority} onValueChange={(v) => { if (v) setPriority(v); }}>
                <SelectTrigger>
                  <span>{{ LOW: 'Low', MEDIUM: 'Medium', HIGH: 'High' }[priority] ?? priority}</span>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="LOW">Low</SelectItem>
                  <SelectItem value="MEDIUM">Medium</SelectItem>
                  <SelectItem value="HIGH">High</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Assignee</Label>
              <Popover open={comboOpen} onOpenChange={(o) => { setComboOpen(o); if (!o) setSearchQuery(''); }}>
                <PopoverTrigger
                  className="flex h-9 w-full items-center justify-between rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm hover:bg-accent"
                >
                  <span className="truncate text-left">{assigneeLabel}</span>
                  <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50 ml-1" />
                </PopoverTrigger>
                <PopoverContent className="w-56 p-0" align="start">
                  <Command shouldFilter={false}>
                    <CommandInput
                      placeholder="Search users..."
                      value={searchQuery}
                      onValueChange={setSearchQuery}
                    />
                    <CommandList>
                      <CommandEmpty>No users found.</CommandEmpty>
                      <CommandGroup>
                        <CommandItem
                          value="none"
                          onSelect={() => {
                            setAssigneeId('');
                            setSelectedUserName('');
                            setComboOpen(false);
                            setSearchQuery('');
                          }}
                        >
                          Unassigned
                        </CommandItem>
                        {users.map(u => (
                          <CommandItem
                            key={u.id}
                            value={u.id}
                            onSelect={() => {
                              setAssigneeId(u.id);
                              setSelectedUserName(u.name);
                              setComboOpen(false);
                              setSearchQuery('');
                            }}
                          >
                            {u.name}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="dueDate">Due Date</Label>
            <Input id="dueDate" type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} required />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={loading}>
              {loading ? 'Saving...' : task ? 'Save Changes' : 'Create Task'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
