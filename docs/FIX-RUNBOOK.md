# Fix Runbook — เมื่อระบบพัง ไล่ยังไง

ใช้ตามลำดับ **บนลงล่าง** อย่ากระโดดไป refactor ใหญ่ก่อนมีหลักฐาน

## 0. รวบหลักฐานก่อน (2 นาที)

```bash
git status -sb
node -v          # ต้องการ >= 20
npm -v
npm run check    # shared + server syntax + client build
```

บันทึก: command ที่พัง, error บรรทัดแรก, package ไหน (`client` / `server` / `shared`)

## 1. แยกชั้นที่พัง

| อาการ | ชั้นต้องสงสัย | จุดเปิดแรก |
|--------|----------------|------------|
| หน้าเว็บไม่ขึ้น / Vite error | client | `packages/client`, `npm run dev:client` |
| build WGSL / Babylon | client render | `src/shaders`, `src/terrain`, `src/main.js` |
| ต่อ multiplayer ไม่ได้ | server หรือ net | `GET :2567/health`, `src/net/session.js` |
| join ได้แต่ state เพี้ยน | **shared** ก่อน | `PROTOCOL_VERSION`, `schema/player.js` |
| CI แดง | ตาม job ที่ fail | `.github/workflows/ci.yml` |

## 2. Health checks มาตรฐาน

### Shared
```bash
npm run build:shared
npm run typecheck -w @snowflow/shared
npm test -w @snowflow/shared
```

### Server
```bash
npm run dev:server
curl http://localhost:2567/health
```
ต้องได้ JSON มี `ok: true` และ `protocolVersion`

### Redis (local Docker via WSL)
```bash
npm run redis:up
npm run redis:ping    # ต้องได้ PONG
# /health ควรมี redis: { configured: true, ok: true, ping: "PONG" }
npm run redis:down    # หยุด container (ข้อมูลยังอยู่ใน volume)
```
ถ้า `redis:up` พัง: เปิด WSL Ubuntu แล้ว `docker info` — daemon ต้องรัน

### Client
```bash
npm run dev:client
# เปิด http://localhost:5173 — ต้อง boot SNOWFLOW แบบ offline ได้แม้ server ปิด
npm run build:client
```

### Multiplayer (Phase 1)
```bash
npm run dev:server
npm run dev:client
# Tab A + B: http://localhost:5173/?mp=1
# หรือ DevTools: await SNOWFLOW.multiplayer.connect()
```
ถ้า join ไม่ขึ้น: ตรวจ Vite proxy `/colyseus`, `PROTOCOL_VERSION` (shared 0.2.x)

## 3. Protocol mismatch

ถ้า log มี `protocol mismatch`:
1. เปิด `packages/shared/src/protocol.js`
2. ให้ client และ server ใช้ export เดียวกัน (ห้าม hardcode คนละที่)
3. bump `PROTOCOL_VERSION` เฉพาะตอน schema เปลี่ยนจริง แล้วอัปทั้งสอง process

## 4. Import / workspace พัง

```bash
# จาก root เท่านั้น
npm install
npm run build:client
```

- ห้าม `npm install` แยกใน package โดยไม่จำเป็น (workspaces โหมด root)
- alias `@snowflow/shared` อยู่ที่ `packages/client/vite.config.js`
- server ใช้ Node resolution ผ่าน workspaces name `@snowflow/shared`

## 5. หลังย้าย monorepo แล้ว path เก่า

| เก่า (root) | ใหม่ |
|-------------|------|
| `src/` | `packages/client/src/` |
| `index.html` | `packages/client/index.html` |
| `vite.config.js` | `packages/client/vite.config.js` |
| `npm run dev` | `npm run dev` (root → client) หรือ `dev:server` |

ถ้า editor ยังชี้ path เก่า — re-open folder / ลบ cache

## 6. Game loop / shrine regressions (ของเดิม)

ยังใช้กฎจาก `docs/HANDOFF.md`:
- ground sampler = `shrine` ไม่ใช่ raw terrain ในลาน
- `stampSnow()` หลัง `terrain.warmUp()`
- อย่า derive collision จาก mesh

## 7. Rollback

```bash
# กลับก่อนงาน monorepo (ตัวอย่าง)
git log --oneline -15
git revert <bad-commit>   # ชอบกว่า reset ถ้า push แล้ว
# หรือ local only:
git checkout <good-sha> -- packages package.json
```

## 8. กฎเวลาซ่อม (ทีม)

1. แก้ทีละชั้น — อย่าพร้อมกัน client+server+shared ใน PR เดียวถ้าไม่จำเป็น  
2. มี failing test/build แปะใน PR  
3. ปิดท้ายด้วย: สาเหตุ / ไฟล์ที่แตะ / วิธี verify / residual risk
