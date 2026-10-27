import { useOptions } from './useOptions';
import type { Field } from './ResourcePage';

/** Form fields for a unit type. Inside a project, leave the project out and pass it as `fixed` to FormModal. */
export function useTypeFields(withProject: boolean): Field[] {
  const projects = useOptions('projects', 'name');
  const configurations = useOptions('configurations', 'name', 'sort_order');
  return [
    ...(withProject ? [{ name: 'project_id', label: 'Project', kind: 'select', required: true, options: projects } as Field] : []),
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
  ];
}
