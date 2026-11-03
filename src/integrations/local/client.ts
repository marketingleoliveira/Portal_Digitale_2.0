const API = "/api";
const SESSION_KEY = "portal-digitale-auth";

export type User = {
  id: string;
  email?: string;
  user_metadata?: Record<string, any>;
  app_metadata?: Record<string, any>;
  [key: string]: any;
};

export type Session = {
  access_token: string;
  token_type?: string;
  user: User;
  [key: string]: any;
};

const authListeners =
  new Set<(event: string, session: Session | null) => void>();

function emitAuth(event: string, session: Session | null) {
  for (const listener of authListeners) {
    try {
      listener(event, session);
    } catch {}
  }
}

type Filter = {
  type: string;
  column?: string;
  value?: any;
  operator?: string;
  expression?: string;
};

type Order = {
  column: string;
  ascending: boolean;
};

function readStoredSession() {
  try {
    const raw =
      localStorage.getItem(
        SESSION_KEY
      );

    return raw
      ? JSON.parse(raw)
      : null;
  } catch {
    return null;
  }
}

function authHeaders() {
  const session =
    readStoredSession();

  const headers:
    Record<string, string> = {
      "Content-Type":
        "application/json"
    };

  if (session?.access_token) {
    headers.Authorization =
      `Bearer ${session.access_token}`;
  }

  return headers;
}

function apiError(result: any, fallback = "request_failed") {
  const message =
    result?.error?.message ||
    result?.error ||
    result?.message ||
    fallback;

  return new Error(String(message));
}

class QueryBuilder {

  private table: string;

  private operation =
    "select";

  private payload: any =
    null;

  private columns =
    "*";

  private filters:
    Filter[] = [];

  private orders:
    Order[] = [];

  private limitValue:
    number | null = null;

  private rangeValue:
    [number, number] | null =
      null;

  private singleValue:
    string | null = null;

  private headValue =
    false;

  constructor(table: string) {
    this.table = table;
  }

  select(
    columns = "*",
    options?: {
      count?: string;
      head?: boolean;
    }
  ) {
    this.columns =
      columns || "*";

    if (
      this.operation ===
      "select"
    ) {
      this.operation =
        "select";
    }

    this.headValue =
      Boolean(
        options?.head
      );

    return this;
  }

  insert(values: any) {
    this.operation =
      "insert";

    this.payload =
      values;

    return this;
  }

  upsert(
    values: any,
    _options?: any
  ) {
    this.operation =
      "upsert";

    this.payload =
      values;

    return this;
  }

  update(values: any) {
    this.operation =
      "update";

    this.payload =
      values;

    return this;
  }

  delete(_options?: any) {
    this.operation =
      "delete";

    return this;
  }

  eq(
    column: string,
    value: any
  ) {
    this.filters.push({
      type: "eq",
      column,
      value
    });

    return this;
  }

  neq(
    column: string,
    value: any
  ) {
    this.filters.push({
      type: "neq",
      column,
      value
    });

    return this;
  }

  gt(
    column: string,
    value: any
  ) {
    this.filters.push({
      type: "gt",
      column,
      value
    });

    return this;
  }

  gte(
    column: string,
    value: any
  ) {
    this.filters.push({
      type: "gte",
      column,
      value
    });

    return this;
  }

  lt(
    column: string,
    value: any
  ) {
    this.filters.push({
      type: "lt",
      column,
      value
    });

    return this;
  }

  lte(
    column: string,
    value: any
  ) {
    this.filters.push({
      type: "lte",
      column,
      value
    });

    return this;
  }

  is(
    column: string,
    value: any
  ) {
    this.filters.push({
      type: "is",
      column,
      value
    });

    return this;
  }

  in(
    column: string,
    value: any[]
  ) {
    this.filters.push({
      type: "in",
      column,
      value
    });

    return this;
  }

