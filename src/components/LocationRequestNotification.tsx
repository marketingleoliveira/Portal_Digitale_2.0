import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/local/client';
import { useAuth } from '@/contexts/AuthContext';
import { MapPin, X, Check, Loader2, MapPinOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

interface GeoLocationData {
  ip: string;
  latitude: number;
  longitude: number;
  city: string;
  region: string;
  country: string;
  source: 'gps' | 'ip';
}

// Get precise location using browser's Geolocation API (GPS)
const getBrowserGeolocation = (): Promise<GeolocationPosition> => {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocation not supported'));
      return;
    }
    
    navigator.geolocation.getCurrentPosition(
      resolve,
      reject,
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0,
      }
    );
  });
};

// Reverse geocoding through the Portal backend, using OpenStreetMap data.
const reverseGeocode = async (lat: number, lng: number): Promise<{ city: string; region: string; country: string }> => {
  try {
    const { data, error } = await supabase.functions.invoke('reverse-geocode', {
      body: { lat, lng },
    });

    if (!error && data) {
      return {
        city: data.city || 'Unknown',
        region: data.region || 'Unknown',
        country: data.country || 'Unknown',
      };
    }
  } catch (error) {
    console.error('Reverse geocoding failed:', error);
  }

  return {
    city: 'Unknown',
    region: 'Unknown',
    country: 'Unknown',
  };
};

const fetchGeoLocation = async (): Promise<GeoLocationData | null> => {
  try {
    // First, try to get precise location from browser GPS
    try {
      const position = await getBrowserGeolocation();
      const { latitude, longitude } = position.coords;
      
      // Get city/region from coordinates
      const locationInfo = await reverseGeocode(latitude, longitude);
      
      // Get IP address from edge function
      const { data: ipData } = await supabase.functions.invoke('get-geolocation');
      
      console.log('GPS location obtained:', { latitude, longitude, ...locationInfo });
      
      return {
        ip: ipData?.ip || 'Unknown',
        latitude,
        longitude,
        city: locationInfo.city,
        region: locationInfo.region,
        country: locationInfo.country,
        source: 'gps' as const,
      };
    } catch (gpsError) {
      console.log('GPS failed, falling back to IP geolocation:', gpsError);
    }
    
    // Fallback to IP-based geolocation
    const { data, error } = await supabase.functions.invoke('get-geolocation');
    
    if (error) {
      console.error('Error from edge function:', error);
      return null;
    }
    
    if (data && data.ip && data.latitude) {
      return {
        ip: data.ip,
        latitude: data.latitude,
        longitude: data.longitude,
        city: data.city || 'Unknown',
        region: data.region || 'Unknown',
        country: data.country || 'Unknown',
        source: 'ip' as const,
      };
    }
    
    return null;
  } catch (error) {
    console.error('Error fetching geolocation:', error);
    return null;
  }
};

