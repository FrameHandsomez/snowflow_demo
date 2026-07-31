# Changelog — snowflow_demo (Frame)

เอกสารนี้สรุป **สิ่งที่เพิ่ม/แก้จาก upstream Init (`5450397`)**  
Upstream เดิม = tech demo หิมะ WebGPU (ไม่มี jump / rebind / crosshair)

รูปแบบ: [SemVer ภายใน fork] — ใหม่ → เก่า

---

## [Unreleased]

**Branch:** `feature/foundation&decisions`  
**ก่อนหน้า:** courtyard pad / spawn ruin บน `main`

### Added
- **Phase 0 monorepo foundation (enterprise-lite)**
  - `packages/client` — ย้าย SNOWFLOW demo ทั้งก้อน (`src/`, `index.html`, Vite)
  - `packages/server` — Colyseus `ZoneRoom` + Express `GET /health` (port 2567)
  - `packages/shared` — `PROTOCOL_VERSION`, player/zone snapshot contracts, constants (AOI/tick)
  - npm workspaces root scripts: `dev:client`, `dev:server`, `check`, `build:*`
  - CI: `.github/workflows/ci.yml` (shared test + server check + client build)
  - Docs: `docs/ARCHITECTURE.md`, `docs/FIX-RUNBOOK.md`, `docs/PHASE0-DECISIONS.md`
  - Client net stub: `packages/client/src/net/session.js` (ไม่ auto-connect — offline ยังรันได้)
  - HUD motion: DOM + GSAP (`packages/client/src/ui/motion.js`) — ไม่ใช้ Babylon.GUI
- **Shrine courtyard flat pad** (CPU + GPU height sync)
  - constants: `COURTYARD_RADIUS = 20.0`, `COURTYARD_BLEND = 10.0`
  - shared WGSL: `src/shaders/lib/snowCourtyard.wgsl` (`courtyardWeight` /
    `courtyardFlattenHeight` / `courtyardFlattenGrad`) — smoothstep `1 - t²(3-2t)`
  - GPU order (beauty / shadow depth / prepass): **macro → courtyard flatten → fine → deform**
  - CPU: `SpawnShrine.padWeight` / `heightAt` / `normalAt` — macro heightfield + pad only
  - wire: `terrain.setCourtyardPad(shrine.padY)`; controller / figure / camera ใช้
    `shrine` เป็น ground sampler (ไม่ใช่ raw `terrain`)
  - multi-pass uniforms: `courtyardCenter|Radius|Blend|PadY` บน snow + depth + prepass materials
- **Permanent spawn ruin / shrine** รอบจุดเริ่มทุก run
  - ไฟล์ใหม่: `src/world/shrine.js`
  - shaders: `src/shaders/shrine.vertex.wgsl`, `shrine.fragment.wgsl`,
    `shrineDepth.vertex.wgsl`, `shrinePrepass.vertex.wgsl` + register ใน `registry.js`
  - modular courtyard: approach steps, broken gate, side walls, 5 pillars,
    tiered altar, rubble — วางบน shared `padY` (ไม่ stair-step dunes)
  - spawn กลางลาน: `SHRINE_SPAWN = { x: 8, z: -6 }`
  - snow compression หลัง `await terrain.warmUp()` ผ่าน `shrine.stampSnow()`
  - beauty / cascade shadow / camera-depth prepass ครบ; expose `SNOWFLOW.shrine`
- **Shrine gameplay collision volumes** (AABB แยกจาก render mesh)
  - blocker: gate piers, side walls, pillars, altar base
  - non-block: shallow steps, low rubble, elevated lintel, upper altar tiers
  - player resolve แกน X แล้ว Z (wall slide) ใน `CharacterController`
  - constants: `COLLISION_RADIUS` 0.34 · `COLLISION_HEIGHT` 1.55
- **Shrine camera obstruction**
  - spring-arm ตัดกับ AABB ชุดเดียวกับ player (`rig.obstacles`)
  - socket → desired eye, nearest slab entry, retract เร็ว / expand ช้า
  - คง ground clearance + trauma shake หลัง obstruction solve
  - `rig.groundAt` ใช้ `shrine.heightAt` เพื่อไม่ให้ arm นั่งบน dune ในลาน
- **Skill bar HUD** (ล่างจอ, วงกลม 5 ช่อง แบบในภาพอ้างอิง)
  - ไฟล์ใหม่: `src/ui/skillBar.js`
  - แสดงสกิล 1–5: Sweep / Ribbon (hold) / Bloom / Crystallize / Vortex
  - วง progress ตอน cast + ตัวเลขเวลาที่เหลือ · key จาก bindings · flow cost แต่ง (ไม่ gate)
  - `SpellSystem.hudSlots()` สำหรับ snapshot ต่อเฟรม
  - F1 → HUD → **Skill bar** (`S.showSkillBar`)

