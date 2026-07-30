# Changelog — snowflow_demo (Frame)

เอกสารนี้สรุป **สิ่งที่เพิ่ม/แก้จาก upstream Init (`5450397`)**  
Upstream เดิม = tech demo หิมะ WebGPU (ไม่มี jump / rebind / crosshair)

รูปแบบ: [SemVer ภายใน fork] — ใหม่ → เก่า

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
