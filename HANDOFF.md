# HANDOFF — snowflow_demo (Frame)

**วันที่:** 2026-07-30  
**Repo (local):** `C:\Users\chinn\web-projects\snowflow_demo`  
**Remote:** `https://github.com/FrameHandsomez/snowflow_demo`  
**Branch งาน shrine:** `feature/spawn-ruin`  
**Tip (code):** `feature/spawn-ruin` — camera obstruction + collision + modular shrine + docs  
**Base / release ก่อนหน้า:** **v0.2.0** — Frame playability pass (`6b91898`)  
**Upstream tip ตอน clone:** `5450397 Init`

อ่านคู่กับ:
- `CHANGELOG.md` — รายการสิ่งที่เปลี่ยน
- `GUIDE.md` — อยากแก้ X ไปไฟล์ไหน / ค่าไหน
- `README.md` — ภาพรวม tech demo ต้นฉบับ

---

## เป้าหมาย session ล่าสุด (spawn ruin)

1. สร้าง ruin / shrine ถาวรรอบจุดเริ่มเกม  
2. วางบน terrain height จริง + กดหิมะรอบฐาน  
3. spawn ตัวละคร **ใน** courtyard  
4. gameplay collision แยกจาก render mesh  
5. camera spring-arm ไม่ทะลุ geometry shrine  
6. แยก commit ตาม task + เตรียม docs / PR สำหรับทีม

งาน playability ก่อนหน้า (v0.2.0) ยังอยู่: rebind, crosshair, jump/flip/ollie, skill bar

---

## รันโปรเจกต์

```bash
cd "C:\Users\chinn\web-projects\snowflow_demo"
git checkout feature/spawn-ruin
npm install          # ถ้ายังไม่มี node_modules
npm run dev -- --host ::  # instance เดียวสำหรับ localhost + 127.0.0.1
```

ต้องการ: Chrome/Edge WebGPU (หรือ browser ที่รองรับ)

---

## สถานะโค้ด — feature/spawn-ruin

### Commits ที่เกี่ยวกับ shrine (ใหม่ → เก่า)

```text
docs:  record spawn ruin gameplay pass          (docs commit รอบนี้)
63b8c1d feat(camera): block shrine camera clipping
73d59dd feat(gameplay): add shrine collision volumes
7e233f3 feat(world): build modular shrine layout
7e800bf feat(world): expand shrine spawn courtyard
9faa7f1 Merge origin/main into feature/spawn-ruin
5cf740b feat(world): spawn permanent ruin shrine
```

(`783d5c7` skill bar มาจาก main ผ่าน merge — ไม่ใช่งาน shrine โดยตรง)

### ไฟล์ใหม่ (shrine)

| ไฟล์ | หน้าที่ |
|---|---|
| `src/world/shrine.js` | `SpawnShrine`, `SHRINE_SPAWN`, mesh + `obstacles` AABB |
| `src/shaders/shrine.vertex.wgsl` | beauty vertex |
| `src/shaders/shrine.fragment.wgsl` | stone/frost + shadows + spell lights |
| `src/shaders/shrineDepth.vertex.wgsl` | cascade shadow caster |
| `src/shaders/shrinePrepass.vertex.wgsl` | camera-depth prepass |

### ไฟล์แก้หลัก (shrine)

| ไฟล์ | ทำไมสำคัญ |
|---|---|
| `src/main.js` | construct, wire obstacles, stamp snow, warm-up, update, `SNOWFLOW.shrine` |
| `src/character/controller.js` | optional obstacles + X/Z wall slide |
| `src/core/camera.js` | socket arm + AABB obstruction |
| `src/shaders/registry.js` | register shrine programs |

### ไฟล์ใหม่ / แก้จาก v0.2.0 + skill bar (ยังใช้ได้)

| ไฟล์ | หน้าที่ |
|---|---|
| `src/core/bindings.js` | defaults, 2-slot binds, localStorage v2 |
| `src/ui/crosshair.js` | draw + parse + profile + color |
| `src/ui/skillBar.js` | spell HUD 5 ช่อง |
| `src/character/controller.js` | jump / double / flip / ollie **และ** shrine collision |
| `CHANGELOG.md` / `HANDOFF.md` / `GUIDE.md` | เอกสาร Frame |

### สถาปัตยกรรมที่ต้องรักษา

- **Render mesh ≠ gameplay collision**  
  - mesh = indexed static boxes ชุดเดียว (beauty / shadow / prepass)  
  - obstacles = immutable world AABB จาก module ที่ `blocksMovement`  
  - อย่า infer collision จาก triangles / Babylon picking
