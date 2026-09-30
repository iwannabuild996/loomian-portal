import { Navigate, Outlet } from 'react-router-dom';
import { useAuth, type Role } from './AuthProvider';

export function RequireRole({ roles }: { roles: Role[] }) {
  const { role } = useAuth();
  if (!role || !roles.includes(role)) return <Navigate to="/" replace />;
  return <Outlet />;
}
