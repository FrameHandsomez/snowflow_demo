# Roadmap: Open-World Monster Hunting RPG (SNOWFLOW-based)
**แนวเกม:** Open World + Farming + Monster Hunting + Dungeon + Loot + PvP (แรงบันดาลใจ Shangri-La Frontier)
**ทีม:** 2-5 คน | **Base tech:** SNOWFLOW (Babylon.js + WebGPU) + Colyseus + PostgreSQL/Redis

---

## Phase 0 — Foundation & Decisions
**ระยะเวลา:** 2-3 สัปดาห์
**เป้าหมาย:** ตกลง stack ให้นิ่ง และแตก SNOWFLOW ให้พร้อมต่อยอด

### Task list
- [x] ยืนยัน tech stack: Colyseus (server), PostgreSQL + Redis (data — เลื่อนติดตั้งถึง Phase 3), Babylon.js/WebGPU (client)
- [~] แตกโค้ด SNOWFLOW เป็นโมดูล reusable: โฟลเดอร์ `terrain/`, `character/`, `render/` มีแล้วใน `packages/client/src` — public API / ตัด demo coupling ยังทำต่อได้
- [~] ตัดสินใจ scope ตัด: **เก็บ 5 spells + surf ไว้ก่อน** (บันทึกใน `docs/PHASE0-DECISIONS.md`) — เปิดทบทวนเมื่อเริ่ม combat
- [x] ตั้ง repo structure: `packages/client`, `packages/server`, `packages/shared` (npm workspaces)
- [x] ตั้ง CI พื้นฐาน (build check + shared unit test) — ESLint เต็มรูปแบบเลื่อนได้
- [ ] แบ่งงานทีม: client, server, content/design (รอคนร่วม)

**Done เมื่อ:** รัน client+server local เชื่อมกันได้ ตัวละครเดินในโซนของ SNOWFLOW ผ่าน network (ยังไม่มี combat)  
**สถานะ 2026-07-31:** client offline build ผ่าน · server `/health` ผ่าน · **ยังไม่** sync ตัวละครผ่าน network (เป็น Phase 1)

---

## Phase 1 — Multiplayer Movement
**ระยะเวลา:** 2-4 สัปดาห์
**เป้าหมาย:** ผู้เล่นหลายคนเห็นกัน เดิน sync กันในโซนเดียว

### Task list
- [ ] สร้าง Colyseus room สำหรับ 1 zone
- [ ] State schema: position, rotation, animation state ของผู้เล่น
- [ ] Client-side prediction + server reconciliation
- [ ] Character LOD: ลด cost cloth/IK ของตัวละครที่อยู่ไกลกล้อง
- [ ] Deformation event system: ส่ง event รอยเท้าแทน sync ทั้ง buffer
- [ ] Client คำนวณผล deform เอง (deterministic) จาก event ที่รับ
- [ ] **Interest Management (AOI)**: แบ่งโซนเป็น grid cell, sync state ให้ผู้เล่นเห็นเฉพาะคนที่อยู่ cell ใกล้ตัว — วางไว้ตั้งแต่ตอนนี้แม้คนเทสจะแค่ 2-3 คน เพราะ refactor ทีหลังยากกว่าออกแบบแต่แรกมาก (ป้องกันปัญหา O(n²) broadcast ตอนคนเยอะ)

**Done เมื่อ:** เปิด 2 browser tab เห็นตัวละครอีกฝั่งเดินตรงกัน หิมะยุบตามรอยเท้าทั้งสองฝั่งตรงกัน และ state ที่ sync มีแค่ entity ที่อยู่ใน AOI ของผู้เล่น (ตรวจสอบผ่าน log/network inspector ว่าไม่ส่งข้อมูลทุก entity ในโซนให้ทุกคน)

---

