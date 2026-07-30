# HANDOFF — snowflow_demo (Frame)

**วันที่:** 2026-07-30  
**Repo:** `C:\Users\WHITEPERx\Documents\GitHub\snowflow_demo`  
**Remote:** `https://github.com/FrameHandsomez/snowflow_demo`  
**Branch:** `main`  
**Release tag (docs):** **v0.2.0** — Frame playability pass  
**Upstream tip ตอน clone:** `5450397 Init`

อ่านคู่กับ:
- `CHANGELOG.md` — รายการสิ่งที่เปลี่ยน
- `GUIDE.md` — อยากแก้ X ไปไฟล์ไหน / ค่าไหน
- `README.md` — ภาพรวม tech demo ต้นฉบับ

---

## เป้าหมาย session นี้

1. ติดตั้ง repo + dev server  
2. ตั้งปุ่มเองได้ (rebind 2 ช่อง)  
3. Crosshair แบบ Valorant + import code + เลือกสี  
4. กระโดด / double+flip / surf ollie + เก็บโมเมนตัมพอประมาณ  
5. Skill bar สำหรับ spells 1–5 + HUD toggle และ spacing ที่ไม่บัง gameplay hint

Frame ต้องการ **ทำต่อแนวตัวเอง** — เอกสารชุดนี้คือแผนที่ของ delta ทั้งหมด

---

## รันโปรเจกต์

```bash
cd "C:\Users\WHITEPERx\Documents\GitHub\snowflow_demo"
npm install          # ถ้ายังไม่มี node_modules
npm run dev -- --host ::  # instance เดียวสำหรับ localhost + 127.0.0.1
```

ต้องการ: Chrome/Edge WebGPU (หรือ browser ที่รองรับ)

---

## สถานะโค้ดตอน ship v0.2.0

### ไฟล์ใหม่
| ไฟล์ | หน้าที่ |
|---|---|
| `src/core/bindings.js` | defaults, 2-slot binds, localStorage v2 |
| `src/ui/crosshair.js` | draw + parse + profile + color |
| `src/ui/skillBar.js` | spell HUD 5 ช่อง, key labels, active progress, hint spacing |
| `CHANGELOG.md` / `HANDOFF.md` / `GUIDE.md` | เอกสาร Frame |

### ไฟล์แก้หลัก
| ไฟล์ | ทำไมสำคัญ |
|---|---|
| `src/core/input.js` | poll bindings, jump edge, surf/sprint |
| `src/core/settings.js` | `showCrosshair`, `crosshairCode`, `showSkillBar`, HUD schema |
| `src/ui/overlay.js` | Controls rebind UI + HUD crosshair / skill bar toggles |
| `src/main.js` | mount Crosshair + SkillBar, exposes both on `SNOWFLOW` |
| `src/spells/spellSystem.js` | `hudSlots()` snapshot ของ state spell ต่อ frame |
| `src/character/controller.js` | jump / double / flip / ollie physics |
| `src/character/figure.js` | air / flip / ollie pose |
| `src/character/snowContact.js` | land + takeoff spray |
| `README.md`, `index.html` | controls / hint |

### ยังไม่แตะ (upstream เดิม)
terrain, shaders, spells, post, sky, wake mesh หลัก, cloth solver โครงสร้างเดิม

---

## พฤติกรรมที่ควรได้ตอนนี้

