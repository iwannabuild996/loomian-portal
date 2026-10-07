import { Star } from 'lucide-react';
import type { Lead } from './types';

/** A lead's allocated builders; the ones the lead itself enquired about are marked with a star. */
export function BuilderList({ builders }: { builders: Lead['lead_builders'] }) {
  const named = builders.filter((x) => x.builders?.name);
  if (!named.length) return <>—</>;
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-1">
      {named.map((x) => (
        <span key={x.builder_id} title={x.is_enquired ? 'Enquired by the lead' : 'Added by the team'} className={`inline-flex items-center gap-1 ${x.is_enquired ? 'font-medium text-amber-700' : ''}`}>
          {x.is_enquired && <Star className="size-3 fill-current" aria-label="Enquired" />}
          {x.builders?.name}
        </span>
      ))}
    </div>
  );
}
