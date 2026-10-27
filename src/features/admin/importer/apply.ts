import { supabase } from '../../../lib/supabase';
import type { Plan } from './plan';

export type ImportCounts = { projects_created: number; projects_updated: number; types_created: number; types_updated: number };
export type ImportOutcome = { ok: true; dryRun: boolean; counts: ImportCounts } | { ok: false; dryRun: boolean; message: string };

/** The reviewed plan in the shape the import_projects database function expects. */
function toRequest(plan: Plan) {
  return {
    new_locations: plan.newLocations,
    projects: plan.projects
      .filter((p) => p.action !== 'unchanged')
      .map((p) => {
        // The function looks the location up by name, so a location created in the same run works too.
        const { location_id, ...payload } = p.payload;
        const setLocation = p.action === 'create' || location_id !== undefined || (!!p.locationName && !p.locationId);
        return {
          action: p.action,
          id: p.id,
          name: p.name,
          location_name: setLocation ? p.locationName : null,
          payload,
          types: p.types
            .filter((t) => t.action !== 'unchanged')
            .map((t) => ({ action: t.action, id: t.id, type_name: t.typeName, payload: t.payload })),
        };
      }),
  };
}

/**
 * Runs in a single database transaction: either every project is saved or none is.
 * With `dryRun` the whole import is executed and then rolled back, which checks every database rule.
 */
export async function runImport(plan: Plan, builderId: string, dryRun: boolean): Promise<ImportOutcome> {
  const { data, error } = await supabase.rpc('import_projects', { p_builder_id: builderId, p_data: toRequest(plan), p_dry_run: dryRun });
  if (error) {
    const missing = error.code === 'PGRST202' || /import_projects/.test(error.message) && /not find|does not exist/i.test(error.message);
    return {
      ok: false,
      dryRun,
      message: missing ? 'The importer is not set up in the database yet. Apply migration 0033_import_projects.sql first.' : error.message,
    };
  }
  return { ok: true, dryRun, counts: data as ImportCounts };
}