## Phase 2 — Combat Core + มอนสเตอร์ตัวแรก
**ระยะเวลา:** 3-5 สัปดาห์
**เป้าหมาย:** ตีมอนสเตอร์ง่ายๆ ได้ มี HP มี damage มี die

### Task list
- [ ] Hit detection ฝั่ง client (feel ทันที)
- [ ] Server validate damage (optimistic + authoritative)
- [ ] Basic stat system: HP, ATK, DEF บนตัวละคร/มอนสเตอร์
- [ ] มอนสเตอร์ตัวแรก แบบนิ่งๆ ตีโต้กลับ (ไม่ต้องมี AI ซับซ้อน)
- [ ] Death → respawn timer ของมอนสเตอร์

**Done เมื่อ:** เข้าเกม ตีมอนสเตอร์ตายได้ เห็น HP bar ลด มอนสเตอร์ respawn ใหม่

---

## Phase 3 — Loot & Inventory
**ระยะเวลา:** 2-3 สัปดาห์
**เป้าหมาย:** เก็บของได้ ใส่ของได้ เห็นผลจริงบนตัวละคร

### Task list
- [ ] Data model: Item, ItemTemplate, DropTable ต่อมอนสเตอร์
- [ ] Inventory UI (grid, stack, equip slot)
- [ ] Equip แล้วมีผลจริงกับ stat
- [ ] ปรับ visual ตัวละครตาม equip (ต่อยอดระบบ procedural cloth เดิม)
- [ ] Auth/Account system เบื้องต้น
- [ ] Persistence: เซฟ character/inventory ลง DB จริง

**Done เมื่อ:** ปิดเกมเปิดใหม่ ของที่เก็บยังอยู่ครบ

---

## Phase 3.5 — Active Skill System (เรียนจากสมุด)
**ระยะเวลา:** 2-3 สัปดาห์
**เป้าหมาย:** เรียนสกิลจากสมุด (item) และอัพเลเวล 1-10

### Task list
- [ ] Data model: SkillTemplate (levelData 1-10), SkillBook (item), CharacterSkill
- [ ] สมุด "ปลดล็อก" สกิล (level 0 → 1)
- [ ] ระบบสะสม skill-exp จากการใช้งานสกิลจริง (อัพเลเวลผ่านการเล่น ไม่ใช่แค่ใช้สมุดข้ามเลเวล)
- [ ] สมุดหายาก/จากบอส = ใช้เร่งเลเวลสกิลได้
- [ ] Server validate damage/cooldown ตาม skill level ทุกครั้ง (กันโกง)
- [ ] Skill UI: แสดงเลเวลปัจจุบัน, exp bar, ปุ่มใช้สกิล

**Done เมื่อ:** เก็บสมุดจากมอนสเตอร์ → เรียนสกิลใหม่ → ใช้สกิลจนอัพเลเวลได้ → ดาเมจเปลี่ยนตามเลเวล

---

## 🎮 Milestone พิเศษ — MVP Playtest กับเพื่อน (แทรกก่อนไป Phase 4)
**ระยะเวลา:** 2-3 สัปดาห์ | **เป้าหมาย:** เพื่อน 2-3 คนเล่นด้วยกันได้จริงจากคนละบ้าน เพื่อทดสอบว่า core loop สนุกไหม ก่อนลงทุนทำ Boss/Dungeon/PvP เต็มระบบ

> จุดนี้คือ "จุดตัดสินใจ" สำคัญของโปรเจกต์ — ถ้าเล่นแล้วไม่สนุก ควรกลับมาแก้ core loop (Phase 1-3.5) ก่อน อย่าฝืนไปต่อ Phase 4 เพราะ Boss/Dungeon จะยิ่งขยายปัญหาเดิมให้ใหญ่ขึ้น

