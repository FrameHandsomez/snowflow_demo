/**
 * SNOWFLOW server entry — Phase 0 foundation.
 *
 * Boots Express + Colyseus with one ZoneRoom.
 * Done criteria for Phase 0 (partial): process listens and accepts join by room name.
 * Full Phase 0 done = client walks in SNOWFLOW zone over this socket (Phase 1 fills movement).
 */

import { createServer } from "node:http";
import express from "express";
import { Server } from "@colyseus/core";
import { WebSocketTransport } from "@colyseus/ws-transport";
import {
    PROTOCOL_VERSION,
    ROOM_NAME_ZONE,
    DEFAULT_ZONE_ID,
} from "@snowflow/shared";
import { config } from "./app.config.js";
import { ZoneRoom } from "./rooms/ZoneRoom.js";
import { connectRedis, disconnectRedis, redisHealth } from "./redis.js";

const PORT = config.port;
const HOST = config.host;

const app = express();
app.get("/health", async (_req, res) => {
    const redis = await redisHealth();
    res.json({
        ok: true,
        service: "@snowflow/server",
        protocolVersion: PROTOCOL_VERSION,
        zone: DEFAULT_ZONE_ID,
        room: ROOM_NAME_ZONE,
        uptimeSec: Math.floor(process.uptime()),
        redis,
    });
});

app.get("/", (_req, res) => {
    res.type("text").send(
        `SNOWFLOW server · protocol ${PROTOCOL_VERSION} · room "${ROOM_NAME_ZONE}" · /health\n`,
    );
});

const httpServer = createServer(app);

const gameServer = new Server({
    transport: new WebSocketTransport({ server: httpServer }),
});

gameServer.define(ROOM_NAME_ZONE, ZoneRoom);

await connectRedis();

httpServer.listen(PORT, HOST, () => {
    console.log(`[snowflow-server] listening on http://${HOST}:${PORT}`);
    console.log(`[snowflow-server] health  → GET /health`);
    console.log(`[snowflow-server] room    → "${ROOM_NAME_ZONE}" (protocol ${PROTOCOL_VERSION})`);
    console.log(
        `[snowflow-server] redis   → ${config.redisUrl ? config.redisUrl : "(disabled)"}`,
    );
});

async function shutdown(signal) {
    console.log(`[snowflow-server] ${signal} — shutting down`);
    await disconnectRedis();
    httpServer.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 5_000).unref();
}

process.on("SIGINT", () => {
    void shutdown("SIGINT");
});
process.on("SIGTERM", () => {
    void shutdown("SIGTERM");
});
