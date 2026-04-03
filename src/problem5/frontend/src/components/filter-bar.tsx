'use client';

import {
  Select, SelectContent, SelectItem, SelectTrigger,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import type { User } from 'shared/types/user';

interface FilterBarProps {
  status: string;
  assigneeId: string;
  users: User[];
  onChange: (filters: { status: string; assigneeId: string }) => void;
}

const STATUS_LABEL: Record<string, string> = {
  all: 'All statuses',
  TODO: 'TODO',
  IN_PROGRESS: 'In Progress',
  DONE: 'Done',
};

export function FilterBar({ status, assigneeId, users, onChange }: FilterBarProps) {
  const currentAssignee = users.find(u => u.id === assigneeId);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select
        value={status || 'all'}
        onValueChange={(v) => onChange({ status: !v || v === 'all' ? '' : v, assigneeId })}
      >
        <SelectTrigger className="w-36">
          <span>{STATUS_LABEL[status || 'all']}</span>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All statuses</SelectItem>
          <SelectItem value="TODO">TODO</SelectItem>
          <SelectItem value="IN_PROGRESS">In Progress</SelectItem>
          <SelectItem value="DONE">Done</SelectItem>
        </SelectContent>
      </Select>

      <Select
        value={assigneeId || 'all'}
        onValueChange={(v) => onChange({ status, assigneeId: !v || v === 'all' ? '' : v })}
      >
        <SelectTrigger className="w-40">
          <span>{currentAssignee ? currentAssignee.name : 'All assignees'}</span>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All assignees</SelectItem>
          {users.map((u) => (
            <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      {(status || assigneeId) && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onChange({ status: '', assigneeId: '' })}
        >
          Clear filters
        </Button>
      )}
    </div>
  );
}
