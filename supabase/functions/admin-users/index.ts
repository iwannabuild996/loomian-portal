// Admin-only user management. Needs the service-role key (injected by Supabase), so it cannot run
// in the browser. Deploy: paste into Supabase Dashboard > Edge Functions > admin-users, or
// `supabase functions deploy admin-users`.
//
// POST { action: 'create', email, password, full_name?, role }
// POST { action: 'set_password', user_id, password }
// POST { action: 'set_email', user_id, email }
// POST { action: 'set_disabled', user_id, disabled }   block / unblock login
// POST { action: 'delete', user_id }
import { createClient } from 'npm:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const ROLES = ['admin', 'editor', 'sales', 'viewer'];
const MIN_PASSWORD = 8;
const BAN_FOREVER = '876000h'; // ~100 years
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const reply = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return reply(405, { error: 'Method not allowed' });

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  });

  // Only a signed-in admin may call this.
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  const { data: caller, error: authError } = await admin.auth.getUser(token);
  if (authError || !caller.user) return reply(401, { error: 'Not signed in' });
  const { data: profile } = await admin.from('profiles').select('role').eq('id', caller.user.id).single();
  if (profile?.role !== 'admin') return reply(403, { error: 'Only admins can manage users' });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return reply(400, { error: 'Invalid request' });
  }

  const str = (k: string) => (typeof body[k] === 'string' ? (body[k] as string) : '');
  const userId = str('user_id');
  const needsUser = ['set_password', 'set_email', 'set_disabled', 'delete'];
  if (needsUser.includes(str('action')) && !userId) return reply(400, { error: 'Missing user' });
  // Locking yourself out (or deleting your own login) would leave no way back in.
  if (['set_disabled', 'delete'].includes(str('action')) && userId === caller.user.id) {
    return reply(400, { error: 'You cannot block or delete your own account' });
  }

  switch (str('action')) {
    case 'create': {
      const email = str('email').trim().toLowerCase();
      const password = str('password');
      const role = str('role') || 'viewer';
      if (!EMAIL.test(email)) return reply(400, { error: 'Enter a valid email' });
      if (password.length < MIN_PASSWORD) return reply(400, { error: `Password must be at least ${MIN_PASSWORD} characters` });
      if (!ROLES.includes(role)) return reply(400, { error: 'Unknown role' });

      const fullName = str('full_name').trim();
      const { data, error } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: fullName ? { full_name: fullName } : {},
      });
      if (error || !data.user) return reply(400, { error: error?.message ?? 'Could not create the user' });

      // The signup trigger made a viewer profile; apply the chosen role.
      const { error: roleError } = await admin.from('profiles').update({ role }).eq('id', data.user.id);
      if (roleError) return reply(500, { error: `User created, but setting the role failed: ${roleError.message}` });
      return reply(200, { id: data.user.id });
    }

    case 'set_password': {
      const password = str('password');
      if (password.length < MIN_PASSWORD) return reply(400, { error: `Password must be at least ${MIN_PASSWORD} characters` });
      const { error } = await admin.auth.admin.updateUserById(userId, { password });
      if (error) return reply(400, { error: error.message });
      return reply(200, { ok: true });
    }

    case 'set_email': {
      const email = str('email').trim().toLowerCase();
      if (!EMAIL.test(email)) return reply(400, { error: 'Enter a valid email' });
      // email_confirm: the change takes effect now, with no confirmation mail to the new address.
      const { error } = await admin.auth.admin.updateUserById(userId, { email, email_confirm: true });
      if (error) return reply(400, { error: error.message });
      // profiles.email is a copy used for display; keep it in step.
      const { error: copyError } = await admin.from('profiles').update({ email }).eq('id', userId);
      if (copyError) return reply(500, { error: `Login email changed, but the Users list copy failed: ${copyError.message}` });
      return reply(200, { ok: true });
    }

    case 'set_disabled': {
      const disabled = body.disabled === true;
      const { error } = await admin.auth.admin.updateUserById(userId, { ban_duration: disabled ? BAN_FOREVER : 'none' });
      if (error) return reply(400, { error: error.message });
      const { error: flagError } = await admin.from('profiles').update({ disabled }).eq('id', userId);
      if (flagError) return reply(500, { error: `Login ${disabled ? 'blocked' : 'unblocked'}, but the status flag failed: ${flagError.message}` });
      return reply(200, { ok: true });
    }

    case 'delete': {
      const { error } = await admin.auth.admin.deleteUser(userId);
      if (error) return reply(400, { error: error.message });
      return reply(200, { ok: true });
    }

    default:
      return reply(400, { error: 'Unknown action' });
  }
});
