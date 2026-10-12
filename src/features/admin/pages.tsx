import { lazy, Suspense } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { AssetImage } from '../../components/AssetImage';
import { StatusBadge } from '../../components/StatusBadge';
import { formatINR } from '../../lib/money';
import { formatMonthYear } from '../../lib/month';
import { assetUrl } from '../../lib/storage';
import { useAuth } from '../auth/AuthProvider';
import { ResourcePage } from './ResourcePage';
import { useOptions } from './useOptions';

const LocationPicker = lazy(() => import('./LocationPicker'));

const dash = (v: unknown) => (v == null || v === '' ? '—' : String(v));

export function BuildersPage() {
  return (
    <ResourcePage
      title="Builders"
      singular="builder"
      description="Brands that build the projects."
      table="builders"
      select="*, projects(count)"
      order="name"
      deleteWarning="Builders that still have projects cannot be deleted."
      columns={[
        {
          header: 'Name',
          cell: (r) => (
            <div className="flex items-center gap-3">
              <AssetImage path={r.logo_path} className="h-8 w-12 object-contain" />
              <span className="font-medium">{r.name}</span>
            </div>
          ),
        },
        { header: 'Projects', cell: (r) => r.projects?.[0]?.count ?? 0 },
      ]}
      fields={[
        { name: 'name', label: 'Name', kind: 'text', required: true },
        {
          name: 'logo_path', label: 'Logo', kind: 'file', folder: 'builder-logos', maxMB: 5, crop: true,
          accept: 'image/png,image/jpeg,image/webp', hint: 'PNG, JPG or WebP, up to 5 MB. You can crop it after choosing. A transparent PNG works best.',
        },
      ]}
    />
  );
}

export function ConfigurationsPage() {
  return (
    <ResourcePage
      title="Configurations"
      singular="configuration"
      description="Unit configurations such as 2BHK or 3BHK. Sort order controls how they are listed."
      table="configurations"
      select="*, unit_types(count)"
      order="sort_order"
      deleteWarning="Configurations that are used by types cannot be deleted."
      columns={[
        { header: 'Name', cell: (r) => <span className="font-medium">{r.name}</span> },
        { header: 'Sort order', cell: (r) => r.sort_order },
        { header: 'Types', cell: (r) => r.unit_types?.[0]?.count ?? 0 },
      ]}
      fields={[
        { name: 'name', label: 'Name', kind: 'text', required: true, hint: 'e.g. 2BHK, Studio, Villa' },
        { name: 'sort_order', label: 'Sort order', kind: 'number', integer: true, required: true, defaultValue: '0' },
      ]}
    />
  );
}

export function LeadSourcesPage() {
  return (
    <ResourcePage
      title="Lead sources"
      singular="lead source"
      description="Where leads come from, e.g. Walk-in, Website, Referral. Drag to change the order they are listed in."
      table="lead_sources"
      select="*, lead_source_links(count)"
      order="sort_order"
      reorderable
      deleteWarning="Lead sources that are used by leads cannot be deleted."
      columns={[
        { header: 'Name', cell: (r) => <span className="font-medium">{r.name}</span> },
        { header: 'Leads', cell: (r) => r.lead_source_links?.[0]?.count ?? 0 },
      ]}
      fields={[{ name: 'name', label: 'Name', kind: 'text', required: true }]}
    />
  );
}

export function TaskTypesPage() {
  return (
    <ResourcePage
      title="Task types"
      singular="task type"
      description="Kinds of tasks you can add to a lead, e.g. Site visit or Follow-up call. Drag to change the order."
      table="task_types"
      select="*, lead_tasks(count)"
      order="sort_order"
      reorderable
      deleteWarning="Task types that are used by tasks cannot be deleted."
      columns={[
        { header: 'Name', cell: (r) => <span className="font-medium">{r.name}</span> },
        { header: 'Tasks', cell: (r) => r.lead_tasks?.[0]?.count ?? 0 },
      ]}
      fields={[{ name: 'name', label: 'Name', kind: 'text', required: true }]}
    />
  );
}

export function LeadStatusesPage() {
  return (
    <ResourcePage
      title="Lead statuses"
      singular="lead status"
      description="The stages a lead moves through. Drag to change the order; new leads start at the first one."
      table="lead_statuses"
      select="*, leads(count)"
      order="sort_order"
      reorderable
      deleteWarning="Statuses that are used by leads cannot be deleted."
      columns={[
        { header: 'Name', cell: (r) => <span className="font-medium">{r.name}</span> },
        { header: 'Leads', cell: (r) => r.leads?.[0]?.count ?? 0 },
      ]}
      fields={[{ name: 'name', label: 'Name', kind: 'text', required: true }]}
    />
  );
}

