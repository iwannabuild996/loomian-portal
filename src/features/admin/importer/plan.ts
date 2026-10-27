import { parsePriceRange } from '../../../lib/money';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Row = Record<string, any>;

export type Existing = {
  builders: { id: string; name: string }[];
  locations: { id: string; name: string }[];
  configurations: { id: string; name: string }[];
  projects: Row[];
  types: Row[];
};

export type Change = { field: string; from: unknown; to: unknown };

export type TypePlan = {
  typeName: string;
  action: 'create' | 'update' | 'unchanged';
  id?: string;
  /** create: every given column; update: only the columns that differ */
  payload: Row;
  configurationName?: string;
  changes: Change[];
  errors: string[];
};

export type ProjectPlan = {
  name: string;
  action: 'create' | 'update' | 'unchanged';
  id?: string;
  payload: Row;
  locationName: string | null;
  locationId: string | null;
  changes: Change[];
  types: TypePlan[];
  errors: string[];
  warnings: string[];
};

export type Plan = {
  projects: ProjectPlan[];
  newLocations: string[];
  errors: string[];
};

const key = (s: unknown) => String(s ?? '').trim().toLowerCase();
const squash = (s: unknown) => key(s).replace(/[\s_-]+/g, '');

type Conv = (v: unknown) => { value: unknown } | { error: string };
const isBlank = (v: unknown) => v == null || (typeof v === 'string' && ['', 'na', 'n/a', 'null', '-', '—'].includes(v.trim().toLowerCase()));

function num(opts: { int?: boolean; min?: number; max?: number } = {}): Conv {
  return (v) => {
    if (isBlank(v)) return { value: null };
    const n = typeof v === 'number' ? v : Number(String(v).replace(/[,\s]|sq\.?\s*ft/gi, ''));
    if (!Number.isFinite(n)) return { error: `"${v}" is not a number` };
    if (opts.int && !Number.isInteger(n)) return { error: `${n} must be a whole number` };
    if (opts.min != null && n < opts.min) return { error: `${n} must be at least ${opts.min}` };
    if (opts.max != null && n > opts.max) return { error: `${n} must be at most ${opts.max}` };
    return { value: n };
  };
}

const money: Conv = (v) => {
  if (isBlank(v)) return { value: null };
  if (typeof v === 'number') return Number.isFinite(v) && v >= 0 ? { value: Math.round(v) } : { error: `${v} is not a valid amount` };
  const r = parsePriceRange(String(v).replace(/[₹,]/g, ''));
  if (!r || r.min !== r.max) return { error: `"${v}" must be one amount like 71 L, 1.06 Cr or 7100000 (not a range)` };
  return { value: r.min };
};

const text: Conv = (v) => (isBlank(v) ? { value: null } : { value: String(v).trim() });

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const month: Conv = (v) => {
  if (isBlank(v)) return { value: null };
  const s = String(v).trim();
  let y: string | undefined;
  let m: number | undefined;
  let hit = /^(\d{4})-(\d{1,2})(?:-\d{1,2})?$/.exec(s);
  if (hit) [y, m] = [hit[1], Number(hit[2])];
  else if ((hit = /^([A-Za-z]{3})[A-Za-z]*\.?,?\s+(\d{4})$/.exec(s))) [y, m] = [hit[2], MONTHS.indexOf(hit[1].toLowerCase()) + 1];
  if (!y || !m || m < 1 || m > 12) return { error: `"${v}" must be a month and year like 2027-03` };
  return { value: `${y}-${String(m).padStart(2, '0')}-01` };
};

const KIND: Record<string, string> = {
  apartment: 'apartment', flat: 'apartment', villa: 'villa', building: 'building',
  agriculturalland: 'agricultural_land', land: 'agricultural_land',
};
const kind: Conv = (v) => {
  const k = KIND[squash(v)];
  return k ? { value: k } : { error: `"${v}" must be one of apartment, villa, building, agricultural_land` };
};

const STATUS: Record<string, string> = {
  readytomove: 'ready_to_move', ready: 'ready_to_move', offplan: 'off_plan', underconstruction: 'off_plan',
};
const status: Conv = (v) => {
  const s = STATUS[squash(v)];
  return s ? { value: s } : { error: `"${v}" must be ready_to_move or off_plan` };
};

type Spec = { key: string; column: string; conv: Conv };

