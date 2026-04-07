'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Select, SelectContent, SelectItem, SelectTrigger,
} from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from '@/components/ui/command';
import { Button } from '@/components/ui/button';
import { Check, ChevronsUpDown } from 'lucide-react';
import { api } from '@/lib/api-client';

interface FilterBarProps {
  status: string;
  assigneeId: string;
  assigneeName: string;
  onChange: (filters: { status: string; assigneeId: string; assigneeName: string }) => void;
}

const STATUS_LABEL: Record<string, string> = {
  all: 'All statuses',
  TODO: 'TODO',
  IN_PROGRESS: 'In Progress',
  DONE: 'Done',
};

export function FilterBar({ status, assigneeId, assigneeName, onChange }: FilterBarProps) {
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const { data: users = [] } = useQuery({
    queryKey: ['users', 'search', searchQuery],
    queryFn: () => api.users.search(searchQuery || undefined),
    enabled: open,
    staleTime: 30_000,
  });

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select
        value={status || 'all'}
        onValueChange={(v) => onChange({ status: !v || v === 'all' ? '' : v, assigneeId, assigneeName })}
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

      <Popover open={open} onOpenChange={(o) => { setOpen(o); if (!o) setSearchQuery(''); }}>
        <PopoverTrigger
          className="inline-flex h-9 w-44 items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm hover:bg-accent hover:text-accent-foreground focus:outline-none"
          aria-expanded={open}
        >
          <span className="truncate">
            {assigneeName || 'All assignees'}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </PopoverTrigger>
        <PopoverContent className="w-52 p-0" side="bottom" align="start">
          <Command shouldFilter={false}>
            <CommandInput
              placeholder="Search assignee..."
              value={searchQuery}
              onValueChange={setSearchQuery}
            />
            <CommandList>
              <CommandEmpty>No assignee found.</CommandEmpty>
              <CommandGroup>
                <CommandItem
                  value="all"
                  onSelect={() => {
                    onChange({ status, assigneeId: '', assigneeName: '' });
                    setSearchQuery('');
                    setOpen(false);
                  }}
                >
                  <Check className={`mr-2 h-4 w-4 ${!assigneeId ? 'opacity-100' : 'opacity-0'}`} />
                  All assignees
                </CommandItem>
                {users.map((u) => (
                  <CommandItem
                    key={u.id}
                    value={u.id}
                    onSelect={() => {
                      onChange({
                        status,
                        assigneeId: u.id === assigneeId ? '' : u.id,
                        assigneeName: u.id === assigneeId ? '' : u.name,
                      });
                      setSearchQuery('');
                      setOpen(false);
                    }}
                  >
                    <Check className={`mr-2 h-4 w-4 ${assigneeId === u.id ? 'opacity-100' : 'opacity-0'}`} />
                    {u.name}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {(status || assigneeId) && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onChange({ status: '', assigneeId: '', assigneeName: '' })}
        >
          Clear filters
        </Button>
      )}
    </div>
  );
}