- **`stampSnow()` หลัง `await terrain.warmUp()`** — warm-up ล้าง brush queue
- **Camera obstruction ใช้ AABB เดียวกับ player** ผ่าน `rig.obstacles = shrine.obstacles`
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
| เข้าเกมใหม่ | ยืนใน courtyard ของ ruin ที่ `SHRINE_SPAWN` |
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
SNOWFLOW.shrine      // SpawnShrine → .mesh, .obstacles, .stampSnow()
SNOWFLOW.character   // CharacterController → .obstacles, jump/surf state
SNOWFLOW.rig         // CameraRig → .obstacles, .obstacleDistance, .groundAt
SNOWFLOW.figure      // Character (mesh wrapper) → .figure = Figure skeleton
SNOWFLOW.crosshair   // Crosshair API
SNOWFLOW.skillBar    // SkillBar API / DOM state
SNOWFLOW.input       // raw input struct
SNOWFLOW.S           // settings
```

ตัวอย่าง:

```js
SNOWFLOW.shrine.obstacles.length
SNOWFLOW.character.obstacles === SNOWFLOW.shrine.obstacles
SNOWFLOW.rig.obstacleDistance
SNOWFLOW.character.position  // ควรใกล้ {x:8, z:-6} ตอน spawn
```

---

## งานที่ค้าง / แนวทาง Frame ต่อได้

จัดลำดับหลัง merge `feature/spawn-ruin` (ไม่บังคับ):

1. **Shrine gameplay**
   - altar interaction zone (checkpoint / unlock / ritual) — แยก volume จาก collision
   - respawn ผูก `SHRINE_SPAWN` หรือ checkpoint ถัดไป
2. **Shrine presentation**
   - VFX / spell-light รอบ altar
   - material: triplanar stone, frost mask, weathered variation
3. **Optional hero asset**
   - imported `.glb` ทีหลัง — ต้อง review license, textures, shadow, depth prepass, collision แยก
4. **Feel (จาก v0.2.0)**
   - จูน ollie / flip / coyote
5. **Engineering**
   - visual QA บน Chrome/Edge WebGPU จริง (walk/surf/jump + หมุนกล้องรอบ gate/wall/pillar/altar)
   - อย่า commit `package-lock.json` / `.zcode/` ถ้าไม่เกี่ยวกับงาน

---

## ความเสี่ยงตอนทำต่อ

| ความเสี่ยง | ทำไม |
|---|---|
| ผูก collision กับ mesh | visual tweak จะเปลี่ยน gameplay โดยไม่ตั้งใจ |
| เรียก `stampSnow` ก่อน `terrain.warmUp` | brush หาย |
| เพิ่ม module blocking แต่ลืม `blocksMovement` | เดินทะลุ |
| แก้ `figure.js` root pitch | กระทบ walk + surf + flip พร้อมกัน |
| `pollInput` / `endFrame` ลำดับใน `main.js` | `jumpPressed` ต้องมีชีวิตถึง `character.update` |
| Vite IPv4/IPv6 แยก process | kill process เดิม แล้วรัน `npm run dev -- --host ::` |
| in-app browser WebGPU | อาจค้างที่ `creating device` — ใช้ browser หลักทดสอบ |

---

## Git / PR กับทีม

```text
Branch:  feature/spawn-ruin
Base:    main
อย่า stage: package-lock.json, .zcode/
หลัง merge: checkout main → pull → ลบ feature branch local/remote
```

### Verify ก่อน merge

- [ ] `npm run build` ผ่าน
- [ ] เข้าเกม spawn ใน courtyard เห็น ruin
- [ ] เดิน/surf ชน gate / wall / pillar / altar base แล้ว slide
- [ ] กล้องไม่ทะลุโครงสร้าง; ห่างแล้ว arm กลับ
- [ ] steps / rubble ต่ำยังเดินผ่านได้
- [ ] skill bar + jump/surf ยังปกติ
- [ ] F1 / spells 1–5 ยังใช้ได้

---

## ข้อความสั้นสำหรับ AI ตัวถัดไป

```text
Repo: C:\Users\chinn\web-projects\snowflow_demo
Branch: feature/spawn-ruin (shrine + collision + camera done)
อ่าน HANDOFF.md + GUIDE.md + CHANGELOG.md [Unreleased] ก่อน
Shrine: src/world/shrine.js — mesh + obstacles AABB แยกกัน
Wire: main.js → CharacterController(terrain, shrine.obstacles), rig.obstacles
Camera: core/camera.js nearestAabbEntry on socket→eye arm
อย่า derive collision จาก mesh; stampSnow หลัง terrain.warmUp
Next optional: altar interaction / shrine VFX / material polish
อย่า commit package-lock.json หรือ .zcode/
```
