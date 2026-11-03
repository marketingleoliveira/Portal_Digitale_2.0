import React, { useEffect, useState } from 'react';
import { supabase } from '@/integrations/local/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { MapPin, Clock, Loader2, ChevronLeft, ChevronRight, Route, List } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import LocationHistoryMap from './LocationHistoryMap';

interface LocationHistoryEntry {
  id: string;
  user_id: string;
  ip_address: string | null;
  latitude: number | null;
  longitude: number | null;
  city: string | null;
  region: string | null;
  country: string | null;
  recorded_at: string;
}

interface UserProfile {
  id: string;
  full_name: string;
  avatar_url: string | null;
}

interface LocationHistoryProps {
  vendedorIds: string[];
  profiles: UserProfile[];
}

const LocationHistory: React.FC<LocationHistoryProps> = ({ vendedorIds, profiles }) => {
  const [selectedUser, setSelectedUser] = useState<string>(profiles[0]?.id || 'all');
  const [history, setHistory] = useState<LocationHistoryEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [viewMode, setViewMode] = useState<'route' | 'list'>('route');
  const pageSize = 20;

  const fetchHistory = async (userId: string, pageNum: number) => {
    setLoading(true);
    try {
      let query = supabase
        .from('user_location_history')
        .select('*')
        .order('recorded_at', { ascending: false })
        .range(pageNum * pageSize, (pageNum + 1) * pageSize - 1);

      if (userId !== 'all') {
        query = query.eq('user_id', userId);
      } else {
        query = query.in('user_id', vendedorIds);
      }

      const { data, error } = await query;

      if (error) throw error;

      setHistory(data || []);
      setHasMore((data?.length || 0) === pageSize);
    } catch (error) {
      console.error('Error fetching location history:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (vendedorIds.length > 0) {
      fetchHistory(selectedUser, page);
    }
  }, [selectedUser, page, vendedorIds]);

  const getProfile = (userId: string) => {
    return profiles.find(p => p.id === userId);
  };

  const openGoogleMaps = (lat: number | null, lon: number | null) => {
    if (lat && lon) {
      window.open(`https://www.google.com/maps?q=${lat},${lon}`, '_blank');
    }
  };

  const getSelectedUserName = () => {
    if (selectedUser === 'all') return 'Todos';
    return profiles.find(p => p.id === selectedUser)?.full_name || 'Desconhecido';
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <CardTitle className="text-lg">Histórico de Localizações</CardTitle>
            <CardDescription>
              Registros dos últimos 30 dias
            </CardDescription>
          </div>
          <Select value={selectedUser} onValueChange={(v) => { setSelectedUser(v); setPage(0); }}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Selecionar vendedor" />
            </SelectTrigger>
            <SelectContent>
              {profiles.map(profile => (
                <SelectItem key={profile.id} value={profile.id}>
                  {profile.full_name}
                </SelectItem>
              ))}
              <SelectItem value="all">Todos os vendedores</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent>
        <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as 'route' | 'list')} className="w-full">
          <TabsList className="mb-4">
            <TabsTrigger value="route" className="flex items-center gap-2">
              <Route className="w-4 h-4" />
              Trajeto
            </TabsTrigger>
            <TabsTrigger value="list" className="flex items-center gap-2">
              <List className="w-4 h-4" />
              Lista
            </TabsTrigger>
          </TabsList>
          
          <TabsContent value="route">
            {selectedUser === 'all' ? (
              <div className="text-center py-8 text-muted-foreground border rounded-lg">
                <Route className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p>Selecione um vendedor para ver o trajeto</p>
                <p className="text-xs mt-1">O mapa de trajeto mostra o histórico de movimentação individual</p>
              </div>
            ) : (
              <LocationHistoryMap 
                userId={selectedUser} 
                userName={getSelectedUserName()} 
              />
            )}
          </TabsContent>
          
          <TabsContent value="list">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : history.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <MapPin className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p>Nenhum histórico encontrado</p>
          </div>
        ) : (
          <>
            <ScrollArea className="h-[400px] pr-4">
              <div className="space-y-3">
                {history.map((entry) => {
                  const profile = getProfile(entry.user_id);
                  return (
                    <div
                      key={entry.id}
                      className="flex items-start gap-3 p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
                    >
                      <div className="flex-shrink-0">
                        {profile?.avatar_url ? (
                          <img
                            src={profile.avatar_url}
                            alt={profile.full_name}
                            className="w-10 h-10 rounded-full object-cover"
                          />
                        ) : (
                          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                            <span className="text-primary font-medium text-sm">
                              {profile?.full_name?.charAt(0) || '?'}
                            </span>
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <p className="font-medium text-sm truncate">
                            {profile?.full_name || 'Desconhecido'}
                          </p>
                          <div className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Clock className="w-3 h-3" />
                            {format(new Date(entry.recorded_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                          <MapPin className="w-3 h-3 text-muted-foreground flex-shrink-0" />
                          <span className="text-sm text-muted-foreground truncate">
                            {entry.city ? `${entry.city}, ${entry.region}` : 'Local desconhecido'}
                          </span>
                        </div>
                        <div className="text-xs text-muted-foreground mt-1">
                          IP: {entry.ip_address}
                        </div>
                      </div>
                      {entry.latitude && entry.longitude && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openGoogleMaps(entry.latitude, entry.longitude)}
                        >
                          <MapPin className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
            
            <div className="flex items-center justify-between mt-4 pt-4 border-t">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage(p => Math.max(0, p - 1))}
                disabled={page === 0}
              >
                <ChevronLeft className="w-4 h-4 mr-1" />
                Anterior
              </Button>
              <span className="text-sm text-muted-foreground">
                Página {page + 1}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage(p => p + 1)}
                disabled={!hasMore}
              >
                Próxima
                <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            </div>
          </>
        )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
};

export default LocationHistory;