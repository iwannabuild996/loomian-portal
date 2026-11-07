import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';

export const assigneeName = (p: { full_name: string | null; email: string | null } | null | undefined) =>
  p?.full_name || p?.email || '—';

/** People a lead can be assigned to: sales users, plus admins and editors. */
export function useAssignees(enabled = true) {
  const { data = [] } = useQuery({
    queryKey: ['assignees'],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, email, role')
        .in('role', ['sales', 'admin', 'editor'])
        .order('full_name');
      if (error) throw error;
      return data as { id: string; full_name: string | null; email: string | null; role: string }[];
    },
  });
  return data;
}
