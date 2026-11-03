import {
  useCallback,
  useEffect,
  useMemo,
  useState
} from "react";

import {
  Clock,
  Loader2,
  LocateFixed,
  MapPin,
  RefreshCw,
  Satellite,
  Users
} from "lucide-react";

import {
  formatDistanceToNow
} from "date-fns";

import {
  ptBR
} from "date-fns/locale";

import DashboardLayout
  from "@/components/layouts/DashboardLayout";

import LocationMap
  from "@/components/LocationMap";

import {
  Badge
} from "@/components/ui/badge";

import {
  Button
} from "@/components/ui/button";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "@/components/ui/card";

import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger
} from "@/components/ui/tabs";

import {
  useAuth
} from "@/contexts/AuthContext";

import {
  toast
} from "sonner";


interface LocationRow {
  user_id: string;

  latitude:
    number | null;

  longitude:
    number | null;

  city:
    string | null;

  region:
    string | null;

  country:
    string | null;

  neighborhood:
    string | null;

  street:
    string | null;

  location_source:
    string | null;

  last_updated:
    string | null;

  profile: {
    full_name:
      string;

    email:
      string;

    avatar_url:
      string | null;

    location_sharing_enabled:
      boolean | null;
  };
}


export default function Localizar() {

  const {
    session
  } = useAuth();


  const [
    locations,
    setLocations
  ] =
    useState<LocationRow[]>(
      []
    );


  const [
    loading,
    setLoading
  ] =
    useState(true);


  const token =
    (session as any)
      ?.access_token
    ||
    (session as any)
      ?.accessToken;


  const load =
    useCallback(
      async (
        silent = false
      ) => {

        if (!token) {
          return;
        }

        if (!silent) {
          setLoading(
            true
          );
        }

        try {

          const response =
            await fetch(
              "/api/location/users",
              {
                headers: {
                  Authorization:
                    `Bearer ${token}`
                }
              }
            );


          const result =
            await response
              .json();


          if (!response.ok) {

            throw new Error(
              result
                ?.error
                ?.message
              ||
              "Erro ao carregar localizações"
            );
          }


          setLocations(
            result.data
            ||
            []
          );

        } catch (
          error: any
        ) {

          if (!silent) {

            toast.error(
              error?.message
              ||
              "Erro ao carregar localizações"
            );
          }

        } finally {

          if (!silent) {

            setLoading(
              false
            );
          }
        }
      },

      [
        token
      ]
    );


  useEffect(
    () => {

      if (!token) {
        return;
      }

      void load();


      const interval =
        window
          .setInterval(
            () => {

              void load(
                true
              );

            },
            15000
          );


      return () => {

        window
          .clearInterval(
            interval
          );
      };

    },

    [
      token,
      load
    ]
  );


  const isOnline =
    useCallback(
      (
        userId: string
      ) => {

        const row =
          locations.find(
            item =>
              item.user_id
              ===
              userId
          );


        if (
          !row
          ||
          !row.last_updated
        ) {

          return false;
        }


        return (
          Date.now()
          -
          new Date(
            row.last_updated
          ).getTime()
          <
          2 * 60 * 1000
        );
      },

      [
        locations
      ]
    );


  const withLocation =
    useMemo(
      () =>
        locations.filter(
          item =>
            item.latitude
              !== null
            &&
            item.longitude
              !== null
        ),

      [
        locations
      ]
    );


  const online =
    useMemo(
      () =>
        locations.filter(
          item =>
            isOnline(
              item.user_id
            )
        ),

      [
        locations,
        isOnline
      ]
    );


  return (
    <DashboardLayout>

      <div className="space-y-6">

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">

          <div>

            <h1 className="text-2xl font-bold flex items-center gap-2">

              <LocateFixed className="w-6 h-6 text-primary" />

              Localização dos usuários

            </h1>

            <p className="text-muted-foreground">

              Localização GPS obrigatória para todos os usuários ativos do Portal.

            </p>

          </div>


          <Button
            variant="outline"
            disabled={loading}
            onClick={() =>
              load()
            }
          >

            <RefreshCw
              className={
                `w-4 h-4 mr-2 ${
                  loading
                    ? "animate-spin"
                    : ""
                }`
              }
            />

            Atualizar

          </Button>

        </div>


        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">

          <Card>
            <CardContent className="p-5">

              <p className="text-sm text-muted-foreground">
                Usuários ativos
              </p>

              <p className="text-3xl font-bold mt-1">
                {locations.length}
              </p>

            </CardContent>
          </Card>


          <Card>
            <CardContent className="p-5">

              <p className="text-sm text-muted-foreground">
                Com localização
              </p>

              <p className="text-3xl font-bold mt-1">
                {withLocation.length}
              </p>

            </CardContent>
          </Card>


          <Card>
            <CardContent className="p-5">

              <p className="text-sm text-muted-foreground">
                Online agora
              </p>

              <p className="text-3xl font-bold mt-1">
                {online.length}
              </p>

            </CardContent>
          </Card>

        </div>


        {loading ? (

          <div className="py-16 flex justify-center">

            <Loader2 className="w-8 h-8 animate-spin text-primary" />

          </div>

        ) : (

          <Tabs
            defaultValue="map"
            className="w-full"
          >

            <TabsList>

              <TabsTrigger value="map">
                Mapa
              </TabsTrigger>

              <TabsTrigger value="users">
                Usuários
              </TabsTrigger>

            </TabsList>


            <TabsContent
              value="map"
              className="mt-4"
            >

              <Card>

                <CardHeader>

                  <CardTitle>
                    Localização atual
                  </CardTitle>

                  <CardDescription>

                    {withLocation.length} de {locations.length} usuários com posição registrada.

                  </CardDescription>

                </CardHeader>

                <CardContent>

                  <LocationMap
                    locations={
                      locations as any
                    }
                    isUserOnline={
                      isOnline
                    }
                  />

                </CardContent>

              </Card>

            </TabsContent>


            <TabsContent
              value="users"
              className="mt-4"
            >

              <Card>

                <CardContent className="p-0">

                  <div className="divide-y">

                    {locations.map(
                      location => {

                        const active =
                          isOnline(
                            location.user_id
                          );

                        const hasLocation =
                          location.latitude
                            !== null
                          &&
                          location.longitude
                            !== null;


                        return (
                          <div
                            key={
                              location.user_id
                            }
                            className="p-4 flex items-center gap-4"
                          >

                            <div className="relative shrink-0">

                              {location.profile
                                ?.avatar_url
                                ? (

                                  <img
                                    src={
                                      location.profile.avatar_url
                                    }
                                    alt=""
                                    className="w-11 h-11 rounded-full object-cover"
                                  />

                                )
                                : (

                                  <div className="w-11 h-11 rounded-full bg-primary/10 flex items-center justify-center font-semibold text-primary">

                                    {
                                      location.profile
                                        ?.full_name
                                        ?.charAt(0)
                                      ||
                                      "?"
                                    }

                                  </div>
                                )}


                              <span
                                className={
                                  `absolute -bottom-1 -right-1 w-3.5 h-3.5 rounded-full border-2 border-background ${
                                    active
                                      ? "bg-green-500"
                                      : "bg-slate-400"
                                  }`
                                }
                              />

                            </div>


                            <div className="min-w-0 flex-1">

                              <div className="flex items-center gap-2 flex-wrap">

                                <p className="font-medium truncate">

                                  {
                                    location.profile
                                      ?.full_name
                                  }

                                </p>


                                {active && (

                                  <Badge
                                    variant="outline"
                                    className="text-green-600"
                                  >

                                    Online

                                  </Badge>
                                )}


                                {hasLocation && (

                                  <Badge
                                    variant="outline"
                                    className="gap-1"
                                  >

                                    <Satellite className="w-3 h-3" />

                                    GPS

                                  </Badge>
                                )}

                              </div>


                              <p className="text-xs text-muted-foreground truncate">

                                {
                                  location.profile
                                    ?.email
                                }

                              </p>


                              {hasLocation ? (

                                <div className="mt-2 text-sm text-muted-foreground space-y-1">

                                  <div className="flex items-center gap-1.5">

                                    <MapPin className="w-3.5 h-3.5" />

                                    {Number(
                                      location.latitude
                                    ).toFixed(6)}
                                    ,
                                    {" "}
                                    {Number(
                                      location.longitude
                                    ).toFixed(6)}

                                  </div>


                                  {location.last_updated && (

                                    <div className="flex items-center gap-1.5">

                                      <Clock className="w-3.5 h-3.5" />

                                      Atualizado{" "}

                                      {
                                        formatDistanceToNow(
                                          new Date(
                                            location.last_updated
                                          ),
                                          {
                                            addSuffix:
                                              true,

                                            locale:
                                              ptBR
                                          }
                                        )
                                      }

                                    </div>
                                  )}

                                </div>

                              ) : (

                                <p className="mt-2 text-sm text-amber-600">

                                  Aguardando o próximo acesso com localização autorizada.

                                </p>
                              )}

                            </div>

                          </div>
                        );
                      }
                    )}

                  </div>

                </CardContent>

              </Card>

            </TabsContent>

          </Tabs>
        )}

      </div>

    </DashboardLayout>
  );
}
