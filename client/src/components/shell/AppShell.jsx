import { useState } from 'react';
import { Outlet, useLocation } from 'react-router';
import { BookOpen, Menu } from 'lucide-react';
import { useTheme } from '../../hooks/useTheme.js';
import { API_BASE_URL } from '../../lib/api.js';
import { CopyButton } from '../ui/CopyButton.jsx';
import { Dialog } from '../ui/Dialog.jsx';
import { BrandMark, Wordmark } from './BrandMark.jsx';
import { AccountFooter, NavList, Sidebar } from './Sidebar.jsx';
import { pageTitleFor } from './navigation.js';

// Optional link to the project's README, set at build time.
const DOCS_URL = import.meta.env.VITE_DOCS_URL;

/** The base URL an OpenAI SDK should be pointed at to go through this gateway. */
function gatewayBaseUrl() {
  const origin = API_BASE_URL || window.location.origin;
  return `${origin.replace(/\/$/, '')}/v1`;
}

function TopBar() {
  const baseUrl = gatewayBaseUrl();
  return (
    <header className="hidden h-12 items-center justify-between gap-4 pr-4 lg:flex">
      <div className="flex min-w-0 items-center gap-2 text-body">
        <span className="text-muted">Gateway endpoint</span>
        <code className="truncate font-mono text-small text-ink">{baseUrl}</code>
        <CopyButton value={baseUrl} label="Copy" />
      </div>
      {DOCS_URL ? (
        <a
          href={DOCS_URL}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 text-body text-muted hover:text-ink"
        >
          <BookOpen size={16} aria-hidden="true" />
          Docs
        </a>
      ) : null}
    </header>
  );
}

/** Below 1024px the frame folds into a 48px bar with a full-screen menu sheet. */
function MobileBar({ theme }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const { pathname } = useLocation();
  return (
    <header className="sticky top-0 z-20 flex h-12 items-center gap-3 bg-frame px-4 lg:hidden">
      <button
        type="button"
        onClick={() => setMenuOpen(true)}
        className="-ml-2 grid size-10 place-items-center rounded-control text-ink hover:bg-active"
      >
        <Menu size={20} aria-hidden="true" />
        <span className="sr-only">Open menu</span>
      </button>
      <BrandMark size={18} />
      <span className="text-section font-semibold">{pageTitleFor(pathname)}</span>
      <Dialog
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        title={<Wordmark />}
        variant="drawer"
      >
        <div className="flex min-h-[60dvh] flex-col gap-6">
          <NavList onNavigate={() => setMenuOpen(false)} />
          <div className="mt-auto">
            <AccountFooter theme={theme} />
          </div>
        </div>
      </Dialog>
    </header>
  );
}

/**
 * "Framed sheet" shell: sidebar and top bar share the tinted frame with no rule
 * between them; pages sit on a white sheet inset 8px from the right and bottom.
 */
export function AppShell() {
  const theme = useTheme();
  return (
    <div className="min-h-dvh bg-frame lg:grid lg:grid-cols-[228px_minmax(0,1fr)] lg:grid-rows-[48px_minmax(0,1fr)]">
      <Sidebar theme={theme} />
      <TopBar />
      <MobileBar theme={theme} />
      <main className="min-h-[calc(100dvh-48px)] bg-surface lg:mr-2 lg:mb-2 lg:min-h-[calc(100dvh-56px)] lg:rounded-sheet lg:border lg:border-line">
        <Outlet />
      </main>
    </div>
  );
}

/** Title row: a noun as the h1, one sentence about the data, actions on the right. */
export function PageHeader({ title, subtitle, actions }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
      <div className="min-w-0">
        <h1 className="text-title font-semibold text-ink">{title}</h1>
        {subtitle ? <div className="mt-1 text-body text-muted">{subtitle}</div> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function Page({ children }) {
  return <div className="flex flex-col gap-6 p-4 sm:p-6">{children}</div>;
}
