import { NavLink } from 'react-router';
import { LogOut, Monitor, Moon, Sun } from 'lucide-react';
import { useAuth } from '../../auth/useAuth.js';
import { Wordmark } from './BrandMark.jsx';
import { NAV_ITEMS } from './navigation.js';

const THEME_OPTIONS = [
  { value: 'system', label: 'System theme', icon: Monitor },
  { value: 'light', label: 'Light theme', icon: Sun },
  { value: 'dark', label: 'Dark theme', icon: Moon },
];

export function NavList({ onNavigate }) {
  return (
    <nav aria-label="Main">
      <ul className="flex flex-col gap-0.5">
        {NAV_ITEMS.map(({ to, label, icon: Icon, end }) => (
          <li key={to}>
            <NavLink
              to={to}
              end={end}
              onClick={onNavigate}
              className={({ isActive }) =>
                `flex h-9 items-center gap-2.5 rounded-control px-2.5 text-body transition-colors duration-150 lg:h-8 ${
                  isActive
                    ? 'bg-active font-medium text-ink'
                    : 'text-muted hover:bg-active/60 hover:text-ink'
                }`
              }
            >
              <Icon size={16} strokeWidth={1.75} aria-hidden="true" />
              {label}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}

function ThemeSwitch({ preference, onChange }) {
  return (
    <div
      role="radiogroup"
      aria-label="Colour theme"
      className="flex rounded-control bg-active p-0.5"
    >
      {THEME_OPTIONS.map(({ value, label, icon: Icon }) => (
        <button
          key={value}
          type="button"
          role="radio"
          aria-checked={preference === value}
          aria-label={label}
          title={label}
          onClick={() => onChange(value)}
          className={`grid h-7 flex-1 place-items-center rounded-[5px] ${
            preference === value ? 'bg-surface text-ink' : 'text-muted hover:text-ink'
          }`}
        >
          <Icon size={14} aria-hidden="true" />
        </button>
      ))}
    </div>
  );
}

export function AccountFooter({ theme }) {
  const { user, signOut } = useAuth();
  const initial = user?.name?.trim()?.[0]?.toUpperCase() ?? '?';
  return (
    <div className="flex flex-col gap-3">
      <ThemeSwitch preference={theme.preference} onChange={theme.setPreference} />
      <div className="flex items-center gap-2.5">
        <span
          aria-hidden="true"
          className="grid size-8 flex-none place-items-center rounded-full bg-[var(--pill-accent-bg)] text-body font-medium text-[var(--pill-accent-ink)]"
        >
          {initial}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-body font-medium text-ink">{user?.name}</p>
          <p className="truncate text-small text-muted">{user?.email}</p>
        </div>
        <button
          type="button"
          onClick={signOut}
          className="grid size-8 flex-none place-items-center rounded-control text-muted hover:bg-active hover:text-ink"
        >
          <LogOut size={16} aria-hidden="true" />
          <span className="sr-only">Sign out</span>
        </button>
      </div>
    </div>
  );
}

export function Sidebar({ theme }) {
  const { user } = useAuth();
  return (
    <aside className="sticky top-0 hidden h-dvh flex-col gap-6 px-3 pt-3 pb-4 lg:row-span-2 lg:flex">
      <div className="px-2.5">
        <Wordmark />
        <p className="mt-1 truncate text-small text-muted">{user?.name}&apos;s workspace</p>
      </div>
      <NavList />
      <div className="mt-auto px-1">
        <AccountFooter theme={theme} />
      </div>
    </aside>
  );
}
