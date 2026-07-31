# SNOWFLOW Architecture (Phase 0 Foundation)

**เป้าหมาย:** โครงที่แข็ง แยกขอบเขตชัด พังแล้วไล่จุดซ่อมได้เร็ว ระดับทีมเล็ก (2–5)

## 1. Monorepo layout

```text
snowflow_demo/
├── package.json                 # workspaces root — scripts รวม
├── packages/
│   ├── client/                  # Babylon.js + WebGPU + HUD (Vite)
│   │   ├── index.html
│   │   ├── vite.config.js
│   │   └── src/                 # เดิมคือ root src/
│   ├── server/                  # Colyseus + Express
│   │   └── src/
│   │       ├── index.js         # HTTP + game server boot
│   │       ├── app.config.js
│   │       └── rooms/ZoneRoom.js
│   └── shared/                  # สัญญาเดียวระหว่าง client ↔ server
│       └── src/
│           ├── protocol.js      # PROTOCOL_VERSION, room names
│           ├── constants.js     # tick, AOI, spawn
│           └── schema/          # player + zone snapshots
├── docs/
│   ├── ARCHITECTURE.md          # ไฟล์นี้
│   ├── FIX-RUNBOOK.md           # เวลาพัง ไล่ยังไง
│   ├── game_roadmap.md
│   ├── GUIDE.md
│   └── HANDOFF.md
└── .github/workflows/ci.yml
```

## 2. Boundary rules (อย่าฝ่า)

| ชั้น | ใส่ได้ | ห้ามใส่ |
|------|--------|---------|
| `@snowflow/shared` | protocol version, field lists, pure helpers, constants | Babylon, DOM, Express, secrets |
| `@snowflow/server` | rooms, auth later, persistence later | rendering, WGSL, DOM |
| `@snowflow/client` | render, input, HUD, prediction | DB writes, authoritative damage |

**กติกาทอง:** ถ้า client กับ server ไม่ตรงกัน → แก้ที่ `shared` ก่อน แล้วค่อยแตะสองฝั่ง

## 3. Dependency direction

```text
client ──imports──▶ shared
server ──imports──▶ shared
client ✖ server   (ห้าม import ข้ามโดยตรง)
server ✖ client
```

## 4. Runtime (local)

| Process | Command | Port |
|---------|---------|------|
| Client (Vite) | `npm run dev:client` | 5173 |
| Server (Colyseus) | `npm run dev:server` | 2567 |
| Health | `GET http://localhost:2567/health` | |

Vite proxies `/colyseus` → `localhost:2567` (WS).

## 5. Phase map (code ownership)

| Phase | แตะ package หลัก |
|-------|------------------|
| 0 Foundation | ทั้ง monorepo + shared contracts |
| 1 Movement + AOI | server `ZoneRoom`, client `net/`, shared schema |
| 2 Combat | server validate + client feel |
| 3+ | ตาม roadmap — อย่ายัด logic ใหม่ลง `main.js` โดยไม่มี owner module |

## 6. Module map ฝั่ง client (ของเดิม SNOWFLOW)

```text
packages/client/src/
  main.js          orchestration only
  terrain/         height + deform + clipmap
  character/       controller, figure, cloth, contact
  render/          sky, shadows, depth
  world/           shrine / demo scene content
  spells/          demo combat VFX (scope-cut candidate)
  ui/              DOM HUD + motion (GSAP) — ไม่ใช้ Babylon.GUI
  net/             multiplayer session (Phase 0 stub)
  core/            settings, input, loading, perf
```

**Reusable vs demo-specific:**  
Reusable ≈ `terrain/`, `character/`, `render/`, `core/` (บางส่วน), `ui/motion`  
Demo-specific ≈ `world/shrine`, spell set, surf-heavy paths — ตัด scope ทีหลังได้โดยไม่รื้อ monorepo

## 7. Why this shape (enterprise-lite)

1. **Blast radius เล็ก** — พัง server ไม่ rebuild client shader  
2. **Contract test ได้** — `shared` มี unit test รันใน CI  
3. **Rollback ชัด** — กลับ commit ก่อนย้าย `packages/`  
4. **ทีมแยกงานได้** — client / server / design อ่านคนละ package  
5. **ไม่ over-engineer** — ยังเป็น JS ESM ล้วน ไม่บังคับ TS ทั้งก้อนใน Phase 0
