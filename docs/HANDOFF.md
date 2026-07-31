# HANDOFF — snowflow_demo (Frame)

**วันที่อัปเดต:** 2026-08-01  
**Repo (local):** `C:\Users\WHITEPERx\Documents\GitHub\snowflow_demo`  
**Remote:** `https://github.com/FrameHandsomez/snowflow_demo`  
**Branch งานปัจจุบัน:** `feature/foundation&decisions`  
**Protocol:** `@snowflow/shared` **0.3.3**  
**Tip ก่อน monorepo (main pad):** `062db6f` courtyard pad restore  
**Base playability:** **v0.2.0** (`6b91898`)  
**Upstream tip ตอน clone:** `5450397 Init`

อ่านคู่กับ (source of truth แยกชั้น):

| เอกสาร | ใช้เมื่อ |
|---|---|
| `CHANGELOG.md` | สิ่งที่เปลี่ยน — **อัปเดตทุก commit / ปิดงาน** |
| `docs/HANDOFF.md` (ไฟล์นี้) | สถานะ session + กฎที่ต้องไม่ลืม + next |
| `docs/GUIDE.md` | อยากแก้ X → ไฟล์/ค่าไหน (jump, shrine, bindings, …) |
| `docs/ARCHITECTURE.md` | monorepo boundary / phase ownership |
| `docs/PHASE0-DECISIONS.md` | ทำไมเลือก monorepo / Colyseus / offline-first |
| `docs/FIX-RUNBOOK.md` | runtime พัง ไล่ health / protocol / path |
| `README.md` | overview tech demo ต้นฉบับ |

**หลัก:** HANDOFF = สถานะ + กับดัก + next · GUIDE = แผนที่แก้ · CHANGELOG = ประวัติ · อย่าแทนที่ทั้งก้อนด้วย session เดียวแล้วทิ้งของถาวร

---

## 1) Session ล่าสุด (2026-08-01) — remote snow-surf FX

### อาการที่ Frame เจอ

| ฝั่ง | เห็น |
|---|---|
| ตัวละคร **B** (local) | RMB ค้าง → snow-surf + ร่องหิมะ / wake / spray ปกติ |
| ตัวละคร **A** (observer) | เห็น B ท่าบอร์ด แต่ **ไม่มีหิมะ/ร่อง/plume บนพื้น** |

### Root cause

1. Local (`main.js`): `SnowContact` + `SurfWake` ผูก `CharacterController` ทุกเฟรม  
2. Remote (`RemoteCharacter`): มีแค่ mesh + pose จาก net — **ไม่มี contact/wake**  
3. `DeformNet` Phase 1 = **foot plant เท่านั้น** ไม่ relay ร่อง surf ต่อเนื่อง  
4. พยายาม inject snow เข้า `Character` core ผิดที่ → เกมโหลดไม่ขึ้น → ต้อง `git checkout HEAD -- packages/client/src/character/character.js`

### แก้ที่ลงแล้ว (working tree — ตรวจ `git status` ก่อน commit)

| ไฟล์ | สาระ |
|---|---|
| `packages/client/src/net/remoteCharacter.js` | `SnowContact` + `SurfWake` บน puppet; `spellTerrain.deform` + shared `spray`; figure→contact→wake; `sync` เก็บ local cam; dispose wake |
| `packages/client/src/character/character.js` | **ของเดิม** (ไม่ผูก snow) |
| `CHANGELOG.md` | Fixed remote snow-surf FX + pitfall |
| (ชุด pose 0.3.3 ค้างด้วย) | `figure.js`, `prediction.js`, `remotes.js`, `ZoneRoom.js`, `protocol.js`, `player.js`, `player.test.js` |

### สถาปัตยกรรม remote snow (Phase 1)

```text
Local hunter                         Remote peer (on observer client)
─────────────────                    ────────────────────────────────
CharacterController  ──pose──┐       MSG_STATE / move sample
Figure / Character           │              ▼
SnowContact ──brush──► deform ◄── SnowContact(puppet, deform, figure, spray)
SurfWake ──mesh+plume── spray ◄── SurfWake(puppet, spray, worldTerrain)
DeformNet.emit(foot) ──MSG──►│── applyLocal foot only (ไม่แทน surf groove)
```

**กฎ**

1. Pose จาก net · snow FX จำลองบน **observer** จาก pose (ไม่ต้อง wire ใหม่ถ้ามี `surf/carve/speed/facing/pos/…`)  
2. Deform field = `spellTerrain` / `terrain.deform` — **ไม่ใช้** `characterTerrain` (shrine height-only)  
3. แชร์ `SprayField` จาก `Multiplayer` → `RemotePlayers`  
4. **อย่า** new `SnowContact` ใน `Character` — ownership: `main` (local) / `RemoteCharacter` (remote)  
5. Authority snow ข้าม machine = Phase 2 ขยาย `DeformNet` (`kind: surf`)

