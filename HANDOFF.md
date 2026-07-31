# HANDOFF — snowflow_demo (Frame)

**วันที่:** 2026-07-31  
**Repo (local):** `C:\Users\chinn\web-projects\snowflow_demo`  
**Remote:** `https://github.com/FrameHandsomez/snowflow_demo`  
**Branch งานปัจจุบัน:** `feature/shrine-courtyard-pad-restore`  
**Tip (code):** `062db6f` — courtyard pad restore (CPU/GPU height sync) — **อยู่บน `main` แล้ว**  
**Base / release ก่อนหน้า:** **v0.2.0** — Frame playability pass (`6b91898`)  
**Upstream tip ตอน clone:** `5450397 Init`

อ่านคู่กับ:
- `CHANGELOG.md` — รายการสิ่งที่เปลี่ยน (**อัปเดตทุก commit / ปิดงาน**)
- `GUIDE.md` — อยากแก้ X ไปไฟล์ไหน / ค่าไหน
- `README.md` — ภาพรวม tech demo ต้นฉบับ

---

## เป้าหมาย session ล่าสุด (courtyard pad)

1. กู้ flat courtyard pad ที่หลุดจาก `main` หลัง branch reset  
2. CPU `padWeight` / `heightAt` ตรงกับ GPU smoothstep flatten  
3. multi-pass (beauty / depth / prepass) ใช้ height path เดียวกัน  
4. ground sampler ของ controller / figure / camera = `shrine` ไม่ใช่ raw terrain  
5. `stampSnow()` หลัง `terrain.warmUp()`  
6. commit + push feature + fast-forward `main`  
7. ปิด docs debt (CHANGELOG / HANDOFF) + structural QA ขอบ pad  

