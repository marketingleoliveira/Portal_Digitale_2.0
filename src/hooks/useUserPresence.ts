import { useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/local/client';
import { useAuth } from '@/contexts/AuthContext';

const HEARTBEAT_INTERVAL = 10 * 1000; // 10 seconds
const DURATION_UPDATE_INTERVAL = 1000; // 1 second

// Global flag to check if user is in a meeting (set by MeetingRoom)
let isUserInMeeting = false;

export const setUserInMeeting = (value: boolean) => {
  isUserInMeeting = value;
};

export const useUserPresence = () => {
  const { user, session } = useAuth();
  const sessionIdRef = useRef<string | null>(null);
  const sessionStartRef = useRef<Date | null>(null);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const durationUpdateRef = useRef<ReturnType<typeof setInterval> | null>(null);
  
  // Refs for function callbacks to avoid effect re-runs
  const startSessionRef = useRef<() => Promise<void>>();
  const endSessionRef = useRef<() => Promise<void>>();
  const updatePresenceRef = useRef<(isOnline: boolean) => Promise<void>>();
  const updateSessionDurationRef = useRef<() => Promise<void>>();

  const updatePresence = useCallback(async (isOnline: boolean) => {
    if (!user?.id) return;

    try {
      const now = new Date().toISOString();
      
      const { error } = await supabase
        .from('user_presence')
        .upsert({
          user_id: user.id,
          is_online: isOnline,
          last_seen: now,
          session_started: isOnline ? (sessionIdRef.current ? undefined : now) : null,
        }, {
          onConflict: 'user_id',
        });

      if (error) {
        console.error('Error updating presence:', error);
      }
    } catch (error) {
      console.error('Error in updatePresence:', error);
    }
  }, [user?.id]);

  // Update session duration in real-time (only duration, NOT session_end - that's for when session truly ends)
  const updateSessionDuration = useCallback(async () => {
    if (!user?.id || !sessionIdRef.current || !sessionStartRef.current) return;

    try {
      const now = new Date();
      const durationSeconds = Math.floor((now.getTime() - sessionStartRef.current.getTime()) / 1000);

      await supabase
        .from('user_activity_sessions')
        .update({
          duration_seconds: durationSeconds,
        })
        .eq('id', sessionIdRef.current);
    } catch (error) {
      console.error('Error updating session duration:', error);
    }
  }, [user?.id]);

  const startSession = useCallback(async () => {
    if (!user?.id) return;
    
    // If we already have a session, don't create a new one
    if (sessionIdRef.current && sessionStartRef.current) return;

    try {
      // First check if there's an active session for this user
      const { data: existingSession } = await supabase
        .from('user_activity_sessions')
        .select('id, session_start')
        .eq('user_id', user.id)
        .is('session_end', null)
        .order('session_start', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (existingSession) {
        // Resume existing session
        sessionIdRef.current = existingSession.id;
        sessionStartRef.current = new Date(existingSession.session_start);
        await updatePresence(true);
        return;
      }

      // Create new session
      const now = new Date();
      
      const { data, error } = await supabase
        .from('user_activity_sessions')
        .insert({
          user_id: user.id,
          session_start: now.toISOString(),
          duration_seconds: 0,
        })
        .select('id')
        .single();

      if (error) {
        console.error('Error starting session:', error);
        return;
      }

      sessionIdRef.current = data.id;
      sessionStartRef.current = now;
      await updatePresence(true);
    } catch (error) {
      console.error('Error in startSession:', error);
    }
  }, [user?.id, updatePresence]);

  const endSession = useCallback(async () => {
    if (!user?.id || !sessionIdRef.current || !sessionStartRef.current) return;

    try {
      const now = new Date();
      const durationSeconds = Math.floor((now.getTime() - sessionStartRef.current.getTime()) / 1000);

      // Set session_end only when session truly ends
      await supabase
        .from('user_activity_sessions')
        .update({
          duration_seconds: durationSeconds,
          session_end: now.toISOString(),
        })
        .eq('id', sessionIdRef.current);

      await updatePresence(false);
      sessionIdRef.current = null;
      sessionStartRef.current = null;
    } catch (error) {
      console.error('Error in endSession:', error);
    }
  }, [user?.id, updatePresence]);

  // Update refs when callbacks change
  startSessionRef.current = startSession;
  endSessionRef.current = endSession;
  updatePresenceRef.current = updatePresence;
  updateSessionDurationRef.current = updateSessionDuration;

  useEffect(() => {
    if (!user?.id) return;

    // Start session when hook mounts
    startSessionRef.current?.();

    // Heartbeat to keep presence alive
    heartbeatRef.current = setInterval(() => {
      updatePresenceRef.current?.(true);
    }, HEARTBEAT_INTERVAL);

    // Update duration every second for precise tracking
    durationUpdateRef.current = setInterval(() => {
      updateSessionDurationRef.current?.();
    }, DURATION_UPDATE_INTERVAL);

    // Handle visibility change - MINIMAL action, don't cause any UI updates
    const handleVisibilityChange = async () => {
      // If user is in a meeting, don't do anything at all
      if (isUserInMeeting) {
        return;
      }

      // Only update duration silently when hidden, no state changes that could cause re-renders
      if (document.hidden) {
        await updateSessionDurationRef.current?.();
      }
      // When user comes back, just silently update presence without causing re-renders
      // The heartbeat will handle keeping presence alive
    };

    // Encerramento da sessão usando exclusivamente
    // o backend local do Portal.
    const handleBeforeUnload = () => {
      if (!user?.id) return;

      const now = new Date();

      const durationSeconds =
        sessionStartRef.current
          ? Math.floor(
              (
                now.getTime() -
                sessionStartRef.current.getTime()
              ) / 1000
            )
          : 0;

      const token =
        (session as any)?.access_token ||
        (session as any)?.accessToken;

      if (!token) return;

      void fetch(
        '/api/functions/presence-unload',
        {
          method: 'POST',
          keepalive: true,
          headers: {
            'Content-Type':
              'application/json',
            Authorization:
              `Bearer ${token}`,
          },
          body: JSON.stringify({
            sessionId:
              sessionIdRef.current,
            sessionEnd:
              now.toISOString(),
            durationSeconds,
            lastSeen:
              now.toISOString(),
          }),
        }
      );
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      if (heartbeatRef.current) {
        clearInterval(heartbeatRef.current);
      }
      if (durationUpdateRef.current) {
        clearInterval(durationUpdateRef.current);
      }
      
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('beforeunload', handleBeforeUnload);
      endSessionRef.current?.();
    };
  }, [user?.id]);

  return { 
    updatePresence,
  };
};