export const LocationRequestNotification: React.FC = () => {
  const { user } = useAuth();
  const [showConsentModal, setShowConsentModal] = useState(false);
  const [showAdminRequestModal, setShowAdminRequestModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hasCheckedPreference, setHasCheckedPreference] = useState(false);

  const isVendedor = user?.role === 'vendedor';

  useEffect(() => {
    const checkLocationPreference = async () => {
      if (!user?.id || !isVendedor) {
        setHasCheckedPreference(true);
        return;
      }

      try {
        const { data: profile, error } = await supabase
          .from('profiles')
          .select('location_sharing_enabled')
          .eq('id', user.id)
          .single();

        if (error) {
          console.error('Error fetching profile:', error);
          setHasCheckedPreference(true);
          return;
        }

        // If preference is null (never asked), show the consent modal
        if (profile?.location_sharing_enabled === null) {
          setShowConsentModal(true);
        } else if (profile?.location_sharing_enabled === true) {
          // User has already consented, automatically update location
          await updateLocation();
        }
        // If false, user declined, don't show anything automatically

        setHasCheckedPreference(true);
      } catch (error) {
        console.error('Error checking location preference:', error);
        setHasCheckedPreference(true);
      }
    };

    checkLocationPreference();
  }, [user?.id, isVendedor]);

  // Listen for admin location requests (only for users who previously declined)
  useEffect(() => {
    if (!user?.id || !isVendedor) return;

    const channel = supabase
      .channel('location-request-notification')
      .on('broadcast', { event: 'request-location-update' }, async (payload) => {
        const userIds = payload.payload?.user_ids || [];
        if (userIds.includes(user.id)) {
          // Check if user has already enabled location sharing
          const { data: profile } = await supabase
            .from('profiles')
            .select('location_sharing_enabled')
            .eq('id', user.id)
            .single();

          if (profile?.location_sharing_enabled === true) {
            // Already consented, just update location silently
            await updateLocation();
          } else {
            // Show the admin request modal
            setShowAdminRequestModal(true);
          }
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, isVendedor]);

  const updateLocation = async () => {
    if (!user?.id) return;

    const geoData = await fetchGeoLocation();
    if (!geoData) {
      console.log('Could not fetch geolocation data');
      return;
    }

    const { error: upsertError } = await supabase
      .from('user_locations')
      .upsert({
        user_id: user.id,
        ip_address: geoData.ip,
        latitude: geoData.latitude,
        longitude: geoData.longitude,
        city: geoData.city,
        region: geoData.region,
        country: geoData.country,
        location_source: geoData.source,
        last_updated: new Date().toISOString(),
      }, {
        onConflict: 'user_id',
      });

    if (upsertError) {
      console.error('Error updating location:', upsertError);
    } else {
      // Add to history
      await supabase
        .from('user_location_history')
        .insert({
          user_id: user.id,
          ip_address: geoData.ip,
          latitude: geoData.latitude,
          longitude: geoData.longitude,
          city: geoData.city,
          region: geoData.region,
          country: geoData.country,
          location_source: geoData.source,
        });

      console.log('Location updated:', geoData.city);
    }
  };

  const handleAcceptPermanent = useCallback(async () => {
    if (!user?.id) return;
    
    setIsSubmitting(true);
    
    try {
      // Update preference in profile
      const { error: profileError } = await supabase
        .from('profiles')
        .update({ location_sharing_enabled: true })
        .eq('id', user.id);

      if (profileError) {
        console.error('Error updating profile:', profileError);
        toast.error('Erro ao salvar preferência');
        return;
      }

      // Update location
      await updateLocation();

      toast.success('Localização ativada permanentemente!', {
        description: 'Sua localização será compartilhada automaticamente ao acessar o portal.',
      });
      
      setShowConsentModal(false);
      setShowAdminRequestModal(false);
    } finally {
      setIsSubmitting(false);
    }
  }, [user?.id]);

  const handleDecline = async () => {
    if (!user?.id) return;

    // Update preference in profile
    await supabase
      .from('profiles')
      .update({ location_sharing_enabled: false })
      .eq('id', user.id);

    setShowConsentModal(false);
    setShowAdminRequestModal(false);
    
    toast.info('Compartilhamento de localização desativado', {
      description: 'Você pode ativar nas configurações do perfil.',
    });
  };

  const handleShareOnce = useCallback(async () => {
    if (!user?.id) return;
    
    setIsSubmitting(true);
    
    try {
      await updateLocation();
      
      toast.success('Localização compartilhada!');
      setShowAdminRequestModal(false);
    } finally {
      setIsSubmitting(false);
    }
  }, [user?.id]);

  // First-time consent modal
  if (showConsentModal) {
    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
        <div className="bg-card border border-border rounded-xl shadow-2xl max-w-md w-full mx-4 overflow-hidden animate-in zoom-in-95 duration-300">
          {/* Header */}
          <div className="bg-primary/10 px-6 py-4 flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center">
              <MapPin className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-foreground">Compartilhamento de Localização</h3>
              <p className="text-sm text-muted-foreground">Configuração inicial</p>
            </div>
          </div>

          {/* Content */}
          <div className="px-6 py-4 space-y-3">
            <p className="text-foreground font-medium">
              Deseja ativar o compartilhamento automático de localização?
            </p>
            <p className="text-muted-foreground text-sm">
              Com essa opção ativada, sua localização será compartilhada automaticamente toda vez que você acessar o portal. 
              Isso permite que a gestão acompanhe as atividades da equipe em tempo real.
            </p>
            <div className="bg-muted/50 rounded-lg p-3 text-sm text-muted-foreground">
              <strong>✓ Privacidade:</strong> Sua localização só é visível para a administração e apenas enquanto você está usando o portal.
            </div>
          </div>

          {/* Actions */}
          <div className="px-6 py-4 bg-muted/30 flex flex-col gap-2">
            <Button
              onClick={handleAcceptPermanent}
              disabled={isSubmitting}
              className="w-full gap-2"
            >
              {isSubmitting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Check className="w-4 h-4" />
              )}
              Ativar Permanentemente
            </Button>
            <Button
              variant="outline"
              onClick={handleDecline}
              disabled={isSubmitting}
              className="w-full gap-2"
            >
              <MapPinOff className="w-4 h-4" />
              Não Compartilhar
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Admin request modal (for users who declined or haven't been asked yet)
  if (showAdminRequestModal) {
    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
        <div className="bg-card border border-border rounded-xl shadow-2xl max-w-md w-full mx-4 overflow-hidden animate-in zoom-in-95 duration-300">
          {/* Header */}
          <div className="bg-primary/10 px-6 py-4 flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center">
              <MapPin className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-foreground">Solicitação de Localização</h3>
              <p className="text-sm text-muted-foreground">A administração solicitou sua localização</p>
            </div>
          </div>

          {/* Content */}
          <div className="px-6 py-4 space-y-3">
            <p className="text-muted-foreground">
              A equipe de gestão está solicitando que você compartilhe sua localização. 
              Você pode compartilhar apenas desta vez ou ativar o compartilhamento permanente.
            </p>
          </div>

          {/* Actions */}
          <div className="px-6 py-4 bg-muted/30 flex flex-col gap-2">
            <Button
              onClick={handleAcceptPermanent}
              disabled={isSubmitting}
              className="w-full gap-2"
            >
              {isSubmitting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Check className="w-4 h-4" />
              )}
              Ativar Permanentemente
            </Button>
            <Button
              variant="secondary"
              onClick={handleShareOnce}
              disabled={isSubmitting}
              className="w-full gap-2"
            >
              <MapPin className="w-4 h-4" />
              Compartilhar Apenas Agora
            </Button>
            <Button
              variant="ghost"
              onClick={() => setShowAdminRequestModal(false)}
              disabled={isSubmitting}
              className="w-full gap-2 text-muted-foreground"
            >
              <X className="w-4 h-4" />
              Ignorar
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return null;
};