const PROJECT_SPECS: Spec[] = [
  { key: 'kind', column: 'property_type', conv: kind },
  { key: 'status', column: 'status', conv: status },
  { key: 'possession', column: 'possession_date', conv: month },
  { key: 'total_floors', column: 'total_floor_count', conv: num({ int: true, min: 1 }) },
  { key: 'total_units', column: 'total_units', conv: num({ int: true, min: 1 }) },
  { key: 'latitude', column: 'latitude', conv: num({ min: -90, max: 90 }) },
  { key: 'longitude', column: 'longitude', conv: num({ min: -180, max: 180 }) },
  { key: 'usp', column: 'usp', conv: text },
  { key: 'parking_charge', column: 'parking_charge', conv: money },
  { key: 'registration_pct', column: 'registration_pct', conv: num({ min: 0, max: 100 }) },
  { key: 'floor_hike_per_floor', column: 'floor_hike_per_floor', conv: money },
];

const TYPE_SPECS: Spec[] = [
  { key: 'sqft', column: 'sqft', conv: num({ int: true, min: 1 }) },
  { key: 'available', column: 'available_count', conv: num({ int: true, min: 0 }) },
  { key: 'price', column: 'price', conv: money },
  { key: 'sqft_rate', column: 'sqft_rate', conv: num({ int: true, min: 0 }) },
];

const PROJECT_KEYS = new Set(['name', 'location', 'types', ...PROJECT_SPECS.map((s) => s.key)]);
const TYPE_KEYS = new Set(['type', 'configuration', ...TYPE_SPECS.map((s) => s.key)]);

const same = (a: unknown, b: unknown) => (a == null && b == null) || String(a) === String(b);

function readSpecs(raw: Row, specs: Spec[], errors: string[], prefix: string): Row {
  const out: Row = {};
  for (const s of specs) {
    if (!(s.key in raw)) continue;
    const r = s.conv(raw[s.key]);
    if ('error' in r) errors.push(`${prefix}${s.key}: ${r.error}`);
    else out[s.column] = r.value;
  }
  return out;
}

/** Strips ``` fences that chat models like to wrap JSON in, then parses. */
export function parseJson(input: string): { value: unknown } | { error: string } {
  const body = input.trim().replace(/^```[a-z]*\s*/i, '').replace(/```$/, '').trim();
  if (!body) return { error: 'Paste or upload some JSON first.' };
  try {
    return { value: JSON.parse(body) };
  } catch (e) {
    return { error: `Not valid JSON: ${(e as Error).message}` };
  }
}

/**
 * Accepts {projects:[…]}, a bare array of projects, or a single project object.
 * Every project goes to `builderId`, which the person picks in the UI.
 */