### Task list — Infra ที่ยังไม่เคยอยู่ใน Phase ไหนเลย
- [ ] **Session/Lobby**: room code ง่ายๆ (สร้างห้อง → โค้ด 6 หลัก → เพื่อนใส่โค้ดเข้าร่วม)
- [ ] **Deploy จริง**: ยก Colyseus server ขึ้น cloud (Railway/Fly.io/DigitalOcean) + wss:// SSL — อย่ารอทำตอนท้าย
- [ ] **Reconnect handling**: หลุดคอนเนกชันแล้วกลับเข้าห้องเดิมได้ ไม่ต้องเริ่มใหม่
- [ ] **Player death & respawn**: ตายแล้วเกิดอะไร (จุด respawn, penalty หรือไม่, เสียของไหม)
- [ ] **มอนสเตอร์ 3-4 ชนิด**: ความแรง/พฤติกรรมต่างกัน + spawn table กระจายในโซน (ไม่ใช่จุดตายตัวจุดเดียว)
- [ ] **SFX พื้นฐาน**: เสียงตีโดน, เสียงมอนสเตอร์, music เบาๆ — ฟีดแบ็กจำเป็นต่อ core loop (Action→Feedback→Reward)
- [ ] **Party HUD**: เห็น HP/สถานะเพื่อนร่วมทีมแบบเรียลไทม์
- [ ] **Proximity text chat หรือ emote**: ประสานงานในเกมได้โดยไม่ต้องพึ่ง Discord ตลอด

### สิ่งที่ยังไม่ต้องทำในด่านนี้ (เก็บไว้ Phase 4 เป็นต้นไปตามแผนเดิม)
Boss arena lock, Dungeon instance, Passive tree เต็มระบบ, PvP, Crafting/Farming ซับซ้อน — ยังอยู่ในแผนเต็มเหมือนเดิม แค่ยังไม่ทำตอนนี้

**Done เมื่อ:** เพื่อน 2-3 คนต่างบ้านกัน เข้าห้องเดียวกันด้วย room code, ไล่ล่ามอนสเตอร์หลายชนิด, เก็บของ, เรียน/อัพเลเวลสกิลจากสมุด, ตายแล้ว respawn ได้ — เล่นต่อเนื่องได้ไม่มี session ล่ม

---

## Phase 4 — Boss Arena System (แก่นของฟีล SLF)
**ระยะเวลา:** 4-6 สัปดาห์
**เป้าหมาย:** บอสตัวแรกที่มี pattern/phase จริง + arena lock

### Task list
- [ ] Boss pattern framework แบบ data-driven (phase ตาม HP threshold)
- [ ] Telegraph attack (สัญญาณเตือนก่อนโจมตี) + weakpoint system
- [ ] Arena lock mechanic: ล็อกพื้นที่ให้ปาร์ตี้แรกที่เข้า, คนอื่นเข้าไม่ได้ระหว่างสู้
- [ ] Party system เบื้องต้น (invite, share loot/exp)
- [ ] บอสตัวแรก: สร้างจาก procedural character system เดิม (skeleton + scale + fur/cloth)
- [ ] Playtest รอบใหญ่ — โฟกัสที่ "อ่านลายบอส" ไม่ใช่ stat check

**Done เมื่อ:** ปาร์ตี้ 2-3 คนเข้าไปสู้บอส 2 phase ได้ครบ รู้สึกว่าต้องเลี่ยงท่า ไม่ใช่ยืนตีเฉยๆ

---

## Phase 4.5 — Passive Skill Tree (mini version)
**ระยะเวลา:** 2-3 สัปดาห์
**เป้าหมาย:** ระบบ build-crafting แบบกราฟ ขนาดเล็กกว่า PoE มาก

