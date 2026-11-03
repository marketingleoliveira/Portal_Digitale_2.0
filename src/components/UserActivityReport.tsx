import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/local/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Loader2, X, Clock, Calendar, TrendingUp } from 'lucide-react';
import { useOnlineUsers } from '@/hooks/useOnlineUsers';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

interface UserProfile {
  id: string;
  full_name: string;
  email: string;
  avatar_url: string | null;
}

interface PresenceData {
  user_id: string;
  is_online: boolean;
}

interface Session {
  id: string;
  user_id: string;
  session_start: string;
  session_end: string | null;
  duration_seconds: number | null;
}

interface PeriodActivity {
  total_duration: number;
  session_count: number;
}

interface ActivityData {
  user_id: string;
  day: PeriodActivity;
  week: PeriodActivity;
  month: PeriodActivity;
  profile?: UserProfile;
}

interface UserActivityReportProps {
  onClose: () => void;
}

const UserActivityReport: React.FC<UserActivityReportProps> = ({ onClose }) => {
  const [loading, setLoading] = useState(true);
  const [activities, setActivities] = useState<ActivityData[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [profiles, setProfiles] = useState<UserProfile[]>([]);
  const { isUserOnline, onlineCount } = useOnlineUsers();
  const sessionsRef = useRef<Session[]>([]);
  const profilesRef = useRef<UserProfile[]>([]);
  const onlineUsersRef = useRef<Set<string>>(new Set());

  // Keep refs in sync with state
  useEffect(() => {
    sessionsRef.current = sessions;
  }, [sessions]);

  useEffect(() => {
    profilesRef.current = profiles;
  }, [profiles]);

  // Fetch initial data
  useEffect(() => {
    fetchInitialData();
  }, []);

  // Real-time subscription for session changes and presence
  useEffect(() => {
    const channel = supabase
      .channel('activity-sessions-realtime')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'user_activity_sessions',
        },
        (payload) => {
          setSessions(prev => [...prev, payload.new as Session]);
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'user_activity_sessions',
        },
        (payload) => {
          setSessions(prev => prev.filter(s => s.id !== (payload.old as Session).id));
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'user_presence',
        },
        (payload: any) => {
          const newData = payload.new;
          if (newData?.is_online) {
            onlineUsersRef.current.add(newData.user_id);
          } else if (newData?.user_id) {
            onlineUsersRef.current.delete(newData.user_id);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // Single interval to recalculate every second
  useEffect(() => {
    const interval = setInterval(() => {
      if (profilesRef.current.length > 0) {
        calculateActivities(sessionsRef.current, profilesRef.current);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, []);
  

  const getDateRanges = () => {
    const now = new Date();
    
    // Day: last 24 hours
    const dayStart = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    
    // Week: Monday to Friday of current week
    const currentDay = now.getDay(); // 0 = Sunday, 1 = Monday, etc.
    const daysFromMonday = currentDay === 0 ? 6 : currentDay - 1;
    const weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - daysFromMonday);
    weekStart.setHours(0, 0, 0, 0);
    
    // Month: last 30 days
    const monthStart = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    return {
      day: { start: dayStart.getTime() },
      week: { start: weekStart.getTime() },
      month: { start: monthStart.getTime() },
      queryStart: monthStart.toISOString(),
    };
  };

  const fetchInitialData = async () => {
    setLoading(true);
    try {
      const ranges = getDateRanges();

      // Fetch all profiles
      const { data: profilesData, error: profilesError } = await supabase
        .from('profiles')
        .select('id, full_name, email, avatar_url')
        .eq('is_active', true);

      if (profilesError) throw profilesError;

      // Fetch all sessions from the last 30 days
      const { data: sessionsData, error: sessionsError } = await supabase
        .from('user_activity_sessions')
        .select('id, user_id, duration_seconds, session_start, session_end')
        .gte('session_start', ranges.queryStart);

      if (sessionsError) throw sessionsError;

      // Fetch online users
      const { data: presenceData } = await supabase
        .from('user_presence')
        .select('user_id, is_online')
        .eq('is_online', true);

      setProfiles(profilesData || []);
      setSessions(sessionsData || []);
      if (presenceData) {
        onlineUsersRef.current = new Set(presenceData.map(p => p.user_id));
      }
      
      // Initial calculation
      if (profilesData && profilesData.length > 0) {
        calculateActivities(sessionsData || [], profilesData);
      }
    } catch (error) {
      console.error('Error fetching initial data:', error);
    } finally {
      setLoading(false);
    }
  };

  const calculateActivities = (sessionsData: Session[], profilesData: UserProfile[]) => {
    const ranges = getDateRanges();
    const { day: dayRange, week: weekRange, month: monthRange } = ranges;
    const now = Date.now();

    // Aggregate by user for each period
    const userActivityMap = new Map<string, { day: PeriodActivity; week: PeriodActivity; month: PeriodActivity }>();

    sessionsData.forEach(session => {
      const sessionStart = new Date(session.session_start).getTime();
      
      // Calculate duration - for active sessions, only count if user is ONLINE
      let duration: number;
      if (!session.session_end) {
        // Active session - only count real-time if user is ONLINE
        if (onlineUsersRef.current.has(session.user_id)) {
          duration = Math.floor((now - sessionStart) / 1000);
        } else {
          // User is offline, use stored duration_seconds
          duration = session.duration_seconds || 0;
        }
      } else {
        // Completed session - use stored duration or calculate from timestamps
        duration = session.duration_seconds || Math.floor((new Date(session.session_end).getTime() - sessionStart) / 1000);
      }

      const existing = userActivityMap.get(session.user_id) || {
        day: { total_duration: 0, session_count: 0 },
        week: { total_duration: 0, session_count: 0 },
        month: { total_duration: 0, session_count: 0 },
      };

      // Add to month if within 30 days
      if (sessionStart >= monthRange.start) {
        existing.month.total_duration += duration;
        existing.month.session_count += 1;
      }

      // Add to week if within week range (Monday to now)
      if (sessionStart >= weekRange.start) {
        existing.week.total_duration += duration;
        existing.week.session_count += 1;
      }

      // Add to day if within last 24 hours
      if (sessionStart >= dayRange.start) {
        existing.day.total_duration += duration;
        existing.day.session_count += 1;
      }

      userActivityMap.set(session.user_id, existing);
    });

    // Build activity data with profiles
    const activityData: ActivityData[] = profilesData.map(profile => {
      const activity = userActivityMap.get(profile.id);
      return {
        user_id: profile.id,
        day: activity?.day || { total_duration: 0, session_count: 0 },
        week: activity?.week || { total_duration: 0, session_count: 0 },
        month: activity?.month || { total_duration: 0, session_count: 0 },
        profile,
      };
    });

    // Sort by day duration descending
    activityData.sort((a, b) => b.day.total_duration - a.day.total_duration);

    setActivities(activityData);
  };

  const formatDuration = (seconds: number) => {
    if (seconds === 0) return '0s';
    
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    if (hours > 0) {
      return `${hours}h ${minutes}min ${secs}s`;
    }
    if (minutes > 0) {
      return `${minutes}min ${secs}s`;
    }
    return `${secs}s`;
  };

  const getTotals = () => {
    return activities.reduce(
      (acc, activity) => ({
        day: acc.day + activity.day.total_duration,
        week: acc.week + activity.week.total_duration,
        month: acc.month + activity.month.total_duration,
      }),
      { day: 0, week: 0, month: 0 }
    );
  };

  const totals = getTotals();

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h2 className="text-xl font-bold">Relatório de Atividade</h2>
          <Badge variant="outline" className="gap-1">
            <span className="w-2 h-2 rounded-full bg-success animate-pulse" />
            {onlineCount} online
          </Badge>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose}>
          <X className="w-5 h-5" />
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardHeader className="py-3 pb-1">
            <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-2">
              <Calendar className="w-4 h-4" />
              Tempo Total Hoje
            </CardTitle>
          </CardHeader>
          <CardContent className="py-2">
            <p className="text-2xl font-bold text-primary">{formatDuration(totals.day)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="py-3 pb-1">
            <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-2">
              <TrendingUp className="w-4 h-4" />
              Tempo Total Semana
            </CardTitle>
          </CardHeader>
          <CardContent className="py-2">
            <p className="text-2xl font-bold text-primary">{formatDuration(totals.week)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="py-3 pb-1">
            <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-2">
              <Clock className="w-4 h-4" />
              Tempo Total Mês
            </CardTitle>
          </CardHeader>
          <CardContent className="py-2">
            <p className="text-2xl font-bold text-primary">{formatDuration(totals.month)}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="py-3">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Atividade por Usuário
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Usuário</TableHead>
                  <TableHead className="text-center">Status</TableHead>
                  <TableHead className="text-right">Hoje</TableHead>
                  <TableHead className="text-right">Semana</TableHead>
                  <TableHead className="text-right">Mês</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {activities.map((activity) => {
                  const online = isUserOnline(activity.user_id);
                  return (
                    <TableRow key={activity.user_id}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div className="relative">
                            <Avatar className="w-8 h-8">
                              <AvatarImage src={activity.profile?.avatar_url || undefined} />
                              <AvatarFallback className="text-xs">
                                {activity.profile?.full_name?.charAt(0).toUpperCase()}
                              </AvatarFallback>
                            </Avatar>
                            {online && (
                              <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-success rounded-full border-2 border-background" />
                            )}
                          </div>
                          <div>
                            <p className="font-medium text-sm">
                              {activity.profile?.full_name}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {activity.profile?.email}
                            </p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant={online ? 'default' : 'secondary'} className="text-xs">
                          {online ? 'Online' : 'Offline'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {formatDuration(activity.day.total_duration)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {formatDuration(activity.week.total_duration)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {formatDuration(activity.month.total_duration)}
                      </TableCell>
                    </TableRow>
                  );
                })}
                {activities.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                      Nenhum dado de atividade encontrado
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default UserActivityReport;