export function LocationsPage() {
  return (
    <ResourcePage
      title="Locations"
      singular="location"
      description="Areas where projects are located."
      table="locations"
      select="*, projects(count)"
      order="name"
      deleteWarning="Locations that still have projects cannot be deleted."
      columns={[
        { header: 'Name', cell: (r) => <span className="font-medium">{r.name}</span> },
        { header: 'Projects', cell: (r) => r.projects?.[0]?.count ?? 0 },
      ]}
      fields={[{ name: 'name', label: 'Name', kind: 'text', required: true }]}
    />
  );
}

export function ProjectsPage() {
  const builders = useOptions('builders', 'name');
  const locations = useOptions('locations', 'name');
  return (
    <ResourcePage
      title="Projects"
      singular="project"
      description="Add types (A, B, C…) for each project on the Types page."
      table="projects"
      select="*, builders(name), locations(name), project_files(count)"
      order="name"
      deleteWarning="All types and files of this project are deleted too."
      collectAssets={async (row) => {
        const [files, types] = await Promise.all([
          supabase.from('project_files').select('path').eq('project_id', row.id),
          supabase.from('unit_types').select('layout_path').eq('project_id', row.id),
        ]);
        return [...(files.data ?? []).map((f) => f.path), ...(types.data ?? []).map((t) => t.layout_path)].filter(Boolean);
      }}
      columns={[
        {
          header: 'Project',
          cell: (r) => (
            <div className="flex items-center gap-3">
              <AssetImage path={r.thumbnail_path} className="size-10 rounded-md object-cover" />
              <span className="font-medium">{r.name}</span>
            </div>
          ),
        },
        { header: 'Builder', cell: (r) => dash(r.builders?.name) },
        { header: 'Location', cell: (r) => r.locations?.name },
        { header: 'Map', cell: (r) => (r.latitude == null ? '—' : `${r.latitude}, ${r.longitude}`) },
        { header: 'Status', cell: (r) => <StatusBadge status={r.status} /> },
        { header: 'Kind', cell: (r) => <span className="capitalize">{r.property_type}</span> },
        { header: 'Possession', cell: (r) => <span className="whitespace-nowrap">{formatMonthYear(r.possession_date)}</span> },
        { header: 'Floors', cell: (r) => dash(r.total_floor_count) },
        { header: 'Units', cell: (r) => dash(r.total_units) },
        { header: 'Parking', cell: (r) => formatINR(r.parking_charge) },
        { header: 'Reg', cell: (r) => (r.registration_pct == null ? 'NA' : `${r.registration_pct}%`) },
        { header: 'Floor hike', cell: (r) => dash(r.floor_hike_per_floor) },
        {
          header: 'Files',
          cell: (r) => (
            <Link className="whitespace-nowrap text-indigo-600 underline" to={`/projects/${r.id}`}>
              {r.project_files?.[0]?.count ?? 0} files · Details
            </Link>
          ),
        },
        { header: 'USP', cell: (r) => <span className="line-clamp-2 min-w-48 text-slate-600">{dash(r.usp)}</span> },
      ]}
      fields={[
        { name: 'name', label: 'Project name', kind: 'text', required: true },
        { name: 'builder_id', label: 'Builder', kind: 'select', required: true, options: builders },
        { name: 'location_id', label: 'Location', kind: 'select', required: true, options: locations },
        {
          name: 'property_type',
          label: 'Kind',
          kind: 'select',
          required: true,
          defaultValue: 'apartment',
          options: [
            { value: 'apartment', label: 'Apartment' },
            { value: 'villa', label: 'Villa' },
          ],
        },
        {
          name: 'status',
          label: 'Status',
          kind: 'select',
          required: true,
          defaultValue: 'off_plan',
          options: [
            { value: 'ready_to_move', label: 'Ready to move' },
            { value: 'off_plan', label: 'Off-plan' },
          ],
        },
        { name: 'possession_date', label: 'Possession', kind: 'month', hint: 'Month and year the project is handed over. Leave empty if not known.' },
        { name: 'total_floor_count', label: 'Total floors', kind: 'number', integer: true, hint: 'Leave empty for villas.' },
        { name: 'total_units', label: 'Total units', kind: 'number', integer: true },
        { name: 'latitude', label: 'Latitude', kind: 'number', hint: 'In Google Maps, right-click the site and click the coordinates to copy them, e.g. 10.015900, 76.341900.' },
        { name: 'longitude', label: 'Longitude', kind: 'number', hint: 'Latitude and longitude must be filled together.' },
        {
          name: 'map',
          label: 'Pin on map',
          kind: 'custom',
          render: ({ values, setValues }) => (
            <Suspense fallback={<p className="text-sm text-slate-500">Loading map…</p>}>
              <LocationPicker
                lat={values.latitude ?? ''}
                lng={values.longitude ?? ''}
                onChange={(latitude, longitude) => setValues({ latitude, longitude })}
              />
            </Suspense>
          ),
        },
        { name: 'usp', label: 'USP', kind: 'textarea' },
        {
          name: 'thumbnail_path', label: 'Thumbnail', kind: 'file', folder: 'thumbnails', maxMB: 5,
          accept: 'image/png,image/jpeg,image/webp', hint: 'PNG, JPG or WebP, up to 5 MB.',
        },
        { name: 'parking_charge', label: 'Parking charge', kind: 'money', hint: 'e.g. 3 L or 300000. Leave empty for NA.' },
        { name: 'registration_pct', label: 'Registration %', kind: 'number', hint: 'e.g. 6. Leave empty for NA.' },
        { name: 'floor_hike_per_floor', label: 'Floor hike (per floor)', kind: 'number', integer: true },
      ]}
    />
  );
}