### ลำดับเฟรม remote

```text
RemotePlayers.update(dt)
  → pose damp → rig.camera = peer eye
  → visual.update → contact.update → wake.update(observerCam)
Multiplayer.sync(localCamera)
  → RemoteCharacter.sync → visual uniforms + _observerCam
```

### QA 2-client

```bash
npm run dev:server
npm run dev:client   # หรือ --host ::
# สอง browser + ?mp=1
```

- [ ] B: RMB + เคลื่อนที่ → A เห็นร่อง + berm + wake/plume  
- [ ] A ออก AOI แล้วกลับ: despawn/dispose แล้ว spawn ใหม่ ไม่ leak mesh  
- [ ] offline local surf ยังปกติ  

### Pitfalls session นี้

| ผิด | ถูก |
|---|---|
| paste กลาง module top-level | แก้ใน method/constructor ที่มี context |
| ผูก snow เข้า `Character` | ผูกที่ `RemoteCharacter` + opts |
| ใช้ shrine เป็น deform | ใช้ `terrain.deform` |
| เคลม done ตอนไฟล์พัง | `git checkout` ไฟล์พังก่อนแก้ต่อ |

### Known limits (MP snow)

- Remote ยังไม่ cast shadow (รอ LOD)  
- Surf groove ยังไม่ event-sync ข้ามเครื่อง — จำลองจาก pose  
- Remote wake ยังไม่ `registerPrepass` ร่วม local  
- Working tree อาจยัง uncommitted — อย่า push โดยไม่ review

---

## 2) เป้าหมาย session ก่อนหน้า (timeline สั้น)

| ช่วง | ผล | รายละเอียดอยู่ที่ |
|---|---|---|
| courtyard pad | CPU/GPU flatten sync บน `main` (`062db6f`) | §3 ด้านล่าง + CHANGELOG |
| spawn ruin / collision / cam | PR #1 | §3 |
| playability v0.2.0 | rebind, crosshair, jump/flip/ollie, skill bar | CHANGELOG `[0.2.0]`, GUIDE |
| Phase 0 monorepo | client/server/shared, CI, Redis optional | ARCHITECTURE, PHASE0-DECISIONS |
| Phase 1 MP | move, AOI leave, spells visual, jump pose, remote pose 0.3.3 | CHANGELOG Unreleased |
| session นี้ | remote snow-surf บน observer | §1 |

---

## 3) สถานะถาวร — courtyard pad + shrine (อย่าลืม)

> คงไว้จาก HANDOFF 2026-07-31 — ยังเป็นกฎ gameplay/ground ที่ monorepo ใช้ต่อ (`packages/client/src/...`)

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

### ไฟล์สำคัญ (path ปัจจุบัน = ใต้ `packages/client/`)

| ไฟล์ | หน้าที่ |
|---|---|
| `src/world/shrine.js` | `COURTYARD_*`, `padWeight`, `heightAt`, `normalAt`, `padY`, stamp, obstacles |
| `src/shaders/lib/snowCourtyard.wgsl` | shared GPU weight / flatten height / grad |
| `src/shaders/snow.vertex.wgsl` | beauty: macro → courtyard → fine → deform |
| `src/shaders/snow.fragment.wgsl` | macro grad flatten ก่อน fine/deform (gate radius > 0) |
| `src/shaders/terrainDepth.vertex.wgsl` | shadow depth path ตรง beauty |
| `src/shaders/terrainPrepass.vertex.wgsl` | camera-depth prepass path ตรง beauty |
| `src/terrain/terrain.js` | `setCourtyardPad`, bind courtyard uniforms ครบ 3 materials |
| `src/main.js` | `setCourtyardPad`, `CharacterController(shrine,…)`, `rig.groundAt` |
| `src/character/controller.js` | static obstacles + wall slide |
| `src/core/camera.js` | spring-arm AABB obstruction |

### สถาปัตยกรรมที่ต้องรักษา

- **Render mesh ≠ gameplay collision**  
  - mesh = indexed static boxes (beauty / shadow / prepass)  
  - obstacles = immutable world AABB จาก module ที่ `blocksMovement`  
  - อย่า infer collision จาก triangles / Babylon picking  
- **Courtyard pad CPU/GPU sync**  
  - weight: smoothstep `1 - t²(3-2t)`, **RADIUS 20**, **BLEND 10**, center `SHRINE_SPAWN`  
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

### QA — courtyard pad (structural ผ่าน 2026-07-31)