### Changed
| ไฟล์ | สาระ |
|---|---|
| `src/main.js` | construct shrine, `setCourtyardPad`, ground sampler = shrine, stamp หลัง warmUp |
| `src/world/shrine.js` | pad constants, `padWeight`/`heightAt`/`normalAt`, pad-level modules, stamp brushes |
| `src/terrain/terrain.js` | courtyard uniforms + `setCourtyardPad` บน beauty/depth/prepass |
| `src/shaders/*` | snowCourtyard include + flatten path ครบ 4 passes |
| `src/character/controller.js` | optional static obstacles + `_resolveObstacles` |
| `src/core/camera.js` | shoulder socket arm + `nearestAabbEntry` obstruction |
| `src/shaders/registry.js` | register shrine WGSL + `snowCourtyard` include |

### Fixed
- Courtyard pad หลุดจาก `main` หลัง branch reset — กู้บน `feature/shrine-courtyard-pad-restore`
  แล้ว fast-forward เข้า `main` (`062db6f`)
- `stampSnow()` หลุดจาก warm-up path ใน restore เดิม — ใส่กลับหลัง `terrain.warmUp()`
- Fragment courtyard normal flatten ไม่มี gate `radius > 0` — จัดให้ตรง vertex/depth/prepass
- Gameplay hint ยกขึ้นเหนือ skill bar โดยเว้นทั้ง heading และ flow-cost labels (desktop/mobile แยก spacing)
- Dev server ที่ `localhost` และ `127.0.0.1` เคยเป็น Vite คนละ process; runtime ปัจจุบันรัน instance เดียวแบบ dual-stack (`npm run dev -- --host ::`)

### Notes / risks
- collision **ไม่** derive จาก mesh triangles หรือ Babylon picking
- `stampSnow()` ต้องหลัง `terrain.warmUp()` ไม่งั้น brush ถูกล้าง
- CPU ground = **macro + pad** เท่านั้น; GPU ยังวาง fine/deform บน base ที่ flatten แล้ว (ตั้งใจ)
- browser WebGPU visual QA ใน in-app browser ยัง best-effort (เคยค้างที่ `creating device`)
- อย่า stage `package-lock.json` / `.zcode/` กับงาน shrine
- **ทุก commit / ปิดงานต้องอัปเดต `CHANGELOG.md`**

---

## [0.2.0] — 2026-07-30 — Frame playability pass

**ธีมเวอร์ชัน:** เล่นได้จริง — ตั้งปุ่ม · crosshair · กระโดด/flip/ollie · เอกสาร handoff  
**Base:** `5450397` Init  
**Branch:** `main`

### Highlights

1. **Rebind 2 ช่อง** ต่อ action + persist `localStorage`
2. **Valorant-style crosshair** import code + สี + slider ใน F1
3. **Jump / double+front-flip / surf ollie** + pose แบบ body-local
4. **CHANGELOG / HANDOFF / GUIDE** สำหรับทำต่อ

---

### Added

#### Input & controls
- **Rebindable keys** (primary + secondary ต่อ action)
  - ไฟล์ใหม่: `src/core/bindings.js`
  - `localStorage` key `snowflow.bindings.v2` (migrate จาก v1)
  - UI: F1 → **Controls** (คลิกตั้ง · คลิกขวาล้าง · reset keys)
- Action **`jump`** default `Space`
- Snow-surf default **RMB** (ไม่แชร์ Space กับ jump)
- Rising-edge jump: `input.jumpPressed` ใน `pollInput`

#### Crosshair / HUD
- ไฟล์ใหม่: `src/ui/crosshair.js`
- Reticle: center dot + inner/outer lines + outline
- Import share string (vcrdb / in-game style)
- Color presets + hex / color picker
- Live sliders (outline / dot / inner / outer)
- Settings: `S.showCrosshair`, `S.crosshairCode`
- Profile: `localStorage` `snowflow.crosshair.v2`
- Default = vcrdb “Small Dot”:  
  `0;P;d;1;f;0;0t;4;0l;1;0o;0;0a;1;0f;0;1b;0`

#### Locomotion — jump family
- Vertical jump + gravity ใน `CharacterController`
- Coyote time + jump buffer + takeoff lock
- Variable jump (ปล่อย Space เร็ว = ตัด `velY`)
- **Double jump** (Space ครั้ง 2 ตอนลอย) + **front flip**
  - state: `flipAngle`, `flipTuck`, `flipping`, `jumpsUsed`
- **Surf ollie** (RMB hold + Space บนบอร์ด grounded)
  - state: `surfAir`, `olliePhase`, `_ollieT`
  - air steer: `_ollieAirSteer` (ไม่ดึงลง walk cap)
- `jumpKind`: 0 none · 1 ground · 2 double · 3 ollie

