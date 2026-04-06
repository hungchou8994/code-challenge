'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, Users, CheckSquare, Trophy, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';

const navItems = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/users', label: 'Users', icon: Users },
  { href: '/tasks', label: 'Tasks', icon: CheckSquare },
  { href: '/leaderboard', label: 'Leaderboard', icon: Trophy },
];

export function Nav() {
  const pathname = usePathname();

  return (
    <header className="bg-white border-b-4 border-orange-200 shadow-[0_4px_0_0_rgba(251,146,60,0.15)]">
      <div className="container mx-auto px-4">
        <div className="flex h-16 items-center justify-between">
          <Link href="/" className="flex items-center gap-2 group">
            <div className="flex items-center justify-center w-9 h-9 rounded-2xl bg-orange-400 shadow-[0_3px_0_0_rgba(0,0,0,0.15)] group-hover:translate-y-px group-hover:shadow-[0_2px_0_0_rgba(0,0,0,0.15)] transition-all">
              <Zap className="h-5 w-5 text-white" />
            </div>
            <span className="font-extrabold text-xl text-orange-500 tracking-tight hidden sm:block">
              Productivity<span className="text-violet-500">Tracker</span>
            </span>
          </Link>

          <nav className="flex items-center gap-1 bg-orange-50 rounded-2xl p-1.5 border-2 border-orange-100">
            {navItems.map(({ href, label, icon: Icon }) => {
              const active = pathname === href;
              return (
                <Link
                  key={href}
                  href={href}
                  className={cn(
                    'flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-sm font-bold transition-all duration-150',
                    active
                      ? 'bg-orange-400 text-white shadow-[0_3px_0_0_rgba(0,0,0,0.15)] translate-y-0'
                      : 'text-orange-400 hover:bg-orange-100 hover:text-orange-500'
                  )}
                >
                  <Icon className="h-4 w-4" />
                  <span className="hidden sm:inline">{label}</span>
                </Link>
              );
            })}
          </nav>
        </div>
      </div>
    </header>
  );
}