| ตรวจ | ผล |
|---|---|
| `COURTYARD_RADIUS=20`, `BLEND=10` | ผ่าน |
| padWeight r=10 (1) / r=15 (0.5) / r=20 (0) | ผ่าน |
| GPU order macro→courtyard→fine→deform ครบ 3 vertex passes | ผ่าน |
| fragment gate `courtyardRadius > 0` | ผ่าน |
| `setCourtyardPad` + controller/figure/camera ใช้ shrine | ผ่าน |
| `stampSnow` หลัง `terrain.warmUp` | ผ่าน |
| `npm run build` | ผ่าน |

### Manual WebGPU (ยังให้ Frame ยืนยันได้ตลอด)

- [ ] เดิน core pad เท้าไม่จม dune  
- [ ] เดินขอบ blend (~10–20m) ไม่มี cliff / hitch  
- [ ] ชน gate / wall / pillar / altar base แล้ว slide  
- [ ] กล้องไม่ทะลุ; arm ใช้ ground จาก pad  
- [ ] jump / surf / skill bar ยังปกติ  

### Console QA pad

```js
const s = SNOWFLOW.shrine;
s.padWeight(8, -6)            // → 1
s.heightAt(8, -6) === s.padY  // → true
s.padWeight(8, 4)             // → 1  (r=10)
s.padWeight(8, 9)             // → 0.5 (r=15)
s.padWeight(8, 14)            // → 0   (r=20)
SNOWFLOW.character.obstacles === s.obstacles
SNOWFLOW.rig.groundAt(8, -6) === s.heightAt(8, -6)
```

---

## 4) รันโปรเจกต์ (monorepo)

```bash
cd "C:\Users\WHITEPERx\Documents\GitHub\snowflow_demo"
git checkout "feature/foundation&decisions"
npm install
npm run dev:server    # :2567
npm run dev:client    # Vite WebGPU
# dual-stack client (กัน localhost ≠ 127.0.0.1 คนละ process):
npm run dev -- --host ::
```

MP opt-in: `?mp=1` · `localStorage.snowflow.mp=1` · `SNOWFLOW.multiplayer.connect()`

### Verify เร็ว

```bash
node --check packages/client/src/net/remoteCharacter.js
node --check packages/client/src/character/character.js
npm test -w @snowflow/shared    # เป้า 14/14
npm run build -w @snowflow/client
```

---

## 5) แผนที่ไฟล์ — multiplayer + snow

| ไฟล์ | หน้าที่ |
|---|---|
| `packages/client/src/main.js` | local contact/wake + `Multiplayer({ terrain, characterTerrain: shrine, spray })` |
| `packages/client/src/character/snowContact.js` | foot / walk / **surf groove+berm** |
| `packages/client/src/vfx/surfWake.js` | wake mesh + plume |
| `packages/client/src/net/remoteCharacter.js` | remote puppet + contact/wake + spell proxy |
| `packages/client/src/net/remotes.js` | AOI spawn/despawn |
| `packages/client/src/net/multiplayer.js` | façade update/sync |
| `packages/client/src/net/deformNet.js` | foot deform wire (Phase 1) |
| `packages/client/src/net/prediction.js` | MoveSampler 20Hz |
| `packages/shared/src/schema/player.js` | pose contract 0.3.3 |
| `packages/server/src/rooms/ZoneRoom.js` | validate + AOI + relay |

รายละเอียด “อยากจูน jump/bindings/crosshair” → **`docs/GUIDE.md`** (อย่า copy ทั้ง GUIDE มาใส่ HANDOFF)

---

## 6) พฤติกรรมที่ควรได้ตอนนี้

| Input / เหตุ | ผล |
|---|---|
| เข้าเกมใหม่ | ยืน courtyard แบนที่ `SHRINE_SPAWN` |
| เดินขอบ blend | พื้นเอียงเข้า dunes แบบ smooth |
| ชนเสา/ผนัง/แท่น | slide ตามแกนว่าง |
| Space / Space ตอนลอย | jump / double+flip |
| RMB / RMB+Space | surf / ollie |
| 1–5 | spells (2 = hold) |
| `?mp=1` 2 clients | peer mesh + pose |
| peer RMB surf | observer เห็น **ร่อง + wake** บน local terrain |
| peer ออก AOI | `MSG_INTEREST_LEFT` → despawn |

**กฎ jump**

- ต้อง **ปล่อย** Space ก่อนรอบใหม่ (`_jumpArmed`)  
- Double **ไม่** รอ `air > 0.2`  
- Flip ใช้ `flipAngle` ตรงๆ ไม่ผ่าน pitch damp  

---

## 7) localStorage / runtime debug

| Key | ของใคร |
|---|---|
| `snowflow.bindings.v2` | keybinds |
| `snowflow.bindings.v1` | legacy migrate |
| `snowflow.crosshair.v2` | crosshair |
| `snowflow.mp` | multiplayer auto-connect |
| `snowflow.mp.debug` | AOI logs |

```js
SNOWFLOW.shrine / .character / .rig / .figure / .crosshair / .skillBar / .input / .S
SNOWFLOW.multiplayer / .multiplayer.remotes
SNOWFLOW.wake   // local wake
```

