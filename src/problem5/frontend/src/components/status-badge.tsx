import { Badge } from '@/components/ui/badge';

type BadgeVariant = 'default' | 'secondary' | 'destructive' | 'outline' | 'ghost' | 'link';

const STATUS_COLORS = {
  TODO: 'secondary',
  IN_PROGRESS: 'default',
  DONE: 'outline',
} as const satisfies Record<string, BadgeVariant>;

const PRIORITY_COLORS = {
  LOW: 'secondary',
  MEDIUM: 'default',
  HIGH: 'destructive',
} as const satisfies Record<string, BadgeVariant>;

export function StatusBadge({ status }: { status: string }) {
  const variant: BadgeVariant = STATUS_COLORS[status as keyof typeof STATUS_COLORS] ?? 'secondary';
  const label = status.replace('_', ' ');
  return <Badge variant={variant}>{label}</Badge>;
}

export function PriorityBadge({ priority }: { priority: string }) {
  const variant: BadgeVariant = PRIORITY_COLORS[priority as keyof typeof PRIORITY_COLORS] ?? 'secondary';
  return <Badge variant={variant}>{priority}</Badge>;
}
