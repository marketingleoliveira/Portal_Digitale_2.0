import React, { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Users } from 'lucide-react';
import { useOnlineUsers } from '@/hooks/useOnlineUsers';
import { supabase } from '@/integrations/local/client';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from '@/components/ui/drawer';
import { ScrollArea } from '@/components/ui/scroll-area';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface UserProfile {
  id: string;
  full_name: string;
  avatar_url: string | null;
  email: string;
}

const OnlineUsersCard: React.FC = () => {
  const { onlineUsers, onlineCount, loading } = useOnlineUsers();
  const [profiles, setProfiles] = useState<Record<string, UserProfile>>({});
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const fetchProfiles = async () => {
      if (onlineUsers.length === 0) return;
      
      const userIds = onlineUsers.map(u => u.user_id);
      const { data } = await supabase
        .from('profiles')
        .select('id, full_name, avatar_url, email')
        .in('id', userIds);
      
      if (data) {
        const profileMap: Record<string, UserProfile> = {};
        data.forEach(p => {
          profileMap[p.id] = p;
        });
        setProfiles(profileMap);
      }
    };

    if (open) {
      fetchProfiles();
    }
  }, [onlineUsers, open]);

  return (
    <Drawer open={open} onOpenChange={setOpen}>
      <DrawerTrigger asChild>
        <Card className="hover:shadow-md transition-all hover:border-primary/50 cursor-pointer h-full">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">
                  Usuários Online
                </p>
                <div className="flex items-center gap-2 mt-1">
                  <p className="text-3xl font-bold">
                    {loading ? '-' : onlineCount}
                  </p>
                  <span className="w-2.5 h-2.5 rounded-full bg-success animate-pulse" />
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Em tempo real
                </p>
              </div>
              <div className="p-3 rounded-lg bg-success/10">
                <Users className="w-6 h-6 text-success" />
              </div>
            </div>
          </CardContent>
        </Card>
      </DrawerTrigger>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle className="flex items-center gap-2">
            <Users className="w-5 h-5 text-success" />
            Usuários Online ({onlineCount})
          </DrawerTitle>
        </DrawerHeader>
        <ScrollArea className="h-[50vh] px-4 pb-4">
          {onlineUsers.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              Nenhum usuário online no momento
            </p>
          ) : (
            <div className="space-y-2">
              {onlineUsers.map((user) => {
                const profile = profiles[user.user_id];
                return (
                  <div
                    key={user.user_id}
                    className="flex items-center gap-3 p-3 rounded-lg bg-muted/50"
                  >
                    <div className="relative">
                      <Avatar className="h-10 w-10">
                        <AvatarImage src={profile?.avatar_url || ''} />
                        <AvatarFallback>
                          {profile?.full_name?.charAt(0).toUpperCase() || '?'}
                        </AvatarFallback>
                      </Avatar>
                      <span className="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-success border-2 border-background" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">
                        {profile?.full_name || 'Usuário'}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">
                        {profile?.email || ''}
                      </p>
                    </div>
                    <div className="text-xs text-muted-foreground text-right">
                      {user.session_started && (
                        <span>
                          há {formatDistanceToNow(new Date(user.session_started), { locale: ptBR })}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </ScrollArea>
      </DrawerContent>
    </Drawer>
  );
};

export default OnlineUsersCard;
