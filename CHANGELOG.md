# Changelog — snowflow_demo (Frame)

เอกสารนี้สรุป **สิ่งที่เพิ่ม/แก้จาก upstream Init (`5450397`)**  
Upstream เดิม = tech demo หิมะ WebGPU (ไม่มี jump / rebind / crosshair)

รูปแบบ: [SemVer ภายใน fork] — ใหม่ → เก่า

---

## [Unreleased]

**Branch:** `feature/foundation&decisions`  
**ก่อนหน้า:** courtyard pad / spawn ruin บน `main`  
**Wire protocol ปัจจุบัน:** `@snowflow/shared` **0.3.3**

### Added
- **Remote pose fidelity (surf + cast + gait)** — protocol **0.3.3**
  - move snapshots carry `surf` / `carve` / `gaitPhase` / `cast` / `castAimX|Y|Z`
  - remote puppet: snappy board blend (floor 0.92 while surfing), carve from lean, cast-arm hold
  - speed scaled to local `SURF_MAX` (19.5) so pitch/lean curves match
  - stepping rules match local controller (no run-gait while surfing)
  - figure: surf arm pose yields to cast so spells read while snow-surfing
  - leave-surf without `surf` number decays remote board blend (≤0.15) so stance does not stick
  - **Verified:** shared tests 14/14 (`applyMove` surf/carve/gaitPhase + surfing boolean fallback)

- **AOI leave lifecycle (Phase 1 interest complete)** — protocol **0.3.2**
  - `MSG_INTEREST_LEFT` when a peer leaves *this observer's* AOI (still in room; not a full disconnect)
  - server per-observer interest sets; on move: leave + re-enter (`MSG_PLAYER_JOINED` + pose `MSG_STATE`)
  - client `RemotePlayers` despawns on `interest_left`; room leave still uses `MSG_PLAYER_LEFT`
  - shared `diffInterest()` + unit test; headless smoke `packages/server/scripts/aoi-interest-smoke.mjs`
  - **Verified:** smoke PASS (leave + re-enter, `leaked_while_far=0`); shared tests 12/12

- **Phase 1 multiplayer movement (vertical slice)**
  - shared `PROTOCOL_VERSION` **0.3.x**: `MSG_MOVE` / `MSG_STATE` / `MSG_DEFORM*` / `MSG_SPELL*` / `MSG_INTEREST_LEFT`, AOI helpers, deform and visual-spell contracts
  - server `ZoneRoom`: validate move step/speed, AOI-filtered broadcast + interest enter/leave, deform relay, spell event format/target-range validation
  - client `net/`: `Multiplayer`, `MoveSampler` (20Hz), `RemotePlayers` + full procedural `RemoteCharacter`, `DeformNet`, `SpellNet`
  - remote hunters render as the existing procedural character; remote shadows are intentionally disabled until LOD exists
  - spell keys 1–5 render for nearby peers; Ribbon sends start/release. Damage/cooldown authority remains Phase 2
  - jump/flip/ollie fields on move snapshots (`air` / `velY` / `jumpKind` / `flipAngle` / `flipTuck` / `flipping` / `olliePhase`) — since **0.3.1**
  - opt-in connect: `?mp=1` or `localStorage snowflow.mp=1` or `SNOWFLOW.multiplayer.connect()`
  - offline demo still default; remote LOD / input-replay prediction ยังไม่
  - headless smokes: `packages/server/scripts/spell-broadcast-smoke.mjs`, `aoi-interest-smoke.mjs`

### Docs
- **`docs/game_roadmap.md`** — Phase 0/1 status ตรง 2026-08-01: Phase 1 vertical slice **ปิด** (protocol 0.3.3, 2-client QA ผ่าน, tip `4ea6b64`); next = Phase 2 combat; ค้าง prediction replay / remote LOD / surf deform authority แยกเป็น polish
- **`docs/HANDOFF.md`** — next actions เลื่อนไป Phase 2 หลัง Frame ยืนยัน QA + push

