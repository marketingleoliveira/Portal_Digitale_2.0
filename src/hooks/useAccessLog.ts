import { supabase } from '@/integrations/local/client';
import { useAuth } from '@/contexts/AuthContext';
import { useCallback } from 'react';

type LogAction = 'login' | 'download' | 'view';
type ResourceType = 'file' | 'product' | 'catalog' | 'technical_sheet' | 'link';

export const useAccessLog = () => {
  const { user } = useAuth();

  const logAction = useCallback(async (
    action: LogAction,
    resourceType?: ResourceType,
    resourceId?: string
  ) => {
    if (!user?.id) {
      console.warn('Cannot log action: user not authenticated');
      return;
    }

    try {
      const { error } = await supabase
        .from('access_logs')
        .insert({
          user_id: user.id,
          action,
          resource_type: resourceType || null,
          resource_id: resourceId || null,
        });

      if (error) {
        console.error('Error logging action:', error);
      } else {
        console.log(`Logged ${action} for ${resourceType || 'system'}`);
      }
    } catch (error) {
      console.error('Error logging action:', error);
    }
  }, [user?.id]);

  const logDownload = useCallback((resourceType: ResourceType, resourceId?: string) => {
    return logAction('download', resourceType, resourceId);
  }, [logAction]);

  const logView = useCallback((resourceType: ResourceType, resourceId?: string) => {
    return logAction('view', resourceType, resourceId);
  }, [logAction]);

  return {
    logAction,
    logDownload,
    logView,
  };
};