  like(
    column: string,
    value: any
  ) {
    this.filters.push({
      type: "like",
      column,
      value
    });

    return this;
  }

  ilike(
    column: string,
    value: any
  ) {
    this.filters.push({
      type: "ilike",
      column,
      value
    });

    return this;
  }

  contains(
    column: string,
    value: any
  ) {
    this.filters.push({
      type: "contains",
      column,
      value
    });

    return this;
  }

  match(value: any) {
    this.filters.push({
      type: "match",
      value
    });

    return this;
  }

  not(
    column: string,
    operator: string,
    value: any
  ) {
    this.filters.push({
      type: "not",
      column,
      operator,
      value
    });

    return this;
  }

  or(expression: string) {
    this.filters.push({
      type: "or",
      expression
    });

    return this;
  }

  filter(
    column: string,
    operator: string,
    value: any
  ) {
    this.filters.push({
      type: operator,
      column,
      value
    });

    return this;
  }

  order(
    column: string,
    options?: {
      ascending?: boolean;
    }
  ) {
    this.orders.push({
      column,
      ascending:
        options?.ascending !== false
    });

    return this;
  }

  limit(value: number) {
    this.limitValue =
      value;

    return this;
  }

  range(
    from: number,
    to: number
  ) {
    this.rangeValue =
      [from, to];

    return this;
  }

  single() {
    this.singleValue =
      "single";

    return this.execute();
  }

  maybeSingle() {
    this.singleValue =
      "maybeSingle";

    return this.execute();
  }

  returns<T>() {
    return this as any;
  }

  async execute() {

    try {

      const response =
        await fetch(
          `${API}/data/query`,
          {
            method: "POST",
            headers:
              authHeaders(),

            body:
              JSON.stringify({
                table:
                  this.table,

                operation:
                  this.operation,

                payload:
                  this.payload,

                columns:
                  this.columns,

                filters:
                  this.filters,

                orders:
                  this.orders,

                limit:
                  this.limitValue,

                range:
                  this.rangeValue,

                single:
                  this.singleValue,

                head:
                  this.headValue
              })
          }
        );

      const result =
        await response.json();

      return result;

    } catch (error: any) {

      return {
        data: null,
        error: {
          message:
            error?.message ||
            "api_unavailable"
        },
        count: null
      };
    }
  }

  then(
    resolve: any,
    reject: any
  ) {
    return this.execute()
      .then(
        resolve,
        reject
      );
  }
}