### Fixed
- **Remote snow-surf FX missing for peer A (observer)**
  - root cause: Phase 1 remote puppet had pose (`surf`/`carve`/speed) but **no** local `SnowContact` / `SurfWake` — only the local hunter stamped snow
  - `RemoteCharacter` now builds `SnowContact(puppet, terrain.deform, figure, spray)` + `SurfWake(..., puppet, spray, worldTerrain)`
  - uses `opts.spellTerrain` (full deform field) not shrine-only sampler; shares observer `SprayField`
  - per-frame: figure → contact → wake; `sync(localCamera)` feeds observer cam into wake fog/shadows
  - **no new wire messages** — driven entirely from existing move pose samples (same as local controller contract)
  - pitfall fixed mid-session: do **not** inject `SnowContact` into `Character` core / module top-level (broke boot); keep FX on `RemoteCharacter` only
  - dispose: disable + dispose wake mesh/material/dataTex when remote leaves AOI/room
- **Join / welcome pose snap (Phase 1)**
  - `Multiplayer.applyWelcomePose(welcome)` — XZ + yaw from server `welcome.player`; Y from local ground (`shrine`/`terrain.heightAt`) so peers do not float on `SPAWN_POSITION.y = 0`
  - clears residual air/jump/flip on connect; logs `[mp] welcome pose …`
  - `connectZone` falls back to `SPAWN_POSITION` if `MSG_WELCOME` times out (rare race) instead of failing the whole session

- **Server move speed clamp (false rejects)**
  - do not inflate tiny wall-clock gaps to 16 ms for speed math (was freezing peers at spawn: first sample “125 m/s”, then every later step failed `MAX_MOVE_STEP` from origin)
  - speed check only when `wallDt >= 1/TICK_RATE_HZ`

- **Remote spell VFX placement / visibility (Phase 1)**
  - `RemoteSpellFx.trigger` now snaps origin from the remote puppet on the same frame (no flash at world `0,0,0`)
  - brighter unlit materials, larger rings/beam/spikes, `renderingGroupId=1`
  - `SpellNet` uses `SessionHandle.send` like deform; queues `spell_event` until remote visual exists
  - server logs silent spell drops (`normalize` / target-range) for QA

- **Remote spell proxy shape mapping (Phase 1)**
  - key→mesh now matches full spell silhouette: Sweep = crescent sheets (not torus), Ribbon = strip, Bloom = fat column, Crystallize = short 6-gon prisms + ice plates in spiral (not tall spike boxes), Vortex = rings + core

- **Remote full SpellSystem visual playback (Phase 1)**
  - `SpellSystem.playVisual(event, { origin, applyTerrainEffect:false })` drives peer casts through real water/ice/lights/spray
  - `ctx.deform` gated: `brush` no-op when `applyTerrainEffect` is false (no double snow; deform still via MSG_DEFORM*)
  - poseOverride + gated controller/rig so Sweep/Ribbon/Vortex spawn at remote, not local hunter; camera trauma suppressed
  - concurrent full remote cap (`MAX_FULL_REMOTE_SPELLS=2`); excess / error → `RemoteSpellFx` proxy fallback
  - local cast always reclaims authority (`_beginLocalAuthority`) so input is not stuck on a remote pose

- **Ribbon (key 2) hold multiplayer**
  - root cause: local `holdRibbon(false)` every frame released the shared ribbon after peer `start`
  - `_ribbonOwner` local|remote — peer hold survives until `phase:release`; pose refreshed each frame from remote puppet
  - proxy ribbon is hold-aware (long duration + release tail)

- **Remote jump / flip / ollie pose**
  - move payload + server public player + remote puppet now carry `air/velY/jumpKind/flipAngle/flipTuck/flipping/olliePhase`

- **Local Redis infra (Docker)**
  - `docker-compose.yml` — `redis:7-alpine` on `6379`, AOF + named volume
  - root scripts: `redis:up` / `redis:down` / `redis:logs` / `redis:ping` (via WSL Docker)
  - server: `ioredis` + `dotenv` load monorepo `.env`; `GET /health` reports `redis` ping
  - `REDIS_URL=redis://127.0.0.1:6379` — optional; empty disables; ZoneRoom ยังไม่พึ่ง Redis

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
  - shared WGSL: `src/shaders/lib/snowCourtyard.wgsl` (`courtyardWeight` / `courtyardFlattenHeight` / `courtyardFlattenGrad`) — smoothstep `1 - t²(3-2t)`
  - GPU order (beauty / shadow depth / prepass): **macro → courtyard flatten → fine → deform**
  - CPU: `SpawnShrine.padWeight` / `heightAt` / `normalAt` — macro heightfield + pad only
  - wire: `terrain.setCourtyardPad(shrine.padY)`; controller / figure / camera ใช้ `shrine` เป็น ground sampler (ไม่ใช่ raw `terrain`)
  - multi-pass uniforms: `courtyardCenter|Radius|Blend|PadY` บน snow + depth + prepass materials

