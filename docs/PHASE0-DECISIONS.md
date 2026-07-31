# Phase 0 — Decisions log

อัปเดตเมื่อตัดสินใจ stack / scope / structure (source of truth ร่วม roadmap)

| วันที่ | หัวข้อ | การตัดสินใจ | เหตุผล | สถานะ |
|--------|--------|-------------|--------|--------|
| 2026-07-31 | Monorepo | `packages/{client,server,shared}` + npm workspaces | แยก blast radius, ทีมแยกงาน, contract กลาง | ทำแล้ว |
| 2026-07-31 | Client UI motion | DOM + GSAP — **ไม่ใช้** Babylon.GUI | ตรง skill babylon-gui + HUD เดิมเป็น DOM | ทำแล้ว |
| 2026-07-31 | Shared language | JS ESM + JSDoc ก่อน; TS ค่อยใส่ที่ schema ภายหลัง | ลด cost migrate ทั้ง demo ใน Phase 0 | ทำแล้ว |
| 2026-07-31 | Net stack | Colyseus room `zone` + Express `/health` | ตรง roadmap Phase 0–1 | scaffold แล้ว |
| 2026-07-31 | Data store | PostgreSQL + Redis — **ยังไม่ติดตั้ง** ใน Phase 0 scaffold | ยังไม่ persistence จน Phase 3; กัน scope creep | เลื่อน |
| 2026-07-31 | Redis local | Docker Compose `redis:7-alpine` + `REDIS_URL` + server `/health.redis` | เตรียม presence/matchmaker; ยังไม่ใช้ใน ZoneRoom | ทำแล้ว (infra) |
| 2026-07-31 | Postgres host | Supabase project `Road-Frontier` (Asia-Pacific) — secrets ใน `.env` เท่านั้น | จอง DB ก่อน Phase 3 auth/inventory | ทำแล้ว (infra only) |
| TBD | Scope cut spells | เก็บ 5 spells ไว้ก่อน | demo ยังใช้โชว์ VFX; ตัดเมื่อเริ่ม combat จริง | เปิด |
| TBD | Scope cut surf | เก็บ surf ไว้ก่อน | ตัวขายของ SNOWFLOW; ตัดเมื่อต้องการ perf ตัวละคร/มอนสเตอร์ | เปิด |
| TBD | CI lint | build + shared tests ก่อน; ESLint ทีหลัง | เกณฑ์เขียวเร็วก่อน ruleset ยาว | บางส่วน |

## Done criteria (จาก roadmap) — checklist

- [x] โครง `client` / `server` / `shared`
- [x] CI พื้นฐาน (build client + server check + shared test)
- [x] Tech stack ยืนยันบนกระดาษ + server process ขึ้นได้
- [ ] Client เดินในโซนผ่าน network (ต้อง Phase 1 movement)
- [ ] ทีม role แบ่งงาน formal (document เมื่อมีคนร่วม)

## วิธี verify ตอนนี้

```bash
npm install
npm run check
npm run dev:server   # terminal 1 — :2567/health
npm run dev:client   # terminal 2 — :5173 offline demo
```
