import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { field, friendlyError } from '../admin/ResourcePage';
import { assigneeName, useAssignees } from './useAssignees';

/** Admin/editor-only dropdown that reassigns a lead on change, without opening the edit form. */
export function AssigneeSelect({ leadId, value, compact = false }: { leadId: string; value: string | null; compact?: boolean }) {
  const qc = useQueryClient();
  const assignees = useAssignees();

  const assign = useMutation({
    mutationFn: async (assignedTo: string) => {
      const { data, error } = await supabase
        .from('leads')
        .update({ assigned_to: assignedTo || null })
        .eq('id', leadId)
        .select('id');
      if (error) throw error;
      if (!data?.length) throw new Error('Not permitted, or the lead no longer exists.');
    },
    onSuccess: () => qc.invalidateQueries(),
  });

  return (
    <div>
      <select
        aria-label="Assigned to"
        className={`${field} ${compact ? '!w-auto min-w-36 !py-1' : '!w-auto min-w-48'}`}
        value={value ?? ''}
        disabled={assign.isPending}
        onChange={(e) => assign.mutate(e.target.value)}
      >
        <option value="">Unassigned</option>
        {assignees.map((a) => <option key={a.id} value={a.id}>{assigneeName(a)}{compact ? '' : ` (${a.role})`}</option>)}
      </select>
      {assign.error && <p role="alert" className="mt-1 text-xs text-red-600">{friendlyError(assign.error)}</p>}
    </div>
  );
}
