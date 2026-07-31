# GUIDE — อยากแก้ / เพิ่มอะไร ไปที่ไหน

คู่มือสำหรับ Frame (และ AI ตัวถัดไป) เวลาต่อจากงาน session นี้  
โครงสร้าง upstream เดิมยังอ่าน `README.md` ได้

---

## 1) แผนที่โฟลเดอร์ (ส่วนที่เราแตะ)

```text
snowflow_demo/
├── index.html              # hint bar ล่างจอ
├── README.md               # overview + controls
├── CHANGELOG.md            # สิ่งที่เปลี่ยน
├── HANDOFF.md              # สถานะส่งต่อ
├── GUIDE.md                # ไฟล์นี้
├── package.json            # vite scripts
└── src/
    ├── main.js             # boot, frame loop, SNOWFLOW global
    ├── core/
    │   ├── bindings.js     # ★ keybinds 2 slots + localStorage
    │   ├── input.js        # ★ poll keys/mouse → input struct
    │   ├── settings.js     # S + SCHEMA (F1 widgets)
    │   ├── camera.js       # ★ rig, trauma, shrine arm obstruction
    │   └── …
    ├── ui/
    │   ├── overlay.js      # ★ F1 panel (Controls + HUD)
    │   ├── crosshair.js    # ★ reticle + import + color
    │   └── skillBar.js     # ★ bottom spell HUD + responsive hint spacing
    ├── character/
    │   ├── controller.js   # ★ motion + static obstacle resolve
    │   ├── figure.js       # ★ procedural skeleton pose
    │   ├── character.js    # mesh + cloth upload wrapper
    │   ├── snowContact.js  # ★ footprints + jump spray
    │   └── …
    ├── world/
    │   └── shrine.js       # ★ permanent spawn ruin + obstacle AABBs
    ├── spells/             # 1–5 abilities (ยัง logic เดิม)
    ├── terrain/            # height + deform
    ├── vfx/                # spray, surf wake
    └── shaders/            # WGSL (+ shrine*.wgsl)
```

---

## 2) ตาราง “อยากได้ → ไปไฟล์นี้”

| อยาก… | ไปที่ | หมายเหตุ |
|---|---|---|
| เปลี่ยนปุ่ม default | `src/core/bindings.js` → `DEFAULT_BINDINGS` | แล้ว reset keys หรือลบ localStorage |
| เพิ่ม action ปุ่มใหม่ | `bindings.js` + `input.js` + ผู้ใช้ action (เช่น controller) | อย่าลืม `ACTION_META` สำหรับ UI |
| UI ตั้งปุ่ม | `src/ui/overlay.js` → `_mkBindings` | 2 ปุ่มต่อแถว |
| Jump สูง/ต่ำ/gravity | `controller.js` ค่า `JUMP_*` `GRAVITY` | ดู §3 |
| Double jump / ปิด flip | `controller.js` → `canDouble` / `_doJump("double")` | |
| ความเร็วหมุน flip | `FLIP_TIME`, `_flipStep` | figure อ่าน `flipAngle` |
| Ollie ไกล/สั้น | `OLLIE_BOOST*` `JUMP_SURF` cap ใน `_doJump` | + `_ollieAirSteer` drag |
| ท่ากระโดด/ม้วน | `figure.js` `update` + `_updateFeet` + `_poseArms` | rootPitch = pitch + flipAngle |
| ฝุ่นตอนกระโดด | `snowContact.js` `_burst` / landPulse | |
| เป้าเล็ง เปิด/ปิด | F1 HUD หรือ `S.showCrosshair` | |
| รูปทรง crosshair | `crosshair.js` `DEFAULT_PROFILE` + sliders | |
| สี crosshair | overlay HUD swatches / `setColor` | |
| Import โค้ด Valorant | `crosshair.js` `profileFromCode` | field ยังไม่ครบ 100% |
| Settings ใหม่ใน F1 | `settings.js` `S` + `SCHEMA` | overlay สร้าง widget จาก schema |
| ข้อความ hint ล่าง | `index.html` `#hint` | |
| Skill bar ล่างจอ | `src/ui/skillBar.js` + `spells.hudSlots()` | F1 HUD `showSkillBar` | |
| รูปร่าง / วาง ruin | `src/world/shrine.js` → `buildMesh` / `addModule` | modules ใช้ shared `padY` |
| จุด spawn ตอนเข้าเกม | `SHRINE_SPAWN` ใน `shrine.js` + `main.js` | ตอนนี้ `{ x: 8, z: -6 }` |
| ลานแบน / ขอบ blend | `COURTYARD_RADIUS` / `COURTYARD_BLEND` + `padWeight` | GPU: `snowCourtyard.wgsl` |
| เท้าจม dune ในลาน | `main.js` ground sampler ต้องเป็น `shrine` | อย่า wire กลับ `terrain` |
| CPU vs GPU height หลุด | order: macro→courtyard→fine→deform | ดู `snow.vertex.wgsl` |
| ชนเสา/ผนัง shrine | `shrine.js` `blocksMovement` + `controller.js` `_resolveObstacles` | AABB แยกจาก mesh |
| กล้องทะลุ ruin | `camera.js` `nearestAabbEntry` + `rig.obstacles` | `rig.groundAt = shrine.heightAt` |
| กดหิมะรอบ shrine | `shrine.stampSnow()` หลัง `terrain.warmUp()` | อย่าเรียกก่อน warm-up |
| material / shadow shrine | `shrine*.wgsl` + `SpawnShrine._makeMaterial` | register ใน `registry.js` |
| ลำดับระบบต่อเฟรม | `main.js` loop | poll → controller → figure → contact → camera… |
| บันทึกงานที่ปิด | `CHANGELOG.md` [Unreleased] | **ทุก commit / ปิดงานต้องอัปเดต** |

