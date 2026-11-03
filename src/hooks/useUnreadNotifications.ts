import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/local/client';
import { useAuth } from '@/contexts/AuthContext';

interface UnreadCount {
  groupNotifications: number;
  userNotifications: number;
  total: number;
}

export const useUnreadNotifications = () => {
  const { user } = useAuth();
  const [unreadCount, setUnreadCount] = useState<UnreadCount>({
    groupNotifications: 0,
    userNotifications: 0,
    total: 0,
  });
  const [loading, setLoading] = useState(true);

  const fetchUnreadCount = useCallback(async () => {
    if (!user?.id || !user?.role) return;

    try {
      // Get all group notifications visible to user's role
      const { data: groupNotifications, error: groupError } = await supabase
        .from('notifications')
        .select('id')
        .contains('visible_to_roles', [user.role]);

      if (groupError) throw groupError;

      // Get read group notifications
      const { data: readGroupNotifications, error: readGroupError } = await supabase
        .from('notification_reads')
        .select('notification_id')
        .eq('user_id', user.id)
        .not('notification_id', 'is', null);

      if (readGroupError) throw readGroupError;

      const readGroupIds = new Set(readGroupNotifications?.map(r => r.notification_id) || []);
      const unreadGroupCount = groupNotifications?.filter(n => !readGroupIds.has(n.id)).length || 0;

      // Get user-specific notifications
      const { data: userNotifications, error: userError } = await supabase
        .from('user_notifications')
        .select('id')
        .eq('target_user_id', user.id);

      if (userError) throw userError;

      // Get read user notifications
      const { data: readUserNotifications, error: readUserError } = await supabase
        .from('notification_reads')
        .select('user_notification_id')
        .eq('user_id', user.id)
        .not('user_notification_id', 'is', null);

      if (readUserError) throw readUserError;

      const readUserIds = new Set(readUserNotifications?.map(r => r.user_notification_id) || []);
      const unreadUserCount = userNotifications?.filter(n => !readUserIds.has(n.id)).length || 0;

      setUnreadCount({
        groupNotifications: unreadGroupCount,
        userNotifications: unreadUserCount,
        total: unreadGroupCount + unreadUserCount,
      });
    } catch (error) {
      console.error('Error fetching unread notifications:', error);
    } finally {
      setLoading(false);
    }
  }, [user?.id, user?.role]);

  const markAllAsRead = async () => {
    if (!user?.id || !user?.role) return;

    try {
      // Get all unread group notifications
      const { data: groupNotifications } = await supabase
        .from('notifications')
        .select('id')
        .contains('visible_to_roles', [user.role]);

      const { data: readGroupNotifications } = await supabase
        .from('notification_reads')
        .select('notification_id')
        .eq('user_id', user.id)
        .not('notification_id', 'is', null);

      const readGroupIds = new Set(readGroupNotifications?.map(r => r.notification_id) || []);
      const unreadGroupNotifications = groupNotifications?.filter(n => !readGroupIds.has(n.id)) || [];

      // Get all unread user notifications
      const { data: userNotifications } = await supabase
        .from('user_notifications')
        .select('id')
        .eq('target_user_id', user.id);

      const { data: readUserNotifications } = await supabase
        .from('notification_reads')
        .select('user_notification_id')
        .eq('user_id', user.id)
        .not('user_notification_id', 'is', null);

      const readUserIds = new Set(readUserNotifications?.map(r => r.user_notification_id) || []);
      const unreadUserNotifications = userNotifications?.filter(n => !readUserIds.has(n.id)) || [];

      // Insert read records for group notifications
      if (unreadGroupNotifications.length > 0) {
        const groupReads = unreadGroupNotifications.map(n => ({
          user_id: user.id,
          notification_id: n.id,
        }));

        await supabase.from('notification_reads').insert(groupReads);
      }

      // Insert read records for user notifications
      if (unreadUserNotifications.length > 0) {
        const userReads = unreadUserNotifications.map(n => ({
          user_id: user.id,
          user_notification_id: n.id,
        }));

        await supabase.from('notification_reads').insert(userReads);
      }

      setUnreadCount({ groupNotifications: 0, userNotifications: 0, total: 0 });
    } catch (error) {
      console.error('Error marking notifications as read:', error);
    }
  };

  useEffect(() => {
    fetchUnreadCount();
  }, [fetchUnreadCount]);

  return {
    unreadCount,
    loading,
    markAllAsRead,
    refetch: fetchUnreadCount,
  };
};