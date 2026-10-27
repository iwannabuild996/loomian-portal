import { NavLink, Outlet } from 'react-router-dom';
import { Building2, CalendarCheck, CalendarClock, ClipboardList, HardHat, History, Layers, PhoneCall, Table2, FileUp, LayoutGrid, ListChecks, LogOut, MapPin, Megaphone, Menu, PanelLeftClose, PanelLeftOpen, Ruler, Settings, Target, Users, X, type LucideIcon } from 'lucide-react';
import { useState } from 'react';
import { useAuth, type Role } from '../features/auth/AuthProvider';

type NavItem = { to: string; label: string; icon: LucideIcon; roles?: Role[] };

const nav: NavItem[] = [
  { to: '/', label: 'Inventory', icon: Building2 },
  { to: '/leads', label: 'Leads', icon: Target },
  { to: '/tasks', label: 'Tasks', icon: CalendarCheck },
  { to: '/meetings', label: 'Meetings', icon: CalendarClock },
];

const admin: NavItem[] = [
  { to: '/calls', label: 'Calls', icon: PhoneCall },
  { to: '/admin/inventory-sheet', label: 'Inventory sheet', icon: Table2 },
  { to: '/admin/import', label: 'Import', icon: FileUp },
  { to: '/admin/projects', label: 'Projects', icon: LayoutGrid },
  { to: '/admin/types', label: 'Types', icon: Ruler },
  { to: '/admin/builders', label: 'Builders', icon: HardHat },
  { to: '/admin/locations', label: 'Locations', icon: MapPin },
  { to: '/admin/lead-sources', label: 'Lead sources', icon: Megaphone },
  { to: '/admin/lead-statuses', label: 'Lead statuses', icon: ListChecks },
  { to: '/admin/task-types', label: 'Task types', icon: ClipboardList },
  { to: '/admin/configurations', label: 'Configurations', icon: Layers },
  { to: '/admin/audit', label: 'Audit log', icon: History },
  { to: '/admin/users', label: 'Users', icon: Users, roles: ['admin'] },
];

const COLLAPSED_KEY = 'sidebar-collapsed';

function readCollapsed(): boolean {
  try {
    return localStorage.getItem(COLLAPSED_KEY) === '1';
  } catch {
    return false;
  }
}

export function AppLayout() {
  const { session, role, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(readCollapsed);

  const toggleCollapsed = () =>
    setCollapsed((c) => {
      try {
        localStorage.setItem(COLLAPSED_KEY, c ? '0' : '1');
      } catch {
        /* the preference just won't persist */
      }
      return !c;
    });
  const adminItems = role === 'admin' || role === 'editor' ? admin.filter((i) => !i.roles || (role && i.roles.includes(role))) : [];

  const links = (items: NavItem[]) =>
    items.map(({ to, label, icon: Icon }) => (
      <NavLink
        key={to}
        to={to}
        end
        onClick={() => setOpen(false)}
        className={({ isActive }) =>
          `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition ${
            isActive ? 'bg-indigo-600 text-white' : 'hover:bg-slate-800'
          }`
        }
      >
        <Icon className="size-4" /> {label}
      </NavLink>
    ));

  const sidebar = (
    <div className="flex h-full flex-col bg-slate-900 text-slate-200">
      <div className="flex h-16 items-center gap-2 border-b border-slate-800 px-5 text-lg font-semibold text-white">
        <Building2 className="size-5 text-indigo-400" /> Loomian
      </div>
      <nav className="flex-1 space-y-1 overflow-y-auto p-3">
        {links(nav)}
        {adminItems.length > 0 && (
          <>
            <p className="px-3 pb-1 pt-4 text-xs font-semibold uppercase tracking-wider text-slate-500">Admin</p>
            {links(adminItems)}
          </>
        )}
      </nav>
      <div className="border-t border-slate-800 p-4">
        <p className="truncate text-sm text-white">{session?.user.email}</p>
        <p className="mb-3 text-xs capitalize text-slate-400">{role}</p>
        {links([{ to: '/settings', label: 'Settings', icon: Settings }])}
        <button
          onClick={signOut}
          className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-slate-800"
        >
          <LogOut className="size-4" /> Sign out
        </button>
      </div>
    </div>
  );

  return (
    <div className={`min-h-screen ${collapsed ? '' : 'lg:pl-60'}`}>
      <aside className={`fixed inset-y-0 left-0 z-30 hidden w-60 ${collapsed ? '' : 'lg:block'}`}>{sidebar}</aside>

      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-60">{sidebar}</aside>
          <button aria-label="Close menu" className="absolute right-4 top-4 text-white" onClick={() => setOpen(false)}>
            <X />
          </button>
        </div>
      )}

      <header className="sticky top-0 z-20 flex h-12 items-center gap-3 border-b border-slate-200 bg-white px-4">
        <button aria-label="Open menu" className="rounded p-1 hover:bg-slate-100 lg:hidden" onClick={() => setOpen(true)}>
          <Menu className="size-5" />
        </button>
        <button
          aria-label={collapsed ? 'Show sidebar' : 'Hide sidebar'}
          title={collapsed ? 'Show sidebar' : 'Hide sidebar'}
          className="hidden rounded p-1 hover:bg-slate-100 lg:block"
          onClick={toggleCollapsed}
        >
          {collapsed ? <PanelLeftOpen className="size-5" /> : <PanelLeftClose className="size-5" />}
        </button>
        <span className={`font-semibold ${collapsed ? '' : 'lg:hidden'}`}>Loomian</span>
      </header>

      <main className="p-4 sm:p-6 lg:p-8">
        <Outlet />
      </main>
    </div>
  );
}