---

## 3) จูน jump / ollie / flip (constants)

ไฟล์: `src/character/controller.js` บนสุดของไฟล์

```text
GRAVITY          แรงตก (ลบ)
JUMP_SPEED       กระโดดชั้น 1
JUMP_DOUBLE      ชั้น 2 (หลังปล่อย+กดใหม่)
JUMP_SURF        ความสูง ollie
OLLIE_BOOST      ดีดหน้าพื้นฐาน (m/s)
OLLIE_BOOST_SPEED ดีดเพิ่มตาม speed01
OLLIE_SPEED_KEEP คูณความเร็วบอร์ดตอน takeoff (1.0 = เท่าเดิม)
JUMP_CUT         ปล่อย Space เร็ว → ตัด velY
COYOTE           หน้าต่างกระโดดหลัง离开พื้น
JUMP_BUFFER      หน้าต่างกดก่อน落地
TAKEOFF_LOCK     กัน snap กลับพื้นทันที
FLIP_TIME        วินาทีต่อ 1 รอบม้วน (~0.78)
```

**State สำคัญบน controller (อ่านตอน debug)**

| field | ความหมาย |
|---|---|
| `grounded` | แตะหิมะ |
| `velY` | ความเร็วแนวตั้ง |
| `air` | 0..1 blend ลอย (ช้า — อย่าใช้ gate double) |
| `jumpsUsed` | 0 / 1 / 2 ใน airtime นี้ |
| `jumpKind` | 0 none · 1 ground · 2 double · 3 ollie (1 เฟรม) |
| `jumpPulse` / `landPulse` | spike 1 เฟรม สำหรับ pose/FX |
| `flipping` | กำลังม้วน |
| `flipAngle` | rad ที่หมุนแล้ว (0..2π) |
| `flipTuck` | 0..1 หุบตัวกลาง spin |
| `surfAir` | หลัง ollie ยังถือท่าบอร์ด |
| `_jumpArmed` | ต้องปล่อยปุ่มก่อน true อีกรอบ |

---

## 4) Spawn ruin / shrine

`src/world/shrine.js` + wire ใน `main.js`

```text
SpawnShrine
  mesh          indexed static boxes (beauty / shadow / prepass)
  obstacles     immutable world AABBs — gameplay only
  stampSnow()   deform brushes หลัง terrain.warmUp()
  update()      sky / cascade / spell-light uniforms

SHRINE_SPAWN    { x: 8, z: -6 }  — กลาง courtyard, ทางใต้เปิด
```

**กฎ**
- อย่า derive player/camera collision จาก mesh triangles
- module ที่กันคน: `addModule(..., blocksMovement = true)`
- camera ใช้ `rig.obstacles = shrine.obstacles` ชุดเดียวกับ controller
- debug: `SNOWFLOW.shrine.obstacles`, `SNOWFLOW.rig.obstacleDistance`

---

## 5) Input pipeline

```text
keydown/mousedown
    → keys[] / mouseButtons[]
pollInput()  (ต้นเฟรมใน main.js)
    → input.moveX/Z, sprint, surf, jump, jumpPressed (edge)
CharacterController.update()
    → อ่าน input.*
endFrame()
    → เคลียร์ look delta, spellPressed, jumpPressed
```

**Jump edge**
- `input.jumpPressed` = true เฉพาะเฟรมที่เพิ่งกด (rising edge ใน `pollInput`)
- `input.jump` = ยังกดค้าง (variable jump cut)

**อย่า**
- ตั้ง `jumpPressed` จาก keydown อย่างเดียวแบบเดิม (เคย bunny-hop)
- ใช้ `this.air > 0.2` เป็นเงื่อนไข double (blend ช้า)

---

## 6) Bindings API ย่อ

`src/core/bindings.js`

```js
DEFAULT_BINDINGS.jump = ["Space", ""]
DEFAULT_BINDINGS.surf = ["Mouse2", ""]

getBinding(actionId, slot)      // 0 or 1
getBindingCodes(actionId)       // non-empty codes
setBinding(actionId, code, slot)
clearBinding(actionId, slot)
resetBindings()
formatCode(code)                // "Space", "RMB", …
```

