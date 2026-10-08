import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from './features/auth/AuthProvider';
import { LoginPage } from './features/auth/LoginPage';
import { RequireAuth } from './features/auth/RequireAuth';
import { AppLayout } from './components/AppLayout';
import { RequireRole } from './features/auth/RequireRole';
import { AuditPage } from './features/admin/AuditPage';
import { LeadsPage } from './features/leads/LeadsPage';
import { LeadDetailPage } from './features/leads/LeadDetailPage';
import { TasksPage } from './features/tasks/TasksPage';
import { MeetingsPage } from './features/meetings/MeetingsPage';
import { BuildersPage, ConfigurationsPage, LeadSourcesPage, LeadStatusesPage, LocationsPage, TaskTypesPage, ProjectsPage, TypesPage, UsersPage } from './features/admin/pages';
import { SettingsPage } from './features/settings/SettingsPage';
import { ProjectDetailPage } from './features/projects/ProjectDetailPage';
import { InventoryPage } from './features/inventory/InventoryPage';


const queryClient = new QueryClient();

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route element={<RequireAuth />}>
              <Route element={<AppLayout />}>
                <Route path="/" element={<InventoryPage />} />
                <Route path="/leads" element={<LeadsPage />} />
                <Route path="/leads/:id" element={<LeadDetailPage />} />
                <Route path="/tasks" element={<TasksPage />} />
                <Route path="/meetings" element={<MeetingsPage />} />
                <Route path="/projects/:id" element={<ProjectDetailPage />} />
                <Route path="/settings" element={<SettingsPage />} />
                <Route element={<RequireRole roles={['admin', 'editor']} />}>
                  <Route path="/admin/projects" element={<ProjectsPage />} />
                  <Route path="/admin/types" element={<TypesPage />} />
                  <Route path="/admin/builders" element={<BuildersPage />} />
                  <Route path="/admin/locations" element={<LocationsPage />} />
                  <Route path="/admin/lead-sources" element={<LeadSourcesPage />} />
                  <Route path="/admin/lead-statuses" element={<LeadStatusesPage />} />
                  <Route path="/admin/task-types" element={<TaskTypesPage />} />
                  <Route path="/admin/configurations" element={<ConfigurationsPage />} />
                  <Route path="/admin/audit" element={<AuditPage />} />
                </Route>
                <Route element={<RequireRole roles={['admin']} />}>
                  <Route path="/admin/users" element={<UsersPage />} />
                </Route>
              </Route>
            </Route>
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
}
