'use client';

import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface PaginationBarProps {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  totalItems?: number;
  pageSize?: number;
  itemLabel?: string;
  accentClass?: string;
}

function getPageNumbers(page: number, totalPages: number): (number | '...')[] {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i);
  const pages: (number | '...')[] = [0];
  if (page > 2) pages.push('...');
  for (let i = Math.max(1, page - 1); i <= Math.min(totalPages - 2, page + 1); i++) {
    pages.push(i);
  }
  if (page < totalPages - 3) pages.push('...');
  pages.push(totalPages - 1);
  return pages;
}

export function PaginationBar({
  page,
  totalPages,
  onPageChange,
  totalItems,
  pageSize,
  itemLabel = 'items',
  accentClass = 'bg-indigo-600 hover:bg-indigo-700',
}: PaginationBarProps) {
  if (totalPages <= 1) return null;

  const pageNumbers = getPageNumbers(page, totalPages);

  return (
    <div className="flex items-center justify-between px-1 py-2">
      {totalItems != null && pageSize != null ? (
        <span className="text-sm text-muted-foreground">
          {page * pageSize + 1}–{Math.min((page + 1) * pageSize, totalItems)} of {totalItems} {itemLabel}
        </span>
      ) : (
        <span className="text-sm text-muted-foreground">
          Page {page + 1} of {totalPages}
        </span>
      )}

      <div className="flex items-center gap-1">
        <Button
          variant="outline"
          size="icon"
          className="h-8 w-8"
          onClick={() => onPageChange(page - 1)}
          disabled={page === 0}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>

        {pageNumbers.map((p, i) =>
          p === '...' ? (
            <span key={`ellipsis-${i}`} className="px-1 text-muted-foreground text-sm select-none">
              …
            </span>
          ) : (
            <Button
              key={p}
              variant={p === page ? 'default' : 'outline'}
              size="icon"
              className={`h-8 w-8 text-sm ${p === page ? accentClass : ''}`}
              onClick={() => onPageChange(p as number)}
            >
              {(p as number) + 1}
            </Button>
          )
        )}

        <Button
          variant="outline"
          size="icon"
          className="h-8 w-8"
          onClick={() => onPageChange(page + 1)}
          disabled={page === totalPages - 1}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
