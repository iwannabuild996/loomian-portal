import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../auth/AuthProvider';

export type Settings = { hide_stock: boolean };

export function useSettings() {
  const { session } = useAuth();
  const userId = session?.user.id;
  const qc = useQueryClient();
  const key = ['settings', userId];

  const query = useQuery({
    queryKey: key,
    enabled: !!userId,
    queryFn: async (): Promise<Settings> => {
      const { data, error } = await supabase.from('user_settings').select('hide_stock').eq('user_id', userId!).maybeSingle();
      if (error) throw error;
      return { hide_stock: data?.hide_stock ?? false };
    },
  });

  const save = useMutation({
    mutationFn: async (patch: Partial<Settings>) => {
      const { error } = await supabase.from('user_settings').upsert({ user_id: userId, ...patch });
      if (error) throw error;
      return patch;
    },
    onSuccess: (patch) => qc.setQueryData<Settings>(key, (old) => ({ hide_stock: false, ...old, ...patch })),
  });

  return { query, save };
}

/** Fails safe: stock stays hidden until the setting has loaded (and if it fails to load). */
export function useHideStock(): boolean {
  const { query } = useSettings();
  return query.data ? query.data.hide_stock : true;
}
