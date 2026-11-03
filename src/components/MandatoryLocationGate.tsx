import {
  useCallback,
  useEffect,
  useRef
} from "react";

import {
  useAuth
} from "@/contexts/AuthContext";


/*
 * PORTAL DIGITALE
 *
 * A localização é OPCIONAL.
 *
 * - nunca bloqueia o acesso ao Portal;
 * - nunca exige GPS ativado;
 * - nunca impede navegação se a permissão for negada;
 * - se a localização estiver disponível, continua
 *   registrando normalmente no backend.
 */
export default function MandatoryLocationGate({
  children
}: {
  children: React.ReactNode;
}) {

  const {
    user,
    session
  } = useAuth();


  const watchId =
    useRef<number | null>(
      null
    );


  const lastSent =
    useRef(0);


  const token =
    (session as any)
      ?.access_token
    ||
    (session as any)
      ?.accessToken;


  const sendLocation =
    useCallback(
      async (
        position:
          GeolocationPosition,

        force = false
      ) => {

        if (!token) {
          return;
        }


        const now =
          Date.now();


        /*
         * Mantém a limitação já usada
         * anteriormente: no máximo um
         * envio a cada 45 segundos.
         */
        if (
          !force
          &&
          now -
            lastSent.current
            <
            45000
        ) {

          return;
        }


        try {

          const response =
            await fetch(
              "/api/location/update",
              {
                method:
                  "POST",

                headers: {
                  "Content-Type":
                    "application/json",

                  Authorization:
                    `Bearer ${token}`
                },

                body:
                  JSON.stringify({
                    latitude:
                      position
                        .coords
                        .latitude,

                    longitude:
                      position
                        .coords
                        .longitude,

                    accuracy:
                      position
                        .coords
                        .accuracy,

                    altitude:
                      position
                        .coords
                        .altitude,

                    heading:
                      position
                        .coords
                        .heading,

                    speed:
                      position
                        .coords
                        .speed
                  })
              }
            );


          if (response.ok) {

            lastSent.current =
              now;
          }

        } catch (
          error
        ) {

          /*
           * Falha de localização ou API
           * nunca deve bloquear o Portal.
           */
          console.debug(
            "LOCALIZACAO OPCIONAL:",
            error
          );
        }
      },

      [
        token
      ]
    );


  useEffect(
    () => {

      /*
       * Sem usuário ou sessão:
       * apenas renderiza o Portal.
       */
      if (
        !user
        ||
        !token
      ) {

        return;
      }


      /*
       * Navegador sem geolocalização:
       * Portal continua normalmente.
       */
      if (
        typeof navigator
          === "undefined"
        ||
        !navigator.geolocation
      ) {

        return;
      }


      let cancelled =
        false;


      const success =
        async (
          position:
            GeolocationPosition
        ) => {

          if (cancelled) {
            return;
          }


          await sendLocation(
            position,
            true
          );


          if (
            cancelled
            ||
            watchId.current
              !== null
          ) {

            return;
          }


          watchId.current =
            navigator
              .geolocation
              .watchPosition(
                position => {

                  void sendLocation(
                    position,
                    false
                  );
                },

                () => {

                  /*
                   * Localização desligada,
                   * negada ou indisponível:
                   * nenhuma ação.
                   *
                   * O usuário continua
                   * usando o Portal.
                   */
                },

                {
                  enableHighAccuracy:
                    true,

                  timeout:
                    20000,

                  maximumAge:
                    15000
                }
              );
        };


      /*
       * Tenta obter localização,
       * porém qualquer erro é ignorado
       * para fins de acesso ao sistema.
       */
      navigator
        .geolocation
        .getCurrentPosition(
          position => {

            void success(
              position
            );
          },

          () => {

            /*
             * Permissão negada,
             * GPS desligado ou timeout.
             *
             * O Portal permanece liberado.
             */
          },

          {
            enableHighAccuracy:
              true,

            timeout:
              20000,

            maximumAge:
              15000
          }
        );


      return () => {

        cancelled =
          true;


        if (
          watchId.current
            !== null
        ) {

          navigator
            .geolocation
            .clearWatch(
              watchId.current
            );


          watchId.current =
            null;
        }
      };
    },

    [
      user,
      token,
      sendLocation
    ]
  );


  /*
   * IMPORTANTE:
   *
   * children é SEMPRE renderizado.
   * A localização não controla mais
   * o acesso ao Portal.
   */
  return (
    <>
      {children}
    </>
  );
}
