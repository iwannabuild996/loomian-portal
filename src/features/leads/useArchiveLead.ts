import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';

/** Archives a lead (hidden from the main list, nothing deleted) or restores it. */
export function useArchiveLead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, archive }: { id: string; archive: boolean }) => {
      const { data, error } = await supabase
        .from('leads')
        .update({ archived_at: archive ? new Date().toISOString() : null })
        .eq('id', id)
        .select('id');
      if (error) throw error;
      if (!data?.length) throw new Error('Not permitted, or the lead no longer exists.');
    },
    onSuccess: () => qc.invalidateQueries(),
  });
}