Mouse ใช้โค้ด `Mouse0` / `Mouse1` / `Mouse2`

---

## 7) Crosshair API ย่อ

`src/ui/crosshair.js` + mount ใน `main.js`

```js
SNOWFLOW.crosshair.applyCode(str)
SNOWFLOW.crosshair.setColor("#00FF00")
SNOWFLOW.crosshair.setProfile({ innerLength: 4, … })
SNOWFLOW.crosshair.getProfile()
SNOWFLOW.crosshair.reset()
```

F1 → **HUD**
- toggle Crosshair
- color swatches + picker
- paste code → **import**
- sliders General / Inner / Outer

Profile เก็บบน disk browser: `snowflow.crosshair.v2`

---

## 8) Figure pose — จุดต่อ animation

`src/character/figure.js`

| โซน | ทำอะไร |
|---|---|
| `update()` ต้นๆ | อ่าน `ch.air`, `flipAngle`, `flipTuck`, `surfAir` |
| `rootPitch = pitch + flipAngle` | **หมุนม้วนทั้งตัว** |
| `_updateFeet` branch `airborne` | เท้าตอน jump/flip/ollie |
| `_poseArms` | แขน tuck / ollie balance |
| walk/surf เดิม | อย่าทำลาย `stepping` contract กับ controller |

Controller เป็น source of motion; figure เป็น view ของ motion นั้น

---

## 8) Frame loop ลำดับ (`main.js`)

อย่าสลับมั่วโดยไม่จำเป็น:

1. `pollInput()`
2. `character.update(dt, rig)` ← physics + jump
3. `figure.update(dt)` ← pose (Character wrapper → Figure)
4. `contact.update(dt)` ← หิมะ/ฝุ่น จาก feet + pulses
5. `rig.update(...)` camera
6. spells / terrain / wake / spray / render
7. `endFrame()` input

---

## 9) Recipes เร็ว

### ปิด double jump
ใน `controller.js` `canDouble` → `false` หรือไม่เรียก `_doJump("double")`

### กระโดดได้ตอน surf โดยไม่อollie พิเศษ
ใน `canGround` เปลี่ยน `fromSurf ? "surf" : "ground"` เป็นเสมอ `"ground"`

### เพิ่มปุ่ม “slide” แยกจาก RMB
1. `DEFAULT_BINDINGS.slide = ["KeyC", ""]`
2. `ACTION_META` เพิ่มแถว
3. `input.slide` ใน poll
4. controller อ่าน `input.slide` แทน/คู่ `input.surf`

### Crosshair default เป็นเขียว
`DEFAULT_PROFILE.color = "#00FF00"` แล้วลบ `snowflow.crosshair.v2` หรือกด reset

### ล้าง keybinds ติด
F1 → Controls → **reset keys**  
หรือ console: `localStorage.removeItem("snowflow.bindings.v2")`

---

## 10) กับดักที่เจอแล้วใน session

1. **Vite เสิร์ฟไฟล์เก่า** → kill process พอร์ต 5173 แล้ว `npm run dev` ใหม่ + Ctrl+Shift+R  
2. **Space ติด surf จากเซฟเก่า** → reset keys / migration ใน `loadBindings`  
3. **Bunny hop** → ต้อง `_jumpArmed` + edge ใน poll  
4. **Flip ไม่ขึ้น** → อย่า gate double ด้วย `air` blend  
5. **Flip กระตุก** → อย่า damp `pitch` ไปที่มุม 0..2π; ใช้ `flipAngle` แยก  
6. **Ollie ไกลเกิน** → boost + ขาด air drag + walk air-accel ดึงผิดทาง (ตอนนี้มี `_ollieAirSteer`)

---

## 11) คำสั่ง git แนะนำ (ยังไม่รันให้ — รอ Frame)

เมื่อพร้อม commit แยกก้อน:

```bash
# 1) docs
git add CHANGELOG.md HANDOFF.md GUIDE.md README.md index.html

# 2) input/rebind
git add src/core/bindings.js src/core/input.js src/ui/overlay.js

# 3) crosshair
git add src/ui/crosshair.js src/core/settings.js src/main.js

# 4) jump gameplay
git add src/character/controller.js src/character/figure.js src/character/snowContact.js
```

หรือ commit ก้อนเดียวก็ได้ถ้า Frame ชอบ simple history

---

## 12) ติดต่อ source of truth

- โค้ดจริงใน repo นี้ > เอกสารนี้ ถ้า conflict  
- เอกสารนี้อธิบาย **delta ของ Frame** ไม่ใช่ architecture ทั้ง SNOWFLOW upstream  
- รายละเอียด rendering หิมะ / clipmap / deform ยังอยู่ที่ `README.md` ต้นฉบับ
