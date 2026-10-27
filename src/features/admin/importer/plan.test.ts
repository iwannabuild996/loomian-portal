import { describe, expect, it } from 'vitest';
import { buildPlan, parseJson, planErrors, type Existing } from './plan';

const existing: Existing = {
  builders: [{ id: 'b1', name: 'Acme' }],
  locations: [{ id: 'l1', name: 'Kakkanad' }],
  configurations: [{ id: 'c2', name: '2BHK' }, { id: 'c3', name: '3BHK' }],
  projects: [{ id: 'p1', name: 'Sky', builder_id: 'b1', location_id: 'l1', status: 'off_plan', total_units: 10, latitude: null, longitude: null }],
  types: [{ id: 't1', project_id: 'p1', type_name: 'A', configuration_id: 'c2', sqft: 1000, price: 7_100_000, available_count: 3 }],
};

describe('parseJson', () => {
  it('strips markdown fences', () => {
    expect(parseJson('```json\n{"a":1}\n```')).toEqual({ value: { a: 1 } });
  });
  it('reports invalid JSON', () => {
    expect('error' in parseJson('{oops')).toBe(true);
  });
});

describe('buildPlan', () => {
  it('creates a new project and flags a new location', () => {
    const plan = buildPlan({ projects: [{ name: 'Moon', location: 'Edappally', kind: 'Villa', types: [{ type: 'A', configuration: '3 BHK', price: '1.2 Cr' }] }] }, existing, 'b1');
    expect(planErrors(plan)).toEqual([]);
    expect(plan.newLocations).toEqual(['Edappally']);
    expect(plan.projects[0].payload).toEqual({ property_type: 'villa' });
    expect(plan.projects[0].types[0].payload).toEqual({ price: 12_000_000, configuration_id: 'c3' });
  });

  it('only lists changed fields on an existing project and type', () => {
    const plan = buildPlan({ name: 'sky', location: 'Kakkanad', total_units: 10, status: 'ready to move', types: [{ type: 'A', sqft: 1000, price: '72 L' }] }, existing, 'b1');
    const p = plan.projects[0];
    expect(p.action).toBe('update');
    expect(p.payload).toEqual({ status: 'ready_to_move' });
    expect(p.types[0]).toMatchObject({ action: 'update', payload: { price: 7_200_000 } });
  });

  it('reports unknown configurations, ranges and half coordinates', () => {
    const plan = buildPlan({ projects: [{ name: 'X', location: 'Kakkanad', latitude: 10, types: [{ type: 'A', configuration: '5BHK', price: '71 - 79 L' }] }] }, existing, 'b1');
    const errs = planErrors(plan).join('\n');
    expect(errs).toMatch(/latitude and longitude/);
    expect(errs).toMatch(/5BHK/);
    expect(errs).toMatch(/not a range|one amount/);
  });

  it('refuses to move a project that belongs to another builder', () => {
    const plan = buildPlan({ name: 'Sky', types: [] }, { ...existing, builders: [...existing.builders, { id: 'b2', name: 'Other' }] }, 'b2');
    expect(planErrors(plan).join()).toMatch(/already exists under "Acme"/);
  });

  it('marks an identical project as unchanged', () => {
    const plan = buildPlan({ name: 'Sky', types: [{ type: 'A', configuration: '2BHK', sqft: 1000 }] }, existing, 'b1');
    expect(plan.projects[0].action).toBe('unchanged');
  });
});
