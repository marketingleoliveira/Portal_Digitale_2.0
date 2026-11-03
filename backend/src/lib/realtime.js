import { WebSocketServer, WebSocket } from "ws";
import { userFromToken } from "./auth.js";

let wss = null;

function safeSend(ws, message) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(message));
  }
}

export function createRealtimeServer(server) {
  wss = new WebSocketServer({
    server,
    path: "/api/realtime",
  });

  wss.on("connection", async (ws, req) => {
    const url = new URL(req.url || "/api/realtime", "http://localhost");
    const token = url.searchParams.get("token");
    const user = await userFromToken(token);

    ws.portalUser = user;
    ws.portalChannels = new Set();
    safeSend(ws, { type: "connected", authenticated: Boolean(user) });

    ws.on("message", (buffer) => {
      let message;
      try {
        message = JSON.parse(String(buffer));
      } catch {
        return;
      }

      if (message.type === "subscribe" && message.channel) {
        ws.portalChannels.add(String(message.channel));
        return;
      }

      if (message.type === "unsubscribe" && message.channel) {
        ws.portalChannels.delete(String(message.channel));
        return;
      }

      if (message.type === "broadcast" && message.channel) {
        for (const client of wss.clients) {
          if (client.portalChannels?.has(String(message.channel))) {
            safeSend(client, {
              type: "broadcast",
              channel: String(message.channel),
              event: String(message.event || ""),
              payload: message.payload ?? {},
            });
          }
        }
      }
    });
  });

  return wss;
}
const PUBLIC_REALTIME_TABLES = new Set([
  "meetings",
  "meeting_messages",
  "meeting_participants",
]);

export function emitTableChange(table, event, newRow = null, oldRow = null) {
  if (!wss) return;

  for (const client of wss.clients) {
    if (!client.portalUser && !PUBLIC_REALTIME_TABLES.has(table)) {
      continue;
    }

    safeSend(client, {
      type: "postgres_changes",
      table,
      event,
      new: newRow,
      old: oldRow,
    });
  }
}

export function emitBroadcast(channel, event, payload = {}) {
  if (!wss) return;

  for (const client of wss.clients) {
    if (client.portalChannels?.has(String(channel))) {
      safeSend(client, {
        type: "broadcast",
        channel: String(channel),
        event: String(event),
        payload,
      });
    }
  }
}
