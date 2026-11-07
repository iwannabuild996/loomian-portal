import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Ban, CircleCheck, Pencil, Plus, Trash2, X } from 'lucide-react';
import { FunctionsHttpError } from '@supabase/supabase-js';
import { supabase } from '../../lib/supabase';
import { useAuth, type Role } from '../auth/AuthProvider';
import { field, friendlyError } from './ResourcePage';

type UserRow = { id: string; email: string | null; full_name: string | null; role: Role; disabled: boolean };

const ROLE_OPTIONS: { value: Role; label: string }[] = [
  { value: 'admin', label: 'Admin' },
  { value: 'editor', label: 'Editor' },
  { value: 'sales', label: 'Sales' },
  { value: 'viewer', label: 'Viewer' },
];

const MIN_PASSWORD = 8;
const label = 'mb-1 block text-sm font-medium';

/** Calls the admin-users Edge Function (service-role work that cannot run in the browser). */
async function manageUsers(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke('admin-users', { body });
  if (error) {
    if (error instanceof FunctionsHttpError) {
      const detail = await error.context.json().catch(() => null);
      throw new Error(detail?.error ?? 'The request failed');
    }
    throw new Error('Could not reach the user service. Is the admin-users function deployed?');
  }
  return data;
}

function UserForm({ user, onClose }: { user: UserRow | null; onClose: () => void }) {
  const qc = useQueryClient();
  const { session } = useAuth();
  const isSelf = user?.id === session?.user.id;
  const [email, setEmail] = useState(user?.email ?? '');
  const [name, setName] = useState(user?.full_name ?? '');
  const [role, setRole] = useState<Role>(user?.role ?? 'sales');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: async () => {
      if (!user) {
        await manageUsers({ action: 'create', email: email.trim(), password, full_name: name.trim(), role });
        return;
      }
      const patch: { full_name: string | null; role?: Role } = { full_name: name.trim() || null };
      if (!isSelf) patch.role = role;
      const { data, error } = await supabase.from('profiles').update(patch).eq('id', user.id).select('id');
      if (error) throw error;
      if (!data?.length) throw new Error('Not permitted, or the user no longer exists.');
      if (email.trim().toLowerCase() !== (user.email ?? '').toLowerCase()) {
        await manageUsers({ action: 'set_email', user_id: user.id, email: email.trim() });
      }
      if (password) await manageUsers({ action: 'set_password', user_id: user.id, password });
    },
    onSuccess: () => {
      qc.invalidateQueries();
      onClose();
    },
    onError: (e) => setError(friendlyError(e)),
  });

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return setError('Email is required');
    if ((!user || password) && password.length < MIN_PASSWORD) return setError(`Password must be at least ${MIN_PASSWORD} characters`);
    setError(null);
    save.mutate();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <form onSubmit={onSubmit} className="max-h-[90vh] w-full max-w-md space-y-4 overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">{user ? 'Edit user' : 'Add user'}</h2>
          <button type="button" aria-label="Close" onClick={onClose}><X className="size-5" /></button>
        </div>

        <div>
          <label htmlFor="user-email" className={label}>Email <span className="text-red-600">*</span></label>
          <input id="user-email" type="email" autoComplete="off" className={field} value={email} onChange={(e) => setEmail(e.target.value)} />
          {user && <p className="mt-1 text-xs text-slate-500">This is the login. Changing it takes effect immediately; tell the user their new login.</p>}
        </div>
        <div>
          <label htmlFor="user-name" className={label}>Name</label>
          <input id="user-name" className={field} value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <label htmlFor="user-role" className={label}>Role</label>
          <select id="user-role" className={field} value={role} disabled={isSelf} onChange={(e) => setRole(e.target.value as Role)}>
            {ROLE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <p className="mt-1 text-xs text-slate-500">
            {isSelf
              ? 'You cannot change your own role.'
              : 'Admins manage users; editors change data; sales see and add only their own leads, tasks and meetings; viewers are read-only.'}
          </p>
        </div>
        <div>
          <label htmlFor="user-password" className={label}>
            {user ? 'New password' : 'Password'} {!user && <span className="text-red-600">*</span>}
          </label>
          <input
            id="user-password"
            type="text"
            autoComplete="new-password"
            className={field}
            value={password}
            placeholder={user ? 'Leave blank to keep the current password' : ''}
            onChange={(e) => setPassword(e.target.value)}
          />
          <p className="mt-1 text-xs text-slate-500">
            At least {MIN_PASSWORD} characters. Share it with the user directly; it is not stored anywhere you can read it back.
          </p>
        </div>

        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-lg px-4 py-2 text-sm hover:bg-slate-100">Cancel</button>
          <button disabled={save.isPending} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60">
            {save.isPending ? 'Saving…' : 'Save'}
          </button>
        </div>
      </form>
    </div>
  );
}