export function buildPlan(input: unknown, ex: Existing, builderId: string): Plan {
  const plan: Plan = { projects: [], newLocations: [], errors: [] };
  const builder = ex.builders.find((b) => b.id === builderId);
  let list: unknown[];
  if (Array.isArray(input)) list = input;
  else if (input && typeof input === 'object' && Array.isArray((input as Row).projects)) {
    list = (input as Row).projects;
  } else if (input && typeof input === 'object') list = [input];
  else {
    plan.errors.push('Expected an object with a "projects" list, a list of projects, or a single project object.');
    return plan;
  }
  if (!list.length) plan.errors.push('There are no projects in the file.');

  if (!builder) plan.errors.push('Choose a builder first.');
  const locations = new Map(ex.locations.map((l) => [key(l.name), l]));
  const configs = new Map(ex.configurations.map((c) => [squash(c.name), c]));
  const projects = new Map(ex.projects.map((p) => [key(p.name), p]));
  const typesOf = (projectId: string) => ex.types.filter((t) => t.project_id === projectId);
  const seenProjects = new Set<string>();
  const newLocations = new Map<string, string>();

  list.forEach((rawAny, i) => {
    const errors: string[] = [];
    const warnings: string[] = [];
    const raw: Row = rawAny && typeof rawAny === 'object' && !Array.isArray(rawAny) ? (rawAny as Row) : {};
    const name = String(raw.name ?? '').trim();
    const label = name || `Project #${i + 1}`;
    if (!name) errors.push('name is required');
    if (name && seenProjects.has(key(name))) errors.push('this project appears twice in the file');
    seenProjects.add(key(name));
    for (const k of Object.keys(raw)) if (!PROJECT_KEYS.has(k)) warnings.push(`Unknown field "${k}" ignored`);

    const existing = name ? projects.get(key(name)) : undefined;
    const payload = readSpecs(raw, PROJECT_SPECS, errors, '');

    // The location is matched by name; an unknown one is created on import.
    const locationName = String(raw.location ?? '').trim() || null;
    let locationId: string | null = null;
    if (locationName) {
      const l = locations.get(key(locationName));
      if (l) locationId = l.id;
      else newLocations.set(key(locationName), locationName);
    } else if (!existing) errors.push('location is required for a new project');
    if (existing && existing.builder_id !== builderId) {
      const other = ex.builders.find((b) => b.id === existing.builder_id)?.name;
      errors.push(`a project with this name already exists under ${other ? `"${other}"` : 'another builder'}; project names must be unique`);
    }

    // Changes against the stored project.
    const changes: Change[] = [];
    let projectPayload = payload;
    if (existing) {
      projectPayload = {};
      for (const [col, to] of Object.entries(payload)) {
        if (!same(existing[col], to)) {
          projectPayload[col] = to;
          changes.push({ field: col, from: existing[col], to });
        }
      }
      if (locationId && locationId !== existing.location_id) {
        projectPayload.location_id = locationId;
        changes.push({ field: 'location', from: ex.locations.find((l) => l.id === existing.location_id)?.name ?? null, to: locationName });
      } else if (locationName && !locationId) changes.push({ field: 'location', from: ex.locations.find((l) => l.id === existing.location_id)?.name ?? null, to: `${locationName} (new)` });
    }

    const merged = { ...(existing ?? {}), ...payload };
    if ((merged.latitude == null) !== (merged.longitude == null)) errors.push('latitude and longitude must be given together');

    // Types
    const typePlans: TypePlan[] = [];
    const rawTypes = raw.types;
    if (rawTypes != null && !Array.isArray(rawTypes)) errors.push('types must be a list');
    const seenTypes = new Set<string>();
    const storedTypes = existing ? typesOf(existing.id) : [];
    (Array.isArray(rawTypes) ? rawTypes : []).forEach((tAny, j) => {
      const tErrors: string[] = [];
      const t: Row = tAny && typeof tAny === 'object' ? (tAny as Row) : {};
      const typeName = String(t.type ?? '').trim();
      if (!typeName) tErrors.push('type is required (A, B, C…)');
      if (typeName && seenTypes.has(key(typeName))) tErrors.push('this type appears twice in the project');
      seenTypes.add(key(typeName));
      for (const k of Object.keys(t)) if (!TYPE_KEYS.has(k)) warnings.push(`Type ${typeName || j + 1}: unknown field "${k}" ignored`);

      const stored = storedTypes.find((s) => s.type_name === typeName) ?? storedTypes.find((s) => key(s.type_name) === key(typeName));
      const tPayload = readSpecs(t, TYPE_SPECS, tErrors, '');
      let configurationName: string | undefined;
      if (t.configuration != null && !isBlank(t.configuration)) {
        const c = configs.get(squash(t.configuration));
        if (!c) tErrors.push(`configuration "${t.configuration}" does not exist (${ex.configurations.map((x) => x.name).join(', ')})`);
        else {
          tPayload.configuration_id = c.id;
          configurationName = c.name;
        }
      } else if (!stored) tErrors.push('configuration is required for a new type');

      let action: TypePlan['action'] = 'create';
      let typeChanges: Change[] = [];
      let finalPayload = tPayload;
      if (stored) {
        finalPayload = {};
        for (const [col, to] of Object.entries(tPayload)) {
          if (!same(stored[col], to)) {
            finalPayload[col] = to;
            typeChanges.push({
              field: col === 'configuration_id' ? 'configuration' : col,
              from: col === 'configuration_id' ? ex.configurations.find((c) => c.id === stored[col])?.name : stored[col],
              to: col === 'configuration_id' ? configurationName : to,
            });
          }
        }
        action = typeChanges.length ? 'update' : 'unchanged';
      } else typeChanges = [];
      typePlans.push({ typeName, action, id: stored?.id, payload: finalPayload, configurationName, changes: typeChanges, errors: tErrors });
    });

    const typesChanged = typePlans.some((t) => t.action !== 'unchanged');
    const action: ProjectPlan['action'] = !existing ? 'create' : changes.length || typesChanged ? 'update' : 'unchanged';
    plan.projects.push({
      name: label, action, id: existing?.id, payload: projectPayload, locationName, locationId,
      changes, types: typePlans, errors, warnings,
    });
  });

  plan.newLocations = [...newLocations.values()];
  return plan;
}