const auth = {

  async signInWithPassword({
    email,
    password
  }: {
    email: string;
    password: string;
  }) {

    try {

      const response =
        await fetch(
          `${API}/auth/login`,
          {
            method: "POST",
            headers: {
              "Content-Type":
                "application/json"
            },
            body:
              JSON.stringify({
                email,
                password
              })
          }
        );

      const result =
        await response.json();

      if (!response.ok) {
        return {
          data: {
            user: null,
            session: null
          },
          error:
            apiError(result, "Login inválido")
        };
      }

      const session = {
        access_token:
          result.token,
        token_type:
          "bearer",
        user:
          result.user
      };

      localStorage.setItem(
        SESSION_KEY,
        JSON.stringify(session)
      );

      emitAuth(
        "SIGNED_IN",
        session
      );

      return {
        data: {
          user:
            result.user,
          session
        },
        error: null
      };

    } catch (error) {

      return {
        data: {
          user: null,
          session: null
        },
        error
      };
    }
  },

  async signOut() {

    localStorage.removeItem(
      SESSION_KEY
    );

    emitAuth(
      "SIGNED_OUT",
      null
    );

    return {
      error: null
    };
  },

  async getSession() {

    const session =
      readStoredSession();

    return {
      data: {
        session
      },
      error: null
    };
  },

  async refreshSession() {
    const session =
      readStoredSession();

    if (!session?.access_token) {
      return {
        data: {
          session: null
        },
        error: null
      };
    }

    try {
      const response =
        await fetch(
          `${API}/auth/me`,
          {
            headers:
              authHeaders()
          }
        );

      const result =
        await response.json();

      if (!response.ok) {
        if (response.status === 401) {
          localStorage.removeItem(
            SESSION_KEY
          );
          emitAuth("SIGNED_OUT", null);
        }

        return {
          data: {
            session: null
          },
          error:
            result
        };
      }


      if (readStoredSession()?.access_token !== session.access_token) {
        return {
          data: { session: readStoredSession() },
          error: null
        };
      }

      const refreshed = {
        ...session,
        user:
          result.user
      };

      localStorage.setItem(
        SESSION_KEY,
        JSON.stringify(refreshed)
      );

      return {
        data: {
          session: refreshed
        },
        error: null
      };
    } catch (error) {
      return {
        data: {
          session
        },
        error
      };
    }
  },

  async getUser() {

    const session =
      readStoredSession();

    if (!session?.access_token) {
      return {
        data: {
          user: null
        },
        error: null
      };
    }

    try {

      const response =
        await fetch(
          `${API}/auth/me`,
          {
            headers:
              authHeaders()
          }
        );

      const result =
        await response.json();

      if (!response.ok) {
        return {
          data: {
            user: null
          },
          error:
            result
        };
      }

      return {
        data: {
          user:
            result.user
        },
        error: null
      };

    } catch (error) {

      return {
        data: {
          user: null
        },
        error
      };
    }
  },

  onAuthStateChange(
    callback: (
      event: string,
      session: Session | null
    ) => void
  ) {

    authListeners.add(
      callback
    );

    const session =
      readStoredSession();

    queueMicrotask(() => {
      callback(
        "INITIAL_SESSION",
        session
      );
    });

    return {
      data: {
        subscription: {
          unsubscribe() {
            authListeners.delete(
              callback
            );
          }
        }
      }
    };
  },

  async signUp(params: any) {
    try {
      const response =
        await fetch(
          `${API}/auth/signup`,
          {
            method: "POST",
            headers: {
              "Content-Type":
                "application/json"
            },
            body:
              JSON.stringify({
                email:
                  params?.email,
                password:
                  params?.password,
                data:
                  params?.options?.data || {}
              })
          }
        );

      const result =
        await response.json();

      return {
        data:
          response.ok
            ? result
            : null,
        error:
          response.ok
            ? null
            : apiError(result)
      };
    } catch (error) {
      return {
        data: null,
        error
      };
    }
  },

  async resetPasswordForEmail(
    _email: string,
    _options?: any
  ) {
    return {
      data: null,
      error: {
        message:
          "Recuperacao de senha ainda nao configurada."
      }
    };
  },

  async updateUser(
    attributes: any
  ) {
    try {
      if (!attributes?.password) {
        return {
          data: { user: readStoredSession()?.user || null },
          error: null
        };
      }

      const response = await fetch(
        `${API}/auth/update-password`,
        {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({
            password: attributes.password
          })
        }
      );

      const result = await response.json();

      if (!response.ok) {
        return {
          data: null,
          error: apiError(result)
        };
      }

      const session = readStoredSession();
      if (session) {
        const refreshed = {
          ...session,
          user: {
            ...session.user,
            ...(result.user || {})
          }
        };
        localStorage.setItem(
          SESSION_KEY,
          JSON.stringify(refreshed)
        );
        emitAuth(
          "USER_UPDATED",
          refreshed
        );
      }

      return {
        data: result,
        error: null
      };
    } catch (error) {
      return {
        data: null,
        error
      };
    }
  }
};