export function UsersPage() {
  const qc = useQueryClient();
  const { session } = useAuth();
  const [editing, setEditing] = useState<UserRow | 'new' | null>(null);

  const act = useMutation({
    mutationFn: (body: Record<string, unknown>) => manageUsers(body),
    onSuccess: () => qc.invalidateQueries(),
  });
  const toggleBlocked = (u: UserRow) => {
    const msg = u.disabled
      ? `Unblock ${u.email}? They will be able to log in again.`
      : `Block ${u.email}? They are signed out and cannot log in until unblocked. Their data is kept.`;
    if (window.confirm(msg)) act.mutate({ action: 'set_disabled', user_id: u.id, disabled: !u.disabled });
  };
  const remove = (u: UserRow) => {
    if (window.confirm(`Permanently delete ${u.email}?\n\nTheir login is removed and cannot be undone. Leads assigned to them become unassigned. Blocking is usually safer.`)) {
      act.mutate({ action: 'delete', user_id: u.id });
    }
  };

  const { data = [], isLoading, error } = useQuery({
    queryKey: ['admin', 'users'],
    queryFn: async () => {
      const { data, error } = await supabase.from('profiles').select('id, email, full_name, role, disabled').order('email');
      if (error) throw error;
      return data as UserRow[];
    },
  });

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Users</h1>
          <p className="text-sm text-slate-500">Create logins with a password, change roles, and reset passwords.</p>
        </div>
        <button onClick={() => setEditing('new')} className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700">
          <Plus className="size-4" /> Add user
        </button>
      </div>

      {isLoading && <p className="text-slate-500">Loading…</p>}
      {error && <p role="alert" className="mb-3 text-sm text-red-600">Failed to load: {error.message}</p>}
      {act.error && <p role="alert" className="mb-3 text-sm text-red-600">{act.error.message}</p>}

      <div className="overflow-x-auto rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
        <table className="w-full border-collapse text-sm">
          <thead className="bg-slate-100">
            <tr>
              {['Email', 'Name', 'Role', 'Status'].map((h) => (
                <th key={h} className="whitespace-nowrap px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">{h}</th>
              ))}
              <th className="w-28 px-4 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {data.map((u) => (
              <tr key={u.id} className="border-t border-slate-200 hover:bg-slate-50">
                <td className="px-4 py-2.5 font-medium">{u.email || '—'}</td>
                <td className="px-4 py-2.5">{u.full_name || '—'}</td>
                <td className="px-4 py-2.5 capitalize">{u.role}</td>
                <td className="px-4 py-2.5">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${u.disabled ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'}`}>
                    {u.disabled ? 'Blocked' : 'Active'}
                  </span>
                </td>
                <td className="px-4 py-2.5">
                  <div className="flex justify-end gap-1">
                    <button aria-label="Edit user" onClick={() => setEditing(u)} className="rounded p-1.5 text-slate-500 hover:bg-slate-200"><Pencil className="size-4" /></button>
                    {u.id !== session?.user.id && (
                      <>
                        <button
                          aria-label={u.disabled ? 'Unblock user' : 'Block user'}
                          title={u.disabled ? 'Unblock' : 'Block login'}
                          disabled={act.isPending}
                          onClick={() => toggleBlocked(u)}
                          className="rounded p-1.5 text-slate-500 hover:bg-slate-200 disabled:opacity-50"
                        >
                          {u.disabled ? <CircleCheck className="size-4" /> : <Ban className="size-4" />}
                        </button>
                        <button aria-label="Delete user" title="Delete" disabled={act.isPending} onClick={() => remove(u)} className="rounded p-1.5 text-red-600 hover:bg-red-50 disabled:opacity-50"><Trash2 className="size-4" /></button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!isLoading && data.length === 0 && <p className="p-6 text-center text-slate-500">No users.</p>}
      </div>

      {editing && <UserForm user={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </div>
  );
}
