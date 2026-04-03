import { Badge } from '@/components/ui/badge';

const STATUS_COLORS = {
  TODO: 'secondary',
  IN_PROGRESS: 'default',
  DONE: 'outline',
} as const;

const PRIORITY_COLORS = {
  LOW: 'secondary',
  MEDIUM: 'default',
  HIGH: 'destructive',
} as const;

export function StatusBadge({ status }: { status: string }) {
  const variant = STATUS_COLORS[status as keyof typeof STATUS_COLORS] ?? 'secondary';
  const label = status.replace('_', ' ');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return <Badge variant={variant as any}>{label}</Badge>;
}

export function PriorityBadge({ priority }: { priority: string }) {
  const variant = PRIORITY_COLORS[priority as keyof typeof PRIORITY_COLORS] ?? 'secondary';
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return <Badge variant={variant as any}>{priority}</Badge>;
}