งานก่อนหน้าที่ยังอยู่:
- spawn ruin mesh + collision AABB + camera obstruction (PR #1)
- playability v0.2.0: rebind, crosshair, jump/flip/ollie, skill bar

---

## รันโปรเจกต์

```bash
cd "C:\Users\chinn\web-projects\snowflow_demo"
git checkout feature/shrine-courtyard-pad-restore   # หรือ main — tip เดียวกันตอนนี้
npm install          # ถ้ายังไม่มี node_modules
npm run dev -- --host ::  # instance เดียวสำหรับ localhost + 127.0.0.1
```

ต้องการ: Chrome/Edge WebGPU (หรือ browser ที่รองรับ)

---

## สถานะโค้ด — courtyard pad + shrine

### Commits ที่เกี่ยวกับ pad / shrine (ใหม่ → เก่า)

```text
062db6f feat(world): restore shrine courtyard pad with CPU/GPU height sync
54261b3 Merge pull request #1 from FrameHandsomez/feature/spawn-ruin
331320b docs: record spawn ruin gameplay pass
63b8c1d feat(camera): block shrine camera clipping
73d59dd feat(gameplay): add shrine collision volumes
7e233f3 feat(world): build modular shrine layout
7e800bf feat(world): expand shrine spawn courtyard
5cf740b feat(world): spawn permanent ruin shrine
```

### ไฟล์สำคัญ (pad)

| ไฟล์ | หน้าที่ |
|---|---|
| `src/world/shrine.js` | `COURTYARD_*`, `padWeight`, `heightAt`, `normalAt`, `padY`, stamp |
| `src/shaders/lib/snowCourtyard.wgsl` | shared GPU weight / flatten height / flatten grad |
| `src/shaders/snow.vertex.wgsl` | beauty: macro → courtyard → fine → deform |
| `src/shaders/snow.fragment.wgsl` | macro grad flatten ก่อน fine/deform (gate radius > 0) |
| `src/shaders/terrainDepth.vertex.wgsl` | shadow depth path ตรง beauty |
| `src/shaders/terrainPrepass.vertex.wgsl` | camera-depth prepass path ตรง beauty |
| `src/terrain/terrain.js` | `setCourtyardPad`, bind courtyard uniforms ครบ 3 materials |
| `src/main.js` | `setCourtyardPad`, `CharacterController(shrine,…)`, `rig.groundAt` |

### สถาปัตยกรรมที่ต้องรักษา

- **Render mesh ≠ gameplay collision**  
  - mesh = indexed static boxes ชุดเดียว (beauty / shadow / prepass)  
  - obstacles = immutable world AABB จาก module ที่ `blocksMovement`  
  - อย่า infer collision จาก triangles / Babylon picking
- **Courtyard pad CPU/GPU sync**  
  - weight: smoothstep `1 - t²(3-2t)`, radius 20, blend 10, center `SHRINE_SPAWN`  
  - GPU flatten **หลัง macro ก่อน fine+deform** ทุก pass  
  - CPU ground = macro heightfield + pad เท่านั้น (ไม่รวม fine/sastrugi)
- **`stampSnow()` หลัง `await terrain.warmUp()`** — warm-up ล้าง brush queue
- **Camera obstruction ใช้ AABB เดียวกับ player** ผ่าน `rig.obstacles = shrine.obstacles`
- **Ground sampler ในลาน = `shrine`** — controller, figure, `rig.groundAt`
- Spawn คงที่: `SHRINE_SPAWN = { x: 8, z: -6 }` (กลางลาน, ทางใต้เปิด)

### Blockers ที่ authored แล้ว

- Gate piers  
- Four side-wall segments  
- Five tall pillars  
- Bottom altar tier  

### Non-block (ตั้งใจ)

- Low outer courtyard blocks  
- Broad approach steps  
- Elevated fallen lintel  
- Upper altar tiers  
- Low rubble  

---

## พฤติกรรมที่ควรได้ตอนนี้

| Input | ผล |
|---|---|
| เข้าเกมใหม่ | ยืนใน courtyard แบนที่ `SHRINE_SPAWN` (ไม่จม dune) |
| เดินออกขอบ blend (r≈10–20m) | พื้นค่อยๆ เอียงเข้า dunes แบบ smooth |
| เดิน/surf เข้าเสา/ผนัง/แท่น | ชนแล้ว slide ตามแกนที่ว่าง |
| หมุนกล้องรอบ ruin | arm หดก่อนทะลุ; ห่างแล้วค่อยยืดกลับ |
| Click canvas | pointer lock |
| WASD / arrows | เดิน (rebind ได้) |
| Shift | sprint |
| **Space** | jump ชั้น 1 |
| **Space อีกทีตอนลอย** (ปล่อยแล้วกดใหม่) | double + front flip |
| **RMB hold** | snow-surf |
| **RMB + Space** (บนบอร์ด) | surf ollie |
| 1–5 | spells (2 = hold) |
| Skill bar | cooldown / hold / key; ปิดได้ที่ F1 → HUD |
| F1 / `` ` `` | settings |

**กฎ jump ที่สำคัญ**
- ต้อง **ปล่อย** Space ก่อนจึงกระโดดรอบใหม่ (`_jumpArmed`)
- Double **ไม่** รอ `air > 0.2` แล้ว (เคยพังเพราะ blend ช้า)
- Flip ใช้ `flipAngle` ตรงๆ ไม่ผ่าน pitch damp

---

## localStorage (ระวังตอน debug)

| Key | ของใคร |
|---|---|
| `snowflow.bindings.v2` | keybinds |
| `snowflow.bindings.v1` | legacy (migrate แล้วลบ) |
| `snowflow.crosshair.v2` | crosshair profile |

ถ้าปุ่ม/เป้าผิดปกติ: DevTools → Application → Local Storage → ลบ key เหล่านี้ หรือ F1 → reset keys / crosshair reset

---

## Runtime debug

หลังโหลดเกม มี global:

```js
SNOWFLOW.shrine      // SpawnShrine → .padY, .padWeight, .heightAt, .obstacles, .stampSnow()
SNOWFLOW.character   // CharacterController → .obstacles, jump/surf state (terrain = shrine)
SNOWFLOW.rig         // CameraRig → .obstacles, .obstacleDistance, .groundAt
SNOWFLOW.figure      // Character (mesh wrapper) → .figure = Figure skeleton
SNOWFLOW.crosshair   // Crosshair API
SNOWFLOW.skillBar    // SkillBar API / DOM state
SNOWFLOW.input       // raw input struct
SNOWFLOW.S           // settings
```

ตัวอย่าง QA ใน console:

```js
const s = SNOWFLOW.shrine;
// core pad
s.padWeight(8, -6)            // → 1
s.heightAt(8, -6) === s.padY  // → true
// inner edge (r=10)
s.padWeight(8, 4)             // → 1
// mid blend (r=15)
s.padWeight(8, 9)             // → 0.5
// outer edge (r=20)
s.padWeight(8, 14)            // → 0
SNOWFLOW.character.obstacles === s.obstacles
SNOWFLOW.rig.groundAt(8, -6) === s.heightAt(8, -6)
```

---

## QA — courtyard pad (2026-07-31)

### Structural (อัตโนมัติ — ผ่าน)

| ตรวจ | ผล |
|---|---|
| `COURTYARD_RADIUS=20`, `BLEND=10` | ผ่าน |
| padWeight continuous ที่ r=10 (1) / r=15 (0.5) / r=20 (0) | ผ่าน |
| GPU order macro→courtyard→fine→deform ครบ 3 vertex passes | ผ่าน |
| fragment gate `courtyardRadius > 0` | ผ่าน |
| `setCourtyardPad` + controller/figure/camera ใช้ shrine | ผ่าน |
| `stampSnow` หลัง `terrain.warmUp` | ผ่าน |
| `snowCourtyard.wgsl` + registry include | ผ่าน |
| `npm run build` | ผ่าน |

### In-browser WebGPU (manual — ยังค้างให้ Frame ยืนยัน)

- [ ] เดิน core pad เท้าไม่จม dune
- [ ] เดินขอบ blend (รอบ ~10–20m) ไม่มี cliff / hitch
- [ ] ชน gate / wall / pillar / altar base แล้ว slide
- [ ] กล้องไม่ทะลุ; arm ใช้ ground จาก pad
- [ ] jump / surf / skill bar ยังปกติ

---

## งานที่ค้าง / แนวทาง Frame ต่อได้

1. **Manual WebGPU walk QA** บนขอบ blend (checklist ด้านบน)  
2. **Altar interaction zone** (checkpoint / unlock / ritual) — แยก volume จาก collision  
3. **Respawn** ผูก `SHRINE_SPAWN` หรือ checkpoint ถัดไป  
4. **Shrine presentation** — VFX / spell-light รอบ altar; triplanar stone / frost mask  
5. **Feel** — จูน ollie / flip / coyote  
6. **Optional hero asset** — `.glb` ทีหลัง (license, shadow, prepass, collision แยก)

---

## ความเสี่ยงตอนทำต่อ

| ความเสี่ยง | ทำไม |
|---|---|
| ผูก collision กับ mesh | visual tweak จะเปลี่ยน gameplay โดยไม่ตั้งใจ |
| เรียก `stampSnow` ก่อน `terrain.warmUp` | brush หาย |
| เพิ่ม module blocking แต่ลืม `blocksMovement` | เดินทะลุ |
| flatten หลัง fine/deform บน GPU | เท้าจม/ลอยที่ขอบ blend (เคยพังแล้ว) |
| ground sampler กลับไป `terrain` | dune โผล่ใต้ตัวในลาน |
| แก้ `figure.js` root pitch | กระทบ walk + surf + flip พร้อมกัน |
| `pollInput` / `endFrame` ลำดับใน `main.js` | `jumpPressed` ต้องมีชีวิตถึง `character.update` |
| Vite IPv4/IPv6 แยก process | kill process เดิม แล้วรัน `npm run dev -- --host ::` |
| in-app browser WebGPU | อาจค้างที่ `creating device` — ใช้ browser หลักทดสอบ |

---

## Git / docs กับทีม

```text
Branch:  feature/shrine-courtyard-pad-restore  (tip = main @ 062db6f)
อย่า stage: package-lock.json, .zcode/
กฎ: ทุก commit / ปิดงาน → อัปเดต CHANGELOG.md
```

### Verify ก่อน merge งานถัดไป

- [x] `npm run build` ผ่าน  
- [x] structural pad QA ผ่าน  
- [ ] manual WebGPU walk บน pad + blend  
- [ ] เดิน/surf ชน gate / wall / pillar / altar base แล้ว slide  
- [ ] กล้องไม่ทะลุโครงสร้าง; ห่างแล้ว arm กลับ  
- [ ] skill bar + jump/surf ยังปกติ  
- [ ] F1 / spells 1–5 ยังใช้ได้  
- [ ] CHANGELOG อัปเดตแล้ว  

---

## ข้อความสั้นสำหรับ AI ตัวถัดไป

```text
Repo: C:\Users\chinn\web-projects\snowflow_demo
Branch: feature/shrine-courtyard-pad-restore (tip 062db6f = main)
อ่าน HANDOFF.md + GUIDE.md + CHANGELOG.md [Unreleased] ก่อน
Courtyard: RADIUS 20 BLEND 10 — shrine.padWeight/heightAt + snowCourtyard.wgsl
Wire: main.js → CharacterController(shrine, shrine.obstacles), rig.groundAt = shrine.heightAt
GPU order: macro → courtyard flatten → fine → deform (all passes)
stampSnow หลัง terrain.warmUp; อย่า derive collision จาก mesh
Next: manual WebGPU QA edge blend → altar interaction / respawn
ทุก commit ต้องอัปเดต CHANGELOG.md; อย่า commit package-lock.json หรือ .zcode/
```