- **Permanent spawn ruin / shrine** รอบจุดเริ่มทุก run
  - ไฟล์ใหม่: `src/world/shrine.js`
  - shaders: `src/shaders/shrine.vertex.wgsl`, `shrine.fragment.wgsl`, `shrineDepth.vertex.wgsl`, `shrinePrepass.vertex.wgsl` + register ใน `registry.js`
  - modular courtyard: approach steps, broken gate, side walls, 5 pillars, tiered altar, rubble — วางบน shared `padY` (ไม่ stair-step dunes)
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
- Courtyard pad หลุดจาก `main` หลัง branch reset — กู้บน `feature/shrine-courtyard-pad-restore` แล้ว fast-forward เข้า `main` (`062db6f`)
- `stampSnow()` หลุดจาก warm-up path ใน restore เดิม — ใส่กลับหลัง `terrain.warmUp()`
- Fragment courtyard normal flatten ไม่มี gate `radius > 0` — จัดให้ตรง vertex/depth/prepass
- Gameplay hint ยกขึ้นเหนือ skill bar โดยเว้นทั้ง heading และ flow-cost labels (desktop/mobile แยก spacing)
- Dev server ที่ `localhost` และ `127.0.0.1` เคยเป็น Vite คนละ process; runtime ปัจจุบันรัน instance เดียวแบบ dual-stack (`npm run dev -- --host ::`)

### Notes / risks
- multiplayer wire: client กับ server ต้อง match `PROTOCOL_VERSION` major (ปัจจุบัน **0.3.2**); รีสตาร์ททั้งสอง process หลัง bump
- AOI cell = 64 m, Chebyshev r=1 (3×3); ทดสอบ leave ต้องเดินห่าง ~2+ cells ไม่ใช่แค่ spawn ชิด
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
| `src/core/input.js` | อ่าน bindings · jump edge · surf/sprint |
| `src/core/settings.js` | กลุ่ม HUD crosshair |
| `src/ui/overlay.js` | Controls rebind + HUD crosshair panel |
| `src/main.js` | mount `Crosshair`, `SNOWFLOW.crosshair` |
| `src/character/controller.js` | jump / double / flip / ollie physics + pose clocks |
| `src/character/figure.js` | pose จาก jump/flip/ollie · body-local feet |
| `src/character/snowContact.js` | airborne + burst/land FX |

**ค่า physics ที่ใช้ตอน ship 0.2.0 (โดยประมาณ)**
- `JUMP_SPEED` ~4.85 · `JUMP_DOUBLE` ~4.55 · `JUMP_SURF` ~5.45
- `OLLIE_BOOST` ~1.55 + `OLLIE_BOOST_SPEED` ~2.35 · cap ~`SURF_MAX * 1.06`
- `FLIP_TIME` ~0.72s · `OLLIE_POSE_TIME` ~0.55s
- Flip tuck คง ball ส่วนใหญ่ของรอบ · เปิดขาช่วงท้ายก่อนลง

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

### Known limitations
- Crosshair parser ไม่ครบทุก field ของ Valorant (error/move outer ฯลฯ) — import ยอดนิยม + ปรับมือใช้ได้
- Flip / ollie เป็น **procedural pose** ไม่ใช่ animation clip จาก DCC
- ยังไม่มี mesh “snowboard” แยก — ollie อ่านจาก feet/arms + `surfAir`
- Bindings / crosshair อยู่ใน `localStorage` ของ browser นั้น — ไม่ sync ข้ามเครื่อง
- Flip feel ยัง tune ต่อได้ (ความเร็วหมุน / ความลึก tuck / timing เปิดขา)

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
