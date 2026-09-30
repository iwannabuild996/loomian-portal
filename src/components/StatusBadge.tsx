export type ProjectStatus = 'ready_to_move' | 'off_plan';

export const STATUS_LABEL: Record<ProjectStatus, string> = {
  ready_to_move: 'Ready to move',
  off_plan: 'Off-plan',
};

export function StatusBadge({ status }: { status: ProjectStatus }) {
  const tone = status === 'ready_to_move' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700';
  return <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${tone}`}>{STATUS_LABEL[status]}</span>;
}
