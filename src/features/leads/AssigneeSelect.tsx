import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { friendlyError } from '../admin/ResourcePage';
import { AssigneePicker } from './AssigneePicker';

/** Admin/editor-only picker that changes a lead's assignees on the spot, without opening the edit form. */
export function AssigneeSelect({ leadId, value, compact = false }: { leadId: string; value: string[]; compact?: boolean }) {
  const qc = useQueryClient();

  const assign = useMutation({
    mutationFn: async (next: string[]) => {
      const added = next.filter((id) => !value.includes(id));
      const removed = value.filter((id) => !next.includes(id));
      if (added.length) {
        const { error } = await supabase.from('lead_assignees').insert(added.map((profile_id) => ({ lead_id: leadId, profile_id })));
        if (error) throw error;
      }
      if (removed.length) {
        const { error } = await supabase.from('lead_assignees').delete().eq('lead_id', leadId).in('profile_id', removed);
        if (error) throw error;
      }
    },
    onSettled: () => qc.invalidateQueries(),
  });

  return (
    <div>
      <AssigneePicker value={value} onChange={(next) => assign.mutate(next)} disabled={assign.isPending} compact={compact} />
      {assign.error && <p role="alert" className="mt-1 text-xs text-red-600">{friendlyError(assign.error)}</p>}
    </div>
  );
}
