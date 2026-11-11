import { Navigate, Outlet } from 'react-router-dom';
import { useAuth, type Role } from './AuthProvider';

export function RequireRole({ roles, redirectTo = '/' }: { roles: Role[]; redirectTo?: string }) {
  const { role } = useAuth();
  if (!role || !roles.includes(role)) return <Navigate to={redirectTo} replace />;
  return <Outlet />;
}
