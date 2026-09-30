import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';

/** id/label pairs from a table, for select fields. */
export function useOptions(table: string, label: string, order: string = label) {
  const { data = [] } = useQuery({
    queryKey: ['options', table, label, order],
    queryFn: async () => {
      const { data, error } = await supabase.from(table).select(`id, ${label}`).order(order);
      if (error) throw error;
      return (data as unknown as { id: string }[]).map((r) => ({
        value: r.id,
        label: String((r as Record<string, unknown>)[label]),
      }));
    },
  });
  return data;
}
