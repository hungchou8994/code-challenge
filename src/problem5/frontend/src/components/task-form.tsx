'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger,
} from '@/components/ui/select';
import type { Task } from 'shared/types/task';
import type { User } from 'shared/types/user';

interface TaskFormProps {
  task?: Task;
  users: User[];
  trigger: React.ReactNode;
  onSubmit: (data: {
    title: string;
    description?: string;
    priority: string;
    assigneeId?: string;
    dueDate: string;
  }) => Promise<unknown>;
}

export function TaskForm({ task, users, trigger, onSubmit }: TaskFormProps) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(task?.title ?? '');
  const [description, setDescription] = useState(task?.description ?? '');
  const [priority, setPriority] = useState(task?.priority ?? 'MEDIUM');
  const [assigneeId, setAssigneeId] = useState(task?.assigneeId ?? '');

  const formatDate = (d?: Date | string) => {
    if (!d) return '';
    const date = new Date(d);
    return date.toISOString().split('T')[0];
  };
  const [dueDate, setDueDate] = useState(formatDate(task?.dueDate));
  const [loading, setLoading] = useState(false);

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
        dueDate: new Date(dueDate + 'T23:59:59.000Z').toISOString(),
      });
      setOpen(false);
      if (!task) {
        setTitle(''); setDescription(''); setPriority('MEDIUM');
        setAssigneeId(''); setDueDate('');
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
              <Select value={assigneeId || 'none'} onValueChange={v => setAssigneeId(v === 'none' || !v ? '' : v)}>
                <SelectTrigger>
                  <span className="truncate">
                    {assigneeId
                      ? (users.find(u => u.id === assigneeId)?.name ?? 'Unassigned')
                      : 'Unassigned'}
                  </span>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Unassigned</SelectItem>
                  {users.map(u => (
                    <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