### Task list
- [ ] Data model: PassiveNode (id, position, connections, effect, cost)
- [ ] Logic: ปลดล็อก node ได้ต่อเมื่อ node ข้างเคียงที่เชื่อมกันปลดล็อกแล้ว
- [ ] สร้าง mini-tree 30-50 node ต่อ 1 archetype (เริ่มจาก 1 archetype ก่อน)
- [ ] จัดวาง node เป็นวงแหวนรอบจุดเริ่ม (เส้นตรง → แตกกิ่ง → Notable ปลายกิ่ง)
- [ ] Client render เป็น 2D SVG/Canvas overlay
- [ ] Respec (รีเซ็ตแต้ม) แบบมีต้นทุน
- [ ] เชื่อม synergy กับ Active skill (บาง node ลด cooldown/เพิ่มดาเมจสายเฉพาะ)

**Done เมื่อ:** ผู้เล่นได้ skill point จาก level up → ปลดล็อก node ตามเส้นทางที่เชื่อมกันได้ → เห็นผล stat เปลี่ยนจริง

---

## Phase 5 — Farming/Gathering + Crafting
**ระยะเวลา:** 2-3 สัปดาห์
**เป้าหมาย:** วงจร resource → craft → gear ที่ดีขึ้น

### Task list
- [ ] Resource node บนแผนที่ (respawn timer, gathering skill check)
- [ ] Crafting recipe system เชื่อมกับ item system เดิม
- [ ] กระจาย resource node ตามโซน เพื่อดึงผู้เล่น explore

**Done เมื่อ:** เก็บวัตถุดิบ → crafting ของใหม่ที่ stat ดีกว่าของเดิมได้

---

## Phase 6 — Dungeon Instance
**ระยะเวลา:** 3-4 สัปดาห์
**เป้าหมาย:** เนื้อหาแยก instance จาก open world

### Task list
- [ ] Colyseus room แยกต่อกลุ่มที่กด "เข้าดันเจี้ยน"
- [ ] Seed procedural terrain ต่อ instance (ใช้ heightfield generator เดิม เปลี่ยน seed)
- [ ] Matchmaking/party finder เบื้องต้น
- [ ] บอสท้ายดันเจี้ยน ใช้ framework จาก Phase 4
- [ ] Instance expiry/cleanup (กันกิน resource server ค้าง)

**Done เมื่อ:** กลุ่มผู้เล่นเข้าดันเจี้ยนแยกจากโลกหลัก ลุยจนถึงบอสท้ายได้

---

## Phase 7 — PvP
**ระยะเวลา:** 3-5 สัปดาห์
**เป้าหมาย:** ต่อสู้ผู้เล่น-ผู้เล่น ปลอดภัยจากการโกง

### Task list
- [ ] Arena mode แบบ instance ก่อน (ง่ายกว่า open-world flagging)
- [ ] Server-authoritative damage เข้มงวดขึ้น (จุดสำคัญสุดของ anti-cheat)
- [ ] Matchmaking/ranking เบื้องต้น
- [ ] Balance testing แยกจาก PvE (สกิล/item บางตัวอาจต้อง nerf เฉพาะ PvP)

**Done เมื่อ:** ผู้เล่น 2 คนเข้า arena สู้กันได้ ผลตัดสินยุติธรรมแม้ ping ต่างกัน

---

## Phase 8 — Polish & Live-service Readiness
**ระยะเวลา:** ต่อเนื่อง

### Task list
- [ ] Anti-cheat แน่นขึ้น + logging/monitoring
- [ ] Balancing จาก playtest data จริง
- [ ] Onboarding/tutorial
- [ ] Server scaling (หลาย zone, load balancing)
- [ ] Content เพิ่ม: บอสใหม่, archetype ใหม่, โซนใหม่

---

## สรุปเวลาโดยรวม
| ช่วง | Phase | เวลาโดยประมาณ |
|---|---|---|
| แกนเกมเล่นได้ | 0-3 | ~3-4 เดือน |
| ระบบสกิล (active+passive) | 3.5, 4.5 | ~1-1.5 เดือน (คู่ขนานกับ Phase 4-5 ได้) |
| เนื้อหาเต็มสไตล์ SLF | 4-6 | ~4-5 เดือน |
| PvP + Polish | 7-8 | ~2-3 เดือน |
| **รวม (vertical slice เต็มระบบ)** | | **~9-12 เดือน** |