const storage = {
  from(bucket: string) {
    const publicUrl = (filePath: string) =>
      `${window.location.origin}${API}/storage/public?bucket=${encodeURIComponent(bucket)}&path=${encodeURIComponent(String(filePath).replace(/^\/+/, ""))}`;

    return {
      async upload(
        filePath: string,
        file: File | Blob,
        options?: any
      ) {
        const form = new FormData();
        form.append("file", file);

        const session = readStoredSession();
        const headers: Record<string, string> = {};
        if (session?.access_token) {
          headers.Authorization = `Bearer ${session.access_token}`;
        }

        try {
          const response = await fetch(
            `${API}/storage/upload/${encodeURIComponent(bucket)}?path=${encodeURIComponent(filePath)}&upsert=${options?.upsert === true ? "true" : "false"}`,
            {
              method: "POST",
              headers,
              body: form
            }
          );
          return await response.json();
        } catch (error) {
          return { data: null, error };
        }
      },

      getPublicUrl(filePath: string) {
        return {
          data: {
            publicUrl: publicUrl(filePath)
          }
        };
      },

      async createSignedUrl(
        filePath: string,
        expiresIn: number
      ) {
        try {
          const response = await fetch(
            `${API}/storage/signed/${encodeURIComponent(bucket)}`,
            {
              method: "POST",
              headers: authHeaders(),
              body: JSON.stringify({
                path: filePath,
                expiresIn
              })
            }
          );
          return await response.json();
        } catch (error) {
          return { data: null, error };
        }
      },

      async remove(paths: string[]) {
        try {
          const response = await fetch(
            `${API}/storage/remove/${encodeURIComponent(bucket)}`,
            {
              method: "POST",
              headers: authHeaders(),
              body: JSON.stringify({ paths })
            }
          );
          return await response.json();
        } catch (error) {
          return { data: null, error };
        }
      },

      async list(folder = "", options?: any) {
        try {
          const response = await fetch(
            `${API}/storage/list/${encodeURIComponent(bucket)}?prefix=${encodeURIComponent(folder)}&limit=${encodeURIComponent(options?.limit || 100)}`,
            {
              headers: authHeaders()
            }
          );
          return await response.json();
        } catch (error) {
          return { data: null, error };
        }
      },

      async download(filePath: string) {
        try {
          const response = await fetch(publicUrl(filePath));
          if (!response.ok) {
            return {
              data: null,
              error: { message: "download_failed" }
            };
          }
          return {
            data: await response.blob(),
            error: null
          };
        } catch (error) {
          return { data: null, error };
        }
      }
    };
  }
};

const functions = {

  async invoke(
    name: string,
    options?: {
      body?: any;
    }
  ) {

    try {

      const response =
        await fetch(
          `${API}/functions/${encodeURIComponent(name)}`,
          {
            method:
              "POST",

            headers:
              authHeaders(),

            body:
              JSON.stringify(
                options?.body ??
                {}
              )
          }
        );

      return await response.json();

    } catch (error) {

      return {
        data: null,
        error
      };
    }
  }
};

