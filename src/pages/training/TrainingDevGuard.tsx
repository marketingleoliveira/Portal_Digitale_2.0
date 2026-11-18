import { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Loader2 } from 'lucide-react';

export default function TrainingDevGuard({
  children
}: { children: ReactNode }) {
  const { loading, user, realRole } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (!user || realRole !== 'dev') {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
}
