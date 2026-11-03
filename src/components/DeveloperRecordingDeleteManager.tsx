import {
  useCallback,
  useEffect,
  useMemo,
  useState
} from "react";

import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Trash2,
  X
} from "lucide-react";

import {
  useAuth
} from "@/contexts/AuthContext";


type Recording = {
  id: string;

  status?:
    string
    | null;

  size_bytes?:
    number
    | string
    | null;

  started_at?:
    string
    | null;

  completed_at?:
    string
    | null;

  error_message?:
    string
    | null;

  storage_path?:
    string
    | null;

  [key: string]:
    any;
};


const ACTIVE_STATUSES =
  new Set([
    "starting",
    "recording",
    "running",
    "processing",
    "active",
    "in_progress"
  ]);


const FAILED_STATUSES =
  new Set([
    "failed",
    "failure",
    "error",
    "aborted",
    "abort",
    "timeout",
    "timed_out",
    "cancelled",
    "canceled"
  ]);


function normalizeStatus(
  value:
    unknown
) {

  return String(
    value
    || ""
  )
    .trim()
    .toLowerCase();
}


function isFailed(
  recording:
    Recording
) {

  const status =
    normalizeStatus(
      recording.status
    );


  if (
    FAILED_STATUSES.has(
      status
    )
  ) {

    return true;
  }


  const error =
    String(
      recording.error_message
      || ""
    )
      .trim();


  return Boolean(
    error
  );
}


function formatDate(
  value:
    unknown
) {

  if (!value) {
    return "";
  }


  const date =
    new Date(
      String(
        value
      )
    );


  if (
    Number.isNaN(
      date.getTime()
    )
  ) {

    return "";
  }


  return date
    .toLocaleString(
      "pt-BR"
    );
}


function formatBytes(
  value:
    unknown
) {

  let bytes =
    Number(
      value
      || 0
    );


  if (
    !Number.isFinite(
      bytes
    )
    ||
    bytes <= 0
  ) {

    return "";
  }


  const units = [
    "B",
    "KB",
    "MB",
    "GB"
  ];


  let unit =
    0;


  while (
    bytes >= 1024
    &&
    unit <
      units.length - 1
  ) {

    bytes /=
      1024;

    unit +=
      1;
  }


  return `${
    bytes.toFixed(
      unit >= 2
        ? 1
        : 0
    )
  } ${units[unit]}`;
}


