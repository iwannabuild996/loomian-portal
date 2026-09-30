import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import type { Task } from './types';

/** Mark done / reopen / delete for a task. */
export function useTaskActions() {
  const qc = useQueryClient();
  const onSuccess = () => qc.invalidateQueries();

  const toggle = useMutation({
    mutationFn: async (task: Task) => {
      const completed_at = task.completed_at ? null : new Date().toISOString();
      const { data, error } = await supabase.from('lead_tasks').update({ completed_at }).eq('id', task.id).select('id');
      if (error) throw error;
      if (!data?.length) throw new Error('Not permitted, or the task no longer exists.');
    },
    onSuccess,
  });

  const remove = useMutation({
    mutationFn: async (task: Task) => {
      const { data, error } = await supabase.from('lead_tasks').delete().eq('id', task.id).select('id');
      if (error) throw error;
      if (!data?.length) throw new Error('Not permitted, or the task no longer exists.');
    },
    onSuccess,
  });

  return { toggle, remove };
}
