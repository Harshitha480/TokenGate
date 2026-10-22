import { Activity, FlaskConical, KeyRound, ListTree } from 'lucide-react';

export const NAV_ITEMS = [
  { to: '/', label: 'Overview', icon: Activity, end: true },
  { to: '/logs', label: 'Requests', icon: ListTree },
  { to: '/keys', label: 'API keys', icon: KeyRound },
  { to: '/playground', label: 'Playground', icon: FlaskConical },
];

export function pageTitleFor(pathname) {
  const match = NAV_ITEMS.find((item) =>
    item.end ? pathname === item.to : pathname.startsWith(item.to),
  );
  return match?.label ?? 'TokenGate';
}
