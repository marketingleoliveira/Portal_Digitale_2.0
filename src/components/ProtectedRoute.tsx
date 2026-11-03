import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { AppRole } from '@/types/auth';
import { Loader2 } from 'lucide-react';

interface ProtectedRouteProps {
  children: React.ReactNode;
  allowedRoles?: AppRole[];
  allowedEmails?: string[];
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children, allowedRoles, allowedEmails }) => {
  const { user, session, loading } = useAuth();
  const location = useLocation();

  // Show loading while auth or user data is being fetched
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Carregando...</p>
        </div>
      </div>
    );
  }

  // Not authenticated - redirect to login
  if (!session || !user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (allowedEmails && !allowedEmails.includes(user.email.trim().toLowerCase())) {
    return <Navigate to="/dashboard" replace />;
  }

  // Após autenticação válida por e-mail e senha,
  // perfil ausente ou status de aprovação não bloqueiam
  // mais a entrada no Portal.
  // As restrições específicas por função continuam abaixo.

  // Role-based access check (DEV has full access)
  if (allowedRoles && allowedRoles.length > 0) {
    // If user has no role assigned yet, redirect to dashboard (safe default)
    if (!user.role) {
      return <Navigate to="/dashboard" replace />;
    }
    
    // Check if user has permission (DEV, DIRETORIA and GERENTE always have full access)
    const hasAccess = allowedRoles.includes(user.role) || user.role === 'dev' || user.role === 'diretoria' || user.role === 'gerente';
    if (!hasAccess) {
      return <Navigate to="/dashboard" replace />;
    }
  }

  return <>{children}</>;
};

export default ProtectedRoute;