function channel(name: string) {
  type Handler = {
    type: string;
    filter: any;
    callback: Function;
  };

  const handlers: Handler[] = [];
  let socket: WebSocket | null = null;
  let subscribed = false;
  let subscribeCallback: Function | undefined;

  const socketUrl = () => {
    const protocol =
      window.location.protocol === "https:"
        ? "wss:"
        : "ws:";
    const session = readStoredSession();
    const token = session?.access_token
      ? `?token=${encodeURIComponent(session.access_token)}`
      : "";
    return `${protocol}//${window.location.host}${API}/realtime${token}`;
  };

  const filterMatches = (expression: string | undefined, row: any) => {
    if (!expression) return true;
    const parts = String(expression).split(".");
    if (parts.length < 3) return true;
    const column = parts.shift() as string;
    const operator = parts.shift();
    const expected = parts.join(".");
    const actual = row?.[column];

    if (operator === "eq") return String(actual) === expected;
    if (operator === "neq") return String(actual) !== expected;
    return true;
  };

  const ensureSocket = () =>
    new Promise<WebSocket>((resolve, reject) => {
      if (socket?.readyState === WebSocket.OPEN) {
        resolve(socket);
        return;
      }

      if (!socket || socket.readyState === WebSocket.CLOSED) {
        socket = new WebSocket(socketUrl());

        socket.addEventListener("open", () => {
          if (subscribed) {
            socket?.send(JSON.stringify({
              type: "subscribe",
              channel: name
            }));
          }
          subscribeCallback?.("SUBSCRIBED");
        });

        socket.addEventListener("message", (event) => {
          let message: any;
          try {
            message = JSON.parse(String(event.data));
          } catch {
            return;
          }

          for (const handler of handlers) {
            if (
              handler.type === "broadcast" &&
              message.type === "broadcast" &&
              message.channel === name &&
              (!handler.filter?.event ||
                handler.filter.event === message.event)
            ) {
              handler.callback({
                event: message.event,
                payload: message.payload
              });
            }

            if (
              handler.type === "postgres_changes" &&
              message.type === "postgres_changes" &&
              (!handler.filter?.table ||
                handler.filter.table === message.table) &&
              (!handler.filter?.event ||
                handler.filter.event === "*" ||
                handler.filter.event === message.event)
            ) {
              const row = message.new || message.old || {};
              if (filterMatches(handler.filter?.filter, row)) {
                handler.callback({
                  schema: "public",
                  table: message.table,
                  eventType: message.event,
                  new: message.new || {},
                  old: message.old || {}
                });
              }
            }
          }
        });

        socket.addEventListener("error", () => {
          subscribeCallback?.("CHANNEL_ERROR");
        });
      }

      const timeout = window.setInterval(() => {
        if (socket?.readyState === WebSocket.OPEN) {
          window.clearInterval(timeout);
          resolve(socket);
        } else if (socket?.readyState === WebSocket.CLOSED) {
          window.clearInterval(timeout);
          reject(new Error("realtime_connection_failed"));
        }
      }, 20);

      window.setTimeout(() => {
        window.clearInterval(timeout);
        if (socket?.readyState !== WebSocket.OPEN) {
          reject(new Error("realtime_timeout"));
        }
      }, 5000);
    });

  const object: any = {
    on(type: string, filter: any, callback: Function) {
      handlers.push({ type, filter, callback });
      return object;
    },

    subscribe(callback?: Function) {
      subscribed = true;
      subscribeCallback = callback;
      void ensureSocket().then((ws) => {
        ws.send(JSON.stringify({
          type: "subscribe",
          channel: name
        }));
        callback?.("SUBSCRIBED");
      }).catch(() => {
        callback?.("CHANNEL_ERROR");
      });
      return object;
    },

    async send(message: any) {
      try {
        const ws = await ensureSocket();
        ws.send(JSON.stringify({
          type: "broadcast",
          channel: name,
          event: message?.event || "",
          payload: message?.payload || {}
        }));
        return "ok";
      } catch {
        return "error";
      }
    },

    async unsubscribe() {
      if (socket?.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({
          type: "unsubscribe",
          channel: name
        }));
      }
      socket?.close();
      socket = null;
      subscribed = false;
      return "ok";
    }
  };

  return object;
}

export const supabase: any = {

  from(table: string) {
    return new QueryBuilder(
      table
    );
  },

  auth,

  storage,

  functions,

  async rpc(
    name: string,
    args?: any
  ) {

    try {

      const response =
        await fetch(
          `${API}/rpc/${encodeURIComponent(name)}`,
          {
            method:
              "POST",

            headers:
              authHeaders(),

            body:
              JSON.stringify(
                args ?? {}
              )
          }
        );

      return await response.json();

    } catch (error) {

      return {
        data: null,
        error
      };
    }
  },

  channel,

  async removeChannel(
    channel: any
  ) {
    if (
      channel &&
      typeof channel.unsubscribe === "function"
    ) {
      return channel.unsubscribe();
    }

    return "ok";
  }
};

