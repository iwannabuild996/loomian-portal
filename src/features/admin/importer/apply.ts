import { supabase } from '../../../lib/supabase';
import { friendlyError } from '../ResourcePage';
import type { Plan, ProjectPlan } from './plan';

export type ProjectResult = { name: string; ok: boolean; message: string };

const lower = (s: string) => s.trim().toLowerCase();

async function ensureLocations(names: string[]): Promise<Map<string, string>> {
  const ids = new Map<string, string>();
  for (const name of names) {
    const { data, error } = await supabase.from('locations').insert({ name }).select('id').single();
    if (error) throw new Error(`Could not create location "${name}": ${friendlyError(error)}`);
    ids.set(lower(name), data.id);
  }
  return ids;
}

async function applyProject(p: ProjectPlan, builderId: string, locationIds: Map<string, string>): Promise<ProjectResult> {
  try {
    const locationId = p.locationId ?? (p.locationName ? locationIds.get(lower(p.locationName)) : null) ?? null;
    let projectId = p.id;
    if (p.action === 'create') {
      const { data, error } = await supabase
        .from('projects')
        .insert({ ...p.payload, name: p.name, builder_id: builderId, location_id: locationId })
        .select('id')
        .single();
      if (error) throw error;
      projectId = data.id;
    } else {
      const payload = { ...p.payload };
      // A location created by this import still needs to be attached to the project.
      if (!p.locationId && locationId) payload.location_id = locationId;
      if (Object.keys(payload).length) {
        const { data, error } = await supabase.from('projects').update(payload).eq('id', p.id!).select('id');
        if (error) throw error;
        if (!data?.length) throw new Error('Not permitted, or the project no longer exists.');
      }
    }

    let created = 0;
    let updated = 0;
    for (const t of p.types) {
      if (t.action === 'create') {
        const { error } = await supabase.from('unit_types').insert({ ...t.payload, type_name: t.typeName, project_id: projectId });
        if (error) throw new Error(`Type ${t.typeName}: ${friendlyError(error)}`);
        created++;
      } else if (t.action === 'update') {
        const { error } = await supabase.from('unit_types').update(t.payload).eq('id', t.id!);
        if (error) throw new Error(`Type ${t.typeName}: ${friendlyError(error)}`);
        updated++;
      }
    }
    const typeNote = created || updated ? ` · ${created} type${created === 1 ? '' : 's'} added, ${updated} updated` : '';
    return { name: p.name, ok: true, message: `${p.action === 'create' ? 'Created' : 'Updated'}${typeNote}` };
  } catch (e) {
    return { name: p.name, ok: false, message: friendlyError(e) };
  }
}

/** Not transactional: each project is applied on its own, and a failure only stops that project. */
export async function applyPlan(plan: Plan, builderId: string): Promise<{ results: ProjectResult[]; fatal?: string }> {
  let locationIds = new Map<string, string>();
  try {
    locationIds = await ensureLocations(plan.newLocations);
  } catch (e) {
    return { results: [], fatal: (e as Error).message };
  }
  const results: ProjectResult[] = [];
  for (const p of plan.projects) {
    if (p.action === 'unchanged') continue;
    results.push(await applyProject(p, builderId, locationIds));
  }
  return { results };
}