## หลักการสำคัญ
1. **แต่ละ Phase ต้อง "เล่นได้จริง" ก่อนไป Phase ถัดไป** — อย่าวางแผนยาวแล้วเจอปัญหาตอนท้าย
2. **อย่าข้าม Phase 4 (Boss) ไปเร็ว** — ความรู้สึก SLF จริงๆ อยู่ที่ boss design ไม่ใช่ระบบรอบข้าง
3. **Phase 3.5/4.5 (สกิล) ทำคู่ขนานกับทีมที่ว่างได้** — ไม่ block core combat loop
4. **Server validate ทุกอย่างที่กระทบ PvP/economy** (damage, skill level, item drop) — ห้าม trust client เด็ดขาด

---

## Design Note: ระบบ Class — ยึดหลักนี้ไว้ไม่ให้หลงทาง

**การตัดสินใจ:** ใช้ระบบ **Classless แบบมี "แนวโน้ม" (soft archetype)** ไม่ใช่ fixed class ที่ผู้เล่นเลือกตอนสร้างตัว

### เหตุผล
- Core loop ของเกมคือ "ล่าสมุด → ปลดล็อกสกิล → build เอง" ถ้าบังคับเลือก class ตั้งแต่ต้นจะขัดกับ loop นี้ทันที
- ตรงกับฟีล SLF ที่ตัวเอกเก่งเพราะผสมกลไกแปลกๆ เอง ไม่ใช่เพราะเลือก class สำเร็จรูป
- ผู้เล่นใหม่ตอบคำถาม "จะเป็นอะไร" ไม่ได้ตั้งแต่นาทีแรกที่ยังไม่รู้จักเกม (หลัก flow state: อย่าถามสิ่งที่ผู้เล่นตอบไม่ได้)

### โมเดลที่ต้องยึดไว้ (อย่าออกแบบเบี่ยงจากนี้)
```
เข้าเกมครั้งแรก
   ↓
Skill พื้นฐานเหมือนกันหมดทุกคน (ไม่มีหน้าจอเลือก class)
   ↓
เล่นไปเรื่อยๆ → ล่าสมุด/ของ → ปลดล็อก active skill ตามที่เจอ (Phase 3.5)
   ↓
Passive tree: เดินตามธรรมชาติไปทางที่ถนัด มีโซนแนะนำ แต่ไม่บังคับ (Phase 4.5)
   ↓
Attribute (STR/INT/DEX) ที่เทไป = soft-lock ว่าจะใช้สกิลไหนได้ดี (ไม่ hard-lock)
   ↓
ระบบแสดง "title" ให้คนอื่นเห็นว่าเล่นสายไหน (เดาจาก skill/node ที่ใช้เยอะสุด, เปลี่ยนได้เสมอ)
```

### 3 ข้อควรระวัง (เตือนตัวเองเวลาดีไซน์ต่อ)
| ความเสี่ยง | ทางแก้ที่ตกลงไว้ |
|---|---|
| Balance พังเพราะผสมอิสระเกินไป | ใช้ Attribute requirement (STR/INT/DEX) จูงใจแทนบังคับ |
| ผู้เล่นใหม่งงไม่รู้จะไปทางไหน | มี "Starter Path" แนะนำตอนต้นเกม (ไม่บังคับ) + Respec มีต้นทุนแต่ทำได้เสมอ |
| PvP โกลาหลเพราะเดาทางคู่ต่อสู้ไม่ได้ | แสดง title/archetype ที่ระบบเดาให้ตอน matchmaking |

**กติกาทอง:** ทุกฟีเจอร์ที่เพิ่มเข้ามาในระบบสกิล/build ต้องตอบคำถามนี้ได้ — *"มันบังคับผู้เล่นเลือกทางตั้งแต่ต้นไหม?"* ถ้าใช่ = ผิดทิศจากที่วางไว้