| Input | ผล |
|---|---|
| Click canvas | pointer lock |
| WASD / arrows | เดิน (rebind ได้) |
| Shift | sprint |
| **Space** | jump ชั้น 1 |
| **Space อีกทีตอนลอย** (ปล่อยแล้วกดใหม่) | double + front flip |
| **RMB hold** | snow-surf |
| **RMB + Space** (บนบอร์ด) | surf ollie |
| 1–5 | spells (2 = hold) |
| Skill bar | แสดง cooldown / hold / key bindings ของ spells 1–5; ปิดได้ที่ F1 → HUD |
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
SNOWFLOW.character   // CharacterController
SNOWFLOW.figure      // Character (mesh wrapper) → .figure = Figure skeleton
SNOWFLOW.crosshair   // Crosshair API
SNOWFLOW.skillBar    // SkillBar API / DOM state
SNOWFLOW.input       // raw input struct
SNOWFLOW.S           // settings
```

ตัวอย่าง:

```js
SNOWFLOW.character.jumpsUsed
SNOWFLOW.character.flipping
SNOWFLOW.character.flipAngle
SNOWFLOW.crosshair.getProfile()
SNOWFLOW.crosshair.applyCode("0;P;c;1;…")
```

---

## งานที่ค้าง / แนวทาง Frame ต่อได้

จัดลำดับตามที่คุยใน session (ไม่บังคับ):

1. **Feel**
   - จูน ollie distance / flip timing เพิ่ม
   - coyote/buffer ให้ “tight” แบบเกม action
2. **Presentation**
   - flip ให้อ่านชัดจากกล้อง third-person (อาจเพิ่ม camera kick)
   - ollie trail / board-only VFX แยกจาก walk kick
3. **Crosshair**
   - parser field Valorant ให้ครบขึ้น
   - preset ปุ่มเดียวจาก vcrdb top list
4. **Engineering**
   - `git commit` งาน Frame เป็นก้อนชัด (bindings / hud / jump)
   - แยก constants jump ไปไฟล์ `src/character/jumpTune.js` ถ้าจูนบ่อย
5. **Design Frame**
   - ระบบ skill/combat ต่อจาก spells 1–5
   - progression / UI นอก overlay ดีบั๊ก

---

## ความเสี่ยงตอนทำต่อ

| ความเสี่ยง | ทำไม |
|---|---|
| แก้ `figure.js` root pitch | กระทบ walk + surf + flip พร้อมกัน |
| ใส่ jump ตอน `surf > 0.5` ผิดเงื่อนไข | เคยบล็อก jump ทั้งก้อน |
| `pollInput` / `endFrame` ลำดับใน `main.js` | `jumpPressed` ต้องมีชีวิตถึง `character.update` |
| เซฟ localStorage เก่า | Space อาจยังผูก surf ถ้าไม่ migrate/reset |
| Vite IPv4/IPv6 แยก process | `localhost` อาจวิ่ง `[::1]` แต่ `127.0.0.1` วิ่ง IPv4 และได้โค้ดคนละชุด — kill process เดิม แล้วรัน instance เดียวด้วย `npm run dev -- --host ::` |

---

## Verify ก่อนปิดมือ / ก่อน commit

- [ ] `npm run dev` ขึ้น `http://localhost:5173/`
- [ ] F1 → Controls เห็น **2 ช่อง** ต่อแถว + Jump
- [ ] F1 → HUD crosshair เปิดได้ + import code + เปลี่ยนสี
- [ ] Skill bar แสดง 5 ช่อง, key label ตรง bindings, และ gameplay hint ไม่ทับ bar
- [ ] Space ×1 = กระโดดครั้งเดียว (ไม่ bunny-hop เอง)
- [ ] Space ×2 ในอากาศ = ดีด + ม้วน
- [ ] RMB surf + Space = ollie พุ่งตามบอร์ด (ไม่ไกลหลุดแมพ)
- [ ] 1–5 spells ยังใช้ได้

---

## ข้อความสั้นสำหรับ AI ตัวถัดไป

```text
Repo: C:\Users\WHITEPERx\Documents\GitHub\snowflow_demo
อ่าน HANDOFF.md + GUIDE.md + CHANGELOG.md ก่อน
งาน Frame เพิ่ม: bindings 2-slot, crosshair Valorant import,
jump + double flip + surf ollie
ไฟล์หลัก: src/core/bindings.js, input.js, src/ui/crosshair.js, overlay.js,
src/character/controller.js, figure.js, snowContact.js
ยังไม่ commit — working tree dirty จาก Init
อย่าเดา control: Space=jump, RMB=surf, double ต้องปล่อยแล้วกดใหม่
```