export function TypesPage() {
  const projects = useOptions('projects', 'name');
  const configurations = useOptions('configurations', 'name', 'sort_order');
  return (
    <ResourcePage
      title="Types"
      singular="type"
      description="Each type (A, B, C…) belongs to a project and maps to one configuration and one sqft."
      table="unit_types"
      select="*, projects(name), configurations(name, sort_order)"
      sort={(a, b) =>
        (a.projects?.name ?? '').localeCompare(b.projects?.name ?? '') ||
        (a.configurations?.sort_order ?? 0) - (b.configurations?.sort_order ?? 0) ||
        a.type_name.localeCompare(b.type_name)
      }
      columns={[
        { header: 'Project', cell: (r) => <span className="font-medium">{r.projects?.name}</span> },
        { header: 'Type', cell: (r) => `Type ${r.type_name}` },
        { header: 'Config', cell: (r) => r.configurations?.name },
        { header: 'Sqft', cell: (r) => dash(r.sqft) },
        { header: 'Available', cell: (r) => r.available_count },
        { header: 'Price', cell: (r) => formatINR(r.price) },
        { header: 'Sqft rate', cell: (r) => dash(r.sqft_rate) },
        {
          header: 'Layout',
          cell: (r) => (r.layout_path ? <a className="text-indigo-600 underline" href={assetUrl(r.layout_path)!} target="_blank" rel="noreferrer">View</a> : '—'),
        },
      ]}
      fields={[
        { name: 'project_id', label: 'Project', kind: 'select', required: true, options: projects },
        { name: 'type_name', label: 'Type', kind: 'text', required: true, hint: 'A, B, C… must be unique within the project.' },
        { name: 'configuration_id', label: 'Configuration', kind: 'select', required: true, options: configurations },
        { name: 'sqft', label: 'Sqft', kind: 'number', integer: true },
        { name: 'available_count', label: 'Available', kind: 'number', integer: true, required: true, defaultValue: '0' },
        { name: 'price', label: 'Price (including)', kind: 'money', hint: 'e.g. 71 L, 1.06 Cr or 7100000.' },
        { name: 'sqft_rate', label: 'Sqft rate', kind: 'number', integer: true },
        {
          name: 'layout_path', label: 'Layout', kind: 'file', folder: 'layouts', maxMB: 20,
          accept: 'application/pdf,image/png,image/jpeg,image/webp', hint: 'Floor layout of this type. PDF or image, up to 20 MB.',
        },
      ]}
    />
  );
}

export function UsersPage() {
  const { session } = useAuth();
  return (
    <ResourcePage
      title="Users"
      singular="user"
      description="Create logins in the Supabase dashboard (Authentication → Users); they appear here as viewers. Change roles here."
      table="profiles"
      order="email"
      canCreate={false}
      canDelete={false}
      columns={[
        { header: 'Email', cell: (r) => <span className="font-medium">{dash(r.email)}</span> },
        { header: 'Name', cell: (r) => dash(r.full_name) },
        { header: 'Role', cell: (r) => <span className="capitalize">{r.role}</span> },
      ]}
      fields={[
        { name: 'full_name', label: 'Name', kind: 'text' },
        {
          name: 'role',
          label: 'Role',
          kind: 'select',
          required: true,
          options: [
            { value: 'admin', label: 'Admin' },
            { value: 'editor', label: 'Editor' },
            { value: 'viewer', label: 'Viewer' },
          ],
          hint: 'Admins manage users; editors change data; viewers are read-only. You cannot change your own role.',
          disabled: (row) => row?.id === session?.user.id,
        },
      ]}
    />
  );
}