---

## Design Note: ขนาดแมพ + จำนวนผู้เล่น — ยึดหลักนี้ไว้ไม่ให้หลงทาง

**การตัดสินใจ:** "Open-World" หมายถึงเดินทางได้อิสระไม่มี loading wall ขวางระหว่างพื้นที่ — **ไม่ได้แปลว่าต้องมีผู้เล่น 100+ คนยืนพื้นที่เดียวกันพร้อมกัน** สองเรื่องนี้แยกกันคนละปัญหา อย่าสับสน

### ขนาดแมพ
- ไม่ทำแมพเดียวขนาด GTA5 (8x8 km) เพราะทีม 2-5 คนไม่มีทางใส่ content ให้เต็มพื้นที่ได้ทัน จะได้พื้นที่ว่างเปล่าแทนความรู้สึกโลกกว้าง
- ใช้โมเดล **หลายโซนเชื่อมกัน** (คล้าย WoW/Diablo) โซนละ ~2x2 – 4x4 km แต่ละโซน ship เป็นชิ้นๆ ได้ ไม่ต้องรอ content เต็มทั้งโลก
- Rendering ไม่ใช่ข้อจำกัด (clipmap terrain ของ SNOWFLOW คงต้นทุนไว้ที่ ~333k triangles ไม่ว่าโลกจะใหญ่แค่ไหน) — ข้อจำกัดจริงคือ "มีทีมพอใส่ content ไหม"

### จำนวนผู้เล่น
- เป้าหมายที่ถูกต้อง: **"ผู้เล่นรวมทั้งระบบ 100+ คนพร้อมกันได้"** ไม่ใช่ "100+ คนยืนจุดเดียวกัน" — ไม่มีเกม Open-World ไหนทำแบบหลังจริงๆ (WoW ใช้ layering, GTA Online จำกัด ~32 คนต่อ session, Genshin ใช้ instance เล็ก)
- ใช้โมเดล **sharded instance**: โซนเดียวกัน (แผนที่เดียวกัน ผู้เล่นรู้สึกว่าเป็นที่เดียวกัน) แต่แบ่งเป็นหลาย instance ๆ ละ ~20-40 คน กระจายด้วย matchmaker

```
โซน "ทุ่งหิมะเหนือ"
   ├─ Instance 1: ~30 คน (VPS/process A)
   ├─ Instance 2: ~30 คน (VPS/process B)
   └─ Instance 3: ~30 คน (VPS/process C)
รวมทั้งเซิร์ฟเวอร์ = 100+ คนเล่นพร้อมกันได้จริง โดยแต่ละคนไม่รู้สึกแน่นเกินไป
```

### ลำดับการ scale ที่ถูกต้อง (อย่าข้ามขั้น)
1. **Interest Management (AOI)** ก่อนเสมอ — แก้ปัญหา O(n²) broadcast ที่ต้นเหตุ (อยู่ใน Phase 1 แล้ว)
2. **Vertical scaling** (VPS สเปคแรงขึ้น) — ช่วยได้ระดับหนึ่ง ~30-50 คนต่อ instance ในทางปฏิบัติ
3. **Horizontal scaling** (หลาย instance/หลายเครื่อง + Redis shared presence + matchmaker) — เมื่อคนเกินที่ 1 ห้องรับไหว

**เหตุผลเชิง gameplay ที่ต้องยึดไว้ด้วย:** เกมแนวล่ามอนสเตอร์/boss-pattern แบบ SLF ต้องการความท้าทายระดับปาร์ตี้เล็ก (2-5 คน) ถ้ายัดคนเยอะเกินไปในพื้นที่เดียว บอสจะถูกรุมจนไม่มีความหมาย ขัดกับแก่นของเกมที่วางไว้ตั้งแต่ Phase 4