#### Animation / VFX
- Figure: air / flip ball-tuck / ollie board stance / land squash
- Body-local airborne feet (ankle ตาม root frame ตอน spin)
- Snap เท้าตอน takeoff / เริ่ม flip (กัน damp จาก plant → ขายืด)
- `snowContact`: skip scuff ตอนลอย · land splat · takeoff `_burst` ตาม `jumpKind`
- Camera trauma เล็กน้อยตอน double / ollie / hard land

#### Docs / UX
- `CHANGELOG.md` (ไฟล์นี้)
- `HANDOFF.md` — สถานะ session + แผนที่ไฟล์
- `GUIDE.md` — อยากแก้ X ไปที่ไหน
- `README.md` / `index.html` hint — controls ใหม่

---

### Changed

| ไฟล์ | สาระ |
|---|---|
| `src/core/input.js` | อ่าน bindings · jump edge · surf/sprint |
| `src/core/settings.js` | กลุ่ม HUD crosshair |
| `src/ui/overlay.js` | Controls rebind + HUD crosshair panel |
| `src/main.js` | mount `Crosshair`, `SNOWFLOW.crosshair` |
| `src/character/controller.js` | jump / double / flip / ollie physics + pose clocks |
| `src/character/figure.js` | pose จาก jump/flip/ollie · body-local feet |
| `src/character/snowContact.js` | airborne + burst/land FX |
| `README.md`, `index.html` | copy ปุ่ม / hint |

**ค่า physics ที่ใช้ตอน ship 0.2.0 (โดยประมาณ)**
- `JUMP_SPEED` ~4.85 · `JUMP_DOUBLE` ~4.55 · `JUMP_SURF` ~5.45
- `OLLIE_BOOST` ~1.55 + `OLLIE_BOOST_SPEED` ~2.35 · cap ~`SURF_MAX * 1.06`
- `FLIP_TIME` ~0.72s · `OLLIE_POSE_TIME` ~0.55s
- Flip tuck คง ball ส่วนใหญ่ของรอบ · เปิดขาช่วงท้ายก่อนลง

---

### Fixed

| อาการ | แก้ |
|---|---|
| Space ทีเดียวแล้วกระโดดไม่หยุด | rising-edge + `_jumpArmed` (ต้องปล่อย) |
| Double ไม่ม้วน | เอา gate `air > 0.2` ออก (blend ช้า) |
| Flip กระตุก / แยกจาก pitch | `flipAngle` บน root โดยไม่ผ่าน pitch damp |
| Ollie พุ่งไกลเกิน | ลด boost/cap + air drag + `_ollieAirSteer` |
| ท่า mid-air แบบ **layout ศพ / Superman** | snap เท้า body-local · ball tuck ตลอด flip · ตัด surf lean ตอนลอย · เคลียร์ `surfAir` ตอน double |
| Ollie ปน flip 360 | แยก timeline `olliePhase` · clear flip state ตอน surf takeoff |
| Dual-slot rebind UI ไม่ขึ้น (Vite เก่า) | restart dev server + hard refresh |

---

### Files in this release

**New**
- `src/core/bindings.js`
- `src/ui/crosshair.js`
- `CHANGELOG.md`
- `HANDOFF.md`
- `GUIDE.md`

**Modified**
- `src/character/controller.js`
- `src/character/figure.js`
- `src/character/snowContact.js`
- `src/core/input.js`
- `src/core/settings.js`
- `src/ui/overlay.js`
- `src/main.js`
- `README.md`
- `index.html`

**ไม่แตะ (ยังเป็น upstream)**  
terrain / WGSL snow / spells core / post / sky / wake หลัก / cloth โครงเดิม

---

### Known limitations

- Crosshair parser ไม่ครบทุก field ของ Valorant (error/move outer ฯลฯ) — import ยอดนิยม + ปรับมือใช้ได้
- Flip / ollie เป็น **procedural pose** ไม่ใช่ animation clip จาก DCC
- ยังไม่มี mesh “snowboard” แยก — ollie อ่านจาก feet/arms + `surfAir`
- Bindings / crosshair อยู่ใน `localStorage` ของ browser นั้น — ไม่ sync ข้ามเครื่อง
- Flip feel ยัง tune ต่อได้ (ความเร็วหมุน / ความลึก tuck / timing เปิดขา)

---

### How to run

```bash
cd snowflow_demo
npm install
npm run dev   # http://localhost:5173/  (WebGPU)
```

**ลองเร็ว**
- Space = jump · Space อีกทีตอนลอย = double + flip  
- RMB = surf · RMB+Space = ollie  
- F1 = rebind + crosshair  

---

## Upstream baseline

- `5450397` **Init** — SNOWFLOW WebGPU snow demo (Babylon + hand WGSL)
- Controls เดิม: WASD, Shift, RMB surf, 1–5 spells, F1  
  (ไม่มี jump / rebind / crosshair)