---

## 8) งานที่ค้าง / แนวทางต่อได้ (รวมของเก่า + ใหม่)

### ปิดแล้ว (2026-08-01)
1. ~~2-client remote surf / spell / AOI QA~~ — Frame ยืนยันผ่าน  
2. ~~Commit + push~~ — `4ea6b64` บน `feature/foundation&decisions`  
3. ~~อัปเดต `docs/game_roadmap.md` Phase 1~~ ให้ตรงสถานะ  

### ถัดไป (ลำดับแนะนำ)
1. **Phase 2 Combat** — HP/ATK contract, hit feel + server validate, dummy monster, death/respawn  
2. (Optional Phase 1 polish) remote wake `registerPrepass` · remote LOD/shadow · `DeformNet kind:surf`  
3. **Altar interaction zone** (checkpoint / unlock) — แยก volume จาก collision  
4. **Respawn** ผูก `SHRINE_SPAWN` หรือ checkpoint (player death อยู่ Phase 2/MVP)  
5. **Shrine presentation** — VFX / spell-light / frost mask  
6. **Feel** — จูน ollie / flip / coyote  
7. **Optional hero asset** `.glb` (license, shadow, prepass, collision แยก)  

---

## 9) ความเสี่ยงตอนทำต่อ (ของเก่ายังใช้ได้)

| ความเสี่ยง | ทำไม |
|---|---|
| ผูก collision กับ mesh | visual tweak เปลี่ยน gameplay |
| เรียก `stampSnow` ก่อน `terrain.warmUp` | brush หาย |
| เพิ่ม module blocking แต่ลืม `blocksMovement` | เดินทะลุ |
| flatten หลัง fine/deform บน GPU | เท้าจม/ลอยที่ขอบ blend |
| ground sampler กลับไป raw `terrain` | dune โผล่ใต้ตัวในลาน |
| แก้ `figure.js` root pitch | กระทบ walk + surf + flip พร้อมกัน |
| ลำดับ `pollInput` / `endFrame` ใน main | `jumpPressed` ต้องถึง `character.update` |
| Vite IPv4/IPv6 แยก process | ใช้ `--host ::` |
| inject FX เข้า `Character` core เพื่อ remote | boot พัง / ownership ปน — ใช้ `RemoteCharacter` |
| เขียนทับ HANDOFF ทั้งก้อนด้วย session เดียว | ลืมกฎ pad/shrine — **merge อย่า replace** |
| in-app browser WebGPU | อาจค้าง `creating device` — ใช้ browser หลัก |
| stage `package-lock.json` / `.zcode/` | อย่า commit กับงาน feature |

---

## 10) Git / ปิดงาน

```text
Branch: feature/foundation&decisions
อย่า stage: package-lock.json, .zcode/
กฎ: ทุก commit / ปิดงาน → อัปเดต CHANGELOG.md + ย่อ HANDOFF section ล่าสุด
อย่าลบ §3–§9 ของ shrine/pad เว้นแต่ย้ายไป GUIDE แล้วชี้ลิงก์ชัด
```

### Verify ก่อน merge งานถัดไป

- [ ] shared tests 14/14  
- [ ] client build  
- [ ] offline pad + jump/surf  
- [ ] 2-client remote surf snow  
- [ ] AOI leave/re-enter  
- [ ] CHANGELOG + HANDOFF อัปเดต  

---

## 11) ข้อความสั้นสำหรับ AI ตัวถัดไป

```text
Repo: C:\Users\WHITEPERx\Documents\GitHub\snowflow_demo
Branch: feature/foundation&decisions · protocol 0.3.3
อ่าน docs/HANDOFF.md ทั้งไฟล์ + CHANGELOG [Unreleased] + docs/GUIDE.md ก่อนแตะโค้ด

Courtyard (ยังบังคับ): RADIUS 20 BLEND 10 — shrine.padWeight/heightAt + snowCourtyard.wgsl
GPU order: macro → courtyard flatten → fine → deform (all passes)
Ground/collision: CharacterController(shrine, shrine.obstacles); rig.groundAt = shrine.heightAt
stampSnow หลัง terrain.warmUp; อย่า derive collision จาก mesh

MP remote snow (session 2026-08-01): RemoteCharacter owns SnowContact+SurfWake from puppet pose
ใช้ spellTerrain.deform + shared spray — อย่า inject snow เข้า Character core
DeformNet ยัง foot-only; continuous surf authority = Phase 2

Phase 1 vertical slice ปิด 2026-08-01 (QA + push 4ea6b64). Next = Phase 2 combat core.
ทุก commit อัปเดต CHANGELOG; merge HANDOFF อย่า replace ทั้งก้อน; อย่า commit package-lock/.zcode
```