export default function
DeveloperRecordingDeleteManager() {

  const auth =
    useAuth() as any;


  const role =
    String(
      auth?.realRole
      ||
      auth?.profile?.role
      ||
      ""
    )
      .toLowerCase();


  const isDeveloper =
    role === "dev"
    ||
    role ===
      "desenvolvedor";


  const token =
    auth?.session
      ?.access_token
    ||
    auth?.session
      ?.accessToken
    ||
    "";


  const [
    open,
    setOpen
  ] =
    useState(false);


  const [
    loading,
    setLoading
  ] =
    useState(false);


  const [
    deleting,
    setDeleting
  ] =
    useState<
      string
      | null
    >(
      null
    );


  const [
    message,
    setMessage
  ] =
    useState("");


  const [
    items,
    setItems
  ] =
    useState<
      Recording[]
    >(
      []
    );


  const orderedItems =
    useMemo(
      () => {

        return [
          ...items
        ].sort(
          (
            a,
            b
          ) => {

            const aFailed =
              isFailed(a)
                ? 0
                : 1;

            const bFailed =
              isFailed(b)
                ? 0
                : 1;


            if (
              aFailed
              !== bFailed
            ) {

              return (
                aFailed
                -
                bFailed
              );
            }


            const aTime =
              new Date(
                a.completed_at
                ||
                a.started_at
                ||
                0
              )
                .getTime();


            const bTime =
              new Date(
                b.completed_at
                ||
                b.started_at
                ||
                0
              )
                .getTime();


            return (
              bTime
              -
              aTime
            );
          }
        );
      },

      [
        items
      ]
    );


  const load =
    useCallback(
      async () => {

        if (
          !isDeveloper
          ||
          !token
        ) {

          return;
        }


        setLoading(
          true
        );

        setMessage(
          ""
        );


        try {

          const response =
            await fetch(
              "/api/recordings/developer/manage/list",
              {
                headers: {
                  Authorization:
                    `Bearer ${token}`
                }
              }
            );


          const body =
            await response
              .json()
              .catch(
                () => ({})
              );


          if (
            !response.ok
          ) {

            throw new Error(
              body
                ?.error
                ?.message
              ||
              "Erro ao carregar gravações."
            );
          }


          setItems(
            Array.isArray(
              body
                ?.recordings
            )
              ?
                body.recordings
              :
                []
          );

        } catch (
          error:
            any
        ) {

          setMessage(
            error
              ?.message
            ||
            "Erro ao carregar gravações."
          );

        } finally {

          setLoading(
            false
          );
        }
      },

      [
        isDeveloper,
        token
      ]
    );


  useEffect(
    () => {

      if (open) {

        void load();
      }

    },

    [
      open,
      load
    ]
  );


  if (
    !isDeveloper
  ) {

    return null;
  }


  const remove =
    async (
      recording:
        Recording
    ) => {

      const failed =
        isFailed(
          recording
        );


      const question =
        failed
          ?
            "Excluir definitivamente esta gravação que falhou?\n\n"
            +
            "O registro da tentativa será removido. "
            +
            "Se existir algum arquivo parcial, ele também será excluído."
          :
            "Excluir definitivamente esta gravação?\n\n"
            +
            "O arquivo e o registro serão removidos.";


      if (
        !window.confirm(
          question
        )
      ) {

        return;
      }


      setDeleting(
        recording.id
      );

      setMessage(
        ""
      );


      try {

        const response =
          await fetch(
            `/api/recordings/developer/manage/${
              encodeURIComponent(
                recording.id
              )
            }`,
            {
              method:
                "DELETE",

              headers: {
                Authorization:
                  `Bearer ${token}`
              }
            }
          );


        const body =
          await response
            .json()
            .catch(
              () => ({})
            );


        if (
          !response.ok
        ) {

          throw new Error(
            body
              ?.error
              ?.message
            ||
            "Erro ao excluir gravação."
          );
        }


        setItems(
          current =>
            current.filter(
              item =>
                item.id
                !==
                recording.id
            )
        );


        setMessage(
          failed
            ?
              "Falha removida com sucesso."
            :
              "Gravação excluída com sucesso."
        );

      } catch (
        error:
          any
      ) {

        setMessage(
          error
            ?.message
          ||
          "Erro ao excluir gravação."
        );

      } finally {

        setDeleting(
          null
        );
      }
    };


  const failedCount =
    orderedItems.filter(
      isFailed
    ).length;


  return (
    <>

      <button
        type="button"
        onClick={
          () =>
            setOpen(
              true
            )
        }
        className="
          fixed
          bottom-6
          right-6
          z-[9990]
          inline-flex
          items-center
          gap-2
          rounded-lg
          bg-destructive
          px-4
          py-2.5
          text-sm
          font-medium
          text-destructive-foreground
          shadow-lg
          hover:opacity-90
        "
      >

        <Trash2
          className="
            h-4
            w-4
          "
        />

        Excluir gravações

        {
          failedCount > 0
          &&
          <span
            className="
              rounded-full
              bg-white/20
              px-2
              py-0.5
              text-xs
            "
          >
            {failedCount} falha{
              failedCount !== 1
                ? "s"
                : ""
            }
          </span>
        }

      </button>


      {
        open
        &&
        <div
          className="
            fixed
            inset-0
            z-[10000]
            flex
            items-center
            justify-center
            bg-black/60
            p-4
          "
        >

          <div
            className="
              flex
              max-h-[88vh]
              w-full
              max-w-4xl
              flex-col
              overflow-hidden
              rounded-xl
              border
              bg-background
              shadow-2xl
            "
          >

            <div
              className="
                flex
                items-center
                justify-between
                gap-4
                border-b
                p-5
              "
            >

              <div>

                <h2
                  className="
                    text-xl
                    font-semibold
                  "
                >
                  Gerenciar gravações
                </h2>

                <p
                  className="
                    mt-1
                    text-sm
                    text-muted-foreground
                  "
                >
                  Gravações concluídas e tentativas que falharam podem ser removidas.
                </p>

              </div>


              <button
                type="button"
                onClick={
                  () =>
                    setOpen(
                      false
                    )
                }
                className="
                  inline-flex
                  h-9
                  w-9
                  items-center
                  justify-center
                  rounded-md
                  border
                "
              >

                <X
                  className="
                    h-4
                    w-4
                  "
                />

              </button>

            </div>


            {
              message
              &&
              <div
                className="
                  border-b
                  bg-muted/40
                  px-5
                  py-3
                  text-sm
                "
              >
                {message}
              </div>
            }


            <div
              className="
                flex-1
                overflow-y-auto
                p-5
              "
            >

              {
                loading
                ?
                  <div
                    className="
                      flex
                      justify-center
                      py-14
                    "
                  >
                    <Loader2
                      className="
                        h-5
                        w-5
                        animate-spin
                      "
                    />
                  </div>

                :
                orderedItems.length === 0
                  ?
                    <div
                      className="
                        py-14
                        text-center
                        text-sm
                        text-muted-foreground
                      "
                    >
                      Nenhuma gravação encontrada.
                    </div>

                  :
                    <div
                      className="
                        space-y-3
                      "
                    >

                      {
                        orderedItems.map(
                          recording => {

                            const status =
                              normalizeStatus(
                                recording.status
                              );


                            const failed =
                              isFailed(
                                recording
                              );


                            const active =
                              ACTIVE_STATUSES.has(
                                status
                              );


                            const date =
                              formatDate(
                                recording
                                  .completed_at
                                ||
                                recording
                                  .started_at
                              );


                            const size =
                              formatBytes(
                                recording
                                  .size_bytes
                              );


                            return (
                              <div
                                key={
                                  recording.id
                                }
                                className={
                                  `
                                  flex
                                  flex-col
                                  gap-4
                                  rounded-lg
                                  border
                                  p-4
                                  sm:flex-row
                                  sm:items-center
                                  sm:justify-between
                                  ${
                                    failed
                                      ?
                                        "border-destructive/40 bg-destructive/5"
                                      :
                                        ""
                                  }
                                  `
                                }
                              >

                                <div
                                  className="
                                    min-w-0
                                    flex-1
                                  "
                                >

                                  <div
                                    className="
                                      flex
                                      items-center
                                      gap-2
                                    "
                                  >

                                    {
                                      failed
                                        ?
                                          <AlertTriangle
                                            className="
                                              h-4
                                              w-4
                                              text-destructive
                                            "
                                          />
                                        :
                                          <CheckCircle2
                                            className="
                                              h-4
                                              w-4
                                              text-muted-foreground
                                            "
                                          />
                                    }


                                    <span
                                      className="
                                        font-medium
                                      "
                                    >
                                      {
                                        failed
                                          ?
                                            "Gravação falhou"
                                          :
                                            "Gravação"
                                      }
                                    </span>


                                    {
                                      failed
                                      &&
                                      <span
                                        className="
                                          rounded-full
                                          bg-destructive
                                          px-2
                                          py-0.5
                                          text-[11px]
                                          font-semibold
                                          text-destructive-foreground
                                        "
                                      >
                                        Falhou
                                      </span>
                                    }

                                  </div>


                                  <div
                                    className="
                                      mt-1
                                      flex
                                      flex-wrap
                                      gap-x-3
                                      text-xs
                                      text-muted-foreground
                                    "
                                  >

                                    {
                                      date
                                      &&
                                      <span>
                                        {date}
                                      </span>
                                    }


                                    {
                                      size
                                      &&
                                      <span>
                                        {size}
                                      </span>
                                    }


                                    {
                                      status
                                      &&
                                      <span>
                                        Status: {status}
                                      </span>
                                    }

                                  </div>


                                  {
                                    failed
                                    &&
                                    recording
                                      .error_message
                                    &&
                                    <div
                                      className="
                                        mt-2
                                        break-words
                                        text-xs
                                        text-destructive
                                      "
                                    >
                                      {
                                        String(
                                          recording
                                            .error_message
                                        )
                                      }
                                    </div>
                                  }

                                </div>


                                <button
                                  type="button"
                                  disabled={
                                    active
                                    ||
                                    deleting
                                      ===
                                      recording.id
                                  }
                                  onClick={
                                    () =>
                                      void remove(
                                        recording
                                      )
                                  }
                                  className="
                                    inline-flex
                                    shrink-0
                                    items-center
                                    justify-center
                                    gap-2
                                    rounded-md
                                    border
                                    border-destructive/40
                                    px-3
                                    py-2
                                    text-sm
                                    font-medium
                                    text-destructive
                                    hover:bg-destructive
                                    hover:text-destructive-foreground
                                    disabled:cursor-not-allowed
                                    disabled:opacity-40
                                  "
                                >

                                  {
                                    deleting
                                      ===
                                      recording.id
                                      ?
                                        <Loader2
                                          className="
                                            h-4
                                            w-4
                                            animate-spin
                                          "
                                        />
                                      :
                                        <Trash2
                                          className="
                                            h-4
                                            w-4
                                          "
                                        />
                                  }


                                  {
                                    active
                                      ?
                                        "Em andamento"
                                      :
                                    deleting
                                      ===
                                      recording.id
                                      ?
                                        "Excluindo..."
                                      :
                                    failed
                                      ?
                                        "Excluir falha"
                                      :
                                        "Excluir"
                                  }

                                </button>

                              </div>
                            );
                          }
                        )
                      }

                    </div>
              }

            </div>

          </div>

        </div>
      }

    </>
  );
}
