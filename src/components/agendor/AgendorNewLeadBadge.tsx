import {
  useCallback,
  useEffect,
  useState,
} from "react";

import {
  useAuth,
} from "@/contexts/AuthContext";


export function AgendorNewLeadBadge() {
  const {
    session,
    realRole,
  } = useAuth();

  const [
    unreadCount,
    setUnreadCount,
  ] = useState(0);


  const refresh =
    useCallback(
      async () => {
        if (
          realRole !== "sdr"
        ) {
          setUnreadCount(0);
          return;
        }

        const token =
          (session as any)
            ?.access_token
          ||
          (session as any)
            ?.accessToken;

        if (!token) {
          return;
        }

        try {
          const response =
            await fetch(
              "/api/agendor-unread",
              {
                headers: {
                  Authorization:
                    `Bearer ${token}`,
                },
              }
            );

          if (!response.ok) {
            return;
          }

          const data =
            await response.json();

          setUnreadCount(
            Number(
              data?.unread_count
              || 0
            )
          );

        } catch {
          // Não interfere no menu
          // caso a API esteja indisponível.
        }
      },
      [
        realRole,
        session,
      ]
    );


  useEffect(
    () => {
      void refresh();

      if (
        realRole !== "sdr"
      ) {
        return;
      }

      const timer =
        window.setInterval(
          () => {
            void refresh();
          },
          15000
        );


      const handleChange =
        () => {
          void refresh();
        };


      window.addEventListener(
        "agendor-unread-changed",
        handleChange
      );


      return () => {
        window.clearInterval(
          timer
        );

        window.removeEventListener(
          "agendor-unread-changed",
          handleChange
        );
      };
    },
    [
      realRole,
      refresh,
    ]
  );


  if (
    realRole !== "sdr"
    || unreadCount < 1
  ) {
    return null;
  }


  return (
    <span
      title={`${unreadCount} lead${unreadCount === 1 ? "" : "s"} novo${unreadCount === 1 ? "" : "s"}`}
      className="
        ml-2
        inline-flex
        items-center
        rounded-full
        bg-red-600
        px-2
        py-0.5
        text-[10px]
        font-bold
        uppercase
        tracking-wide
        text-white
        shadow-sm
        animate-pulse
      "
    >
      NOVO
    </span>
  );
}