export const planErrors = (plan: Plan): string[] => [
  ...plan.errors,
  ...plan.projects.flatMap((p) => [
    ...p.errors.map((e) => `${p.name}: ${e}`),
    ...p.types.flatMap((t) => t.errors.map((e) => `${p.name} › Type ${t.typeName || '?'}: ${e}`)),
  ]),
];

export const EXAMPLE = {
  projects: [
    {
      name: 'Example Heights',
      location: 'Kakkanad',
      kind: 'apartment',
      status: 'off_plan',
      possession: '2027-12',
      total_floors: 14,
      total_units: 120,
      latitude: 10.0159,
      longitude: 76.3419,
      usp: 'Near Infopark, clubhouse and pool',
      parking_charge: '3 L',
      registration_pct: 6,
      floor_hike_per_floor: 5000,
      types: [
        { type: 'A', configuration: '2BHK', sqft: 1100, available: 8, price: '71 L', sqft_rate: 6450 },
        { type: 'B', configuration: '3BHK', sqft: 1500, available: 4, price: '1.06 Cr', sqft_rate: 7050 },
      ],
    },
  ],
};

/** Prompt for converting source material into the import JSON. Lists the options that exist right now. */
export function llmInstructions(configurations: string[], locations: string[]): string {
  const configs = configurations.length ? configurations.join(', ') : '1BHK, 2BHK, 3BHK, 4BHK, Villa';
  const locs = locations.length ? `Existing locations (use the exact spelling when the project is in one of them; a new name is created otherwise): ${locations.join(', ')}.` : 'Use the location name exactly as the source writes it.';
  return `Convert the source material below into JSON for a real-estate inventory importer. Reply with ONLY the JSON, with no commentary and no markdown.

The builder is chosen separately, so do NOT include it. Output a list of projects; for a single project use one entry in "projects". Example:
${JSON.stringify(EXAMPLE, null, 2)}

PROJECT fields (inside each entry of "projects"):
- "name" (text, REQUIRED): the project name, exactly as marketed.
- "location" (text, REQUIRED for a new project): the area or locality. ${locs}
- "kind" (optional): one of apartment | villa | building | agricultural_land.
- "status" (optional): one of ready_to_move | off_plan. Use ready_to_move for completed or handed-over projects, off_plan for under construction or upcoming ones.
- "possession" (optional): handover month as "YYYY-MM", e.g. "2027-12".
- "total_floors" (optional): whole number, 1 or more. Leave out for villas and land.
- "total_units" (optional): whole number, 1 or more.
- "latitude" and "longitude" (optional): decimal degrees (latitude -90 to 90, longitude -180 to 180). Give BOTH or neither.
- "usp" (optional): one or two short sentences with the main selling points (amenities, nearby landmarks, special features).
- "parking_charge" (optional): ONE amount for parking, as "3 L", "1.5 L" or a plain rupee number such as 300000.
- "registration_pct" (optional): registration charge as a plain percentage number, e.g. 6 (not "6%").
- "floor_hike_per_floor" (optional): extra price per floor as a rupee amount, e.g. 50000 or "0.5 L".
- "types" (list): the unit types of the project (see below).

TYPE fields (inside "types"):
- "type" (text, REQUIRED): the type label such as "A", "B", "C". Must be unique inside the project. If the source has no labels, use A, B, C… in the order given.
- "configuration" (REQUIRED for a new type): one of ${configs}. Use exactly one of these names.
- "sqft" (optional): saleable/built-up area as a whole number of square feet.
- "available" (optional): number of units currently available, a whole number, 0 or more.
- "price" (optional): ONE all-inclusive price as "71 L", "1.06 Cr" or a plain rupee number such as 7100000.
- "sqft_rate" (optional): price per square foot as a whole number of rupees.

Rules:
- Money is always ONE amount, never a range. If the source gives a range for one type, use its starting price, or split it into separate types when the areas differ.
- Units: L = lakh (1 L = 100000), Cr = crore (1 Cr = 10000000). Do not use "K", "M", "k", "lakhs" or currency symbols.
- Numbers are plain JSON numbers or digit strings. No commas, no units such as "sqft".
- Leave out any field the source does not state. Do NOT guess, and do NOT write "NA", "TBD" or empty strings. Fields you leave out are not changed on projects that already exist.
- Keep names (project, location, type) as written in the source; do not translate or abbreviate.
- Do not add fields that are not listed above.`;
}
