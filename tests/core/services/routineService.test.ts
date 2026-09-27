// DB-backed tests for routineService (fake-indexeddb): preset creation
// resolves seeded rows without duplicating them (AC2.1.3), bounds are
// enforced (OQ-4), item edits are forward-only (AC2.2.4), and a soft delete
// removes ONLY the routine — zikrs and sessions untouched (AC2.4.3).
import { beforeEach, describe, expect, it } from 'vitest';
import 'fake-indexeddb/auto';

import { db } from '../../../src/core/db/db';
import { routineService, resetEnsurePresetsForTests } from '../../../src/core/services/routineService';
import { ROUTINE_PRESET_ORDER } from '../../../src/core/utils/routineUtils';
import { ZIKR_CATALOG } from '../../../src/core/data/zikrCatalog';

const PRESET_NAMES = [
  'Bismillahilladhi la Yadurru',
  'Radhitu Billahi Rabba',
  'Allahumma Ajirni Minan-Nar',
  'Hasbiyallahu La ilaha illa Huwa',
  'Sayyidul Istighfar',
  "Allahumma A'inni ala Dhikrika",
];
const PRESET_TARGETS = [3, 3, 7, 7, 1, 10];

async function seedZikrs(): Promise<void> {
  await db.zikrs.bulkAdd([
    { name: 'SubhanAllah', custom: false, createdAt: new Date(), defaultTarget: 33 },
    ...PRESET_NAMES.map((name, i) => ({
      name,
      custom: false,
      createdAt: new Date(),
      defaultTarget: PRESET_TARGETS[i],
    })),
  ]);
}

beforeEach(async () => {
  await db.delete();
  await db.open();
  await seedZikrs();
  resetEnsurePresetsForTests();
});

describe('routineService.createPreset', () => {
  it('creates a six-item routine referencing the EXISTING seeded rows (AC2.1.3)', async () => {
    const before = await db.zikrs.count();
    const id = await routineService.createPreset('morning');

    const routine = await db.routines.get(id);
    expect(routine).toBeTruthy();
    expect(routine!.source).toBe('preset');
    expect(routine!.presetKey).toBe('morning');
    expect(routine!.items.map(i => i.name)).toEqual(PRESET_NAMES);
    expect(routine!.items.map(i => i.target)).toEqual(PRESET_TARGETS);
    // Every item binds a real zikr id; no zikr was duplicated.
    for (const item of routine!.items) {
      const zikr = await db.zikrs.get(item.zikrId);
      expect(zikr?.name).toBe(item.name);
    }
    expect(await db.zikrs.count()).toBe(before);
  });

  it('matches seeded rows case/whitespace-insensitively (the seeder key)', async () => {
    await db.zikrs.clear();
    await db.zikrs.add({
      name: '  bismillahilladhi LA Yadurru ',
      custom: false,
      createdAt: new Date(),
      defaultTarget: 3,
    });
    // The remaining five are missing → creation refuses rather than shortening.
    await expect(routineService.createPreset('morning')).rejects.toThrow(
      'ROUTINE_PRESET_ZIKR_MISSING'
    );
  });

  it('refuses when a cluster zikr row is missing', async () => {
    await db.zikrs
      .where('name')
      .equals('Sayyidul Istighfar')
      .delete();
    await expect(routineService.createPreset('evening')).rejects.toThrow(
      'ROUTINE_PRESET_ZIKR_MISSING'
    );
  });
});

describe('routineService.createCustom + updateItems', () => {
  it('denormalizes names at write time and trims the title', async () => {
    const subhan = (await db.zikrs.where('name').equals('SubhanAllah').first())!;
    const id = await routineService.createCustom({
      title: '  My set  ',
      items: [{ zikrId: subhan.id!, target: 50 }],
    });
    const routine = await db.routines.get(id);
    expect(routine!.title).toBe('My set');
    expect(routine!.items).toEqual([
      { zikrId: subhan.id, name: 'SubhanAllah', target: 50 },
    ]);
  });

  it('edits are forward-only counts on the routine — sessions untouched (AC2.2.4)', async () => {
    const subhan = (await db.zikrs.where('name').equals('SubhanAllah').first())!;
    await db.sessions.add({
      zikrId: subhan.id!,
      count: 33,
      source: 'app',
      timestamp: new Date(),
      date: new Date(),
      editableUntil: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const id = await routineService.createCustom({
      title: 'Set',
      items: [{ zikrId: subhan.id!, target: 33 }],
    });

    await routineService.updateItems(id, [{ zikrId: subhan.id!, target: 100 }]);
    const routine = await db.routines.get(id);
    expect(routine!.items[0].target).toBe(100);
    // History is history: the saved session is exactly as it was.
    expect(await db.sessions.count()).toBe(1);
    expect((await db.sessions.toArray())[0].count).toBe(33);
  });

  it('rejects unknown/soft-deleted zikr references', async () => {
    await expect(
      routineService.createCustom({ title: 'X', items: [{ zikrId: 9999, target: 1 }] })
    ).rejects.toThrow('ROUTINE_ZIKR_MISSING');

    const subhan = (await db.zikrs.where('name').equals('SubhanAllah').first())!;
    await db.zikrs.update(subhan.id!, { deletedAt: new Date() });
    await expect(
      routineService.createCustom({ title: 'X', items: [{ zikrId: subhan.id!, target: 1 }] })
    ).rejects.toThrow('ROUTINE_ZIKR_MISSING');
  });
});

describe('routineService bounds (OQ-4)', () => {
  it('rejects a sixth routine and a thirteenth item', async () => {
    const subhan = (await db.zikrs.where('name').equals('SubhanAllah').first())!;
    for (let i = 0; i < 5; i++) {
      await routineService.createCustom({
        title: `Set ${i}`,
        items: [{ zikrId: subhan.id!, target: 1 }],
      });
    }
    await expect(
      routineService.createCustom({ title: 'One too many', items: [{ zikrId: subhan.id!, target: 1 }] })
    ).rejects.toThrow('ROUTINE_MAX_ROUTINES');

    // Bounds are about LIVE routines: deleting one frees the slot.
    const routines = await db.routines.toArray();
    await routineService.softDelete(routines[0].id);
    const id = await routineService.createCustom({
      title: 'Fits again',
      items: [{ zikrId: subhan.id!, target: 1 }],
    });
    expect(await db.routines.get(id)).toBeTruthy();

    await expect(
      routineService.updateItems(
        id,
        Array.from({ length: 13 }, () => ({ zikrId: subhan.id!, target: 1 }))
      )
    ).rejects.toThrow('ROUTINE_MAX_ITEMS');
  });

  it('rejects empty drafts', async () => {
    await expect(routineService.createCustom({ title: 'Empty', items: [] })).rejects.toThrow(
      'ROUTINE_EMPTY'
    );
  });
});

describe('routineService.softDelete — removes ONLY the routine (AC2.4.3)', () => {
  it('hides the routine from getAll, keeps the row, and never touches zikrs/sessions', async () => {
    const beforeZikrs = await db.zikrs.count();
    const id = await routineService.createPreset('morning');

    await routineService.softDelete(id);
    expect(await routineService.getAll()).toHaveLength(0);
    expect(await db.routines.get(id)).toBeTruthy(); // soft-deleted row survives

    // Restore brings it back.
    await routineService.restore(id);
    expect(await routineService.getAll()).toHaveLength(1);

    expect(await db.zikrs.count()).toBe(beforeZikrs);
    expect(ROUTINE_PRESET_ORDER).toHaveLength(6);
  });
});

describe('routineService.ensurePresets — boot seeding of the FOUR presets (Feature A)', () => {
  /** Give the seeder the full library it sees after a real boot. */
  beforeEach(async () => {
    await db.zikrs.clear();
    await db.zikrs.bulkAdd(
      ZIKR_CATALOG.map(entry => ({
        name: entry.name,
        custom: false,
        createdAt: new Date(),
        defaultTarget: entry.defaultTarget,
      }))
    );
  });

  it('creates all four presets on first boot, each with its schedule', async () => {
    await routineService.ensurePresets();

    const routines = await routineService.getAll();
    // getAll is createdAt-ordered, but same-ms inserts make the order
    // unstable — assert the SET, then per-preset rows.
    expect([...routines.map(r => r.presetKey)].sort()).toEqual(['evening', 'friday', 'morning', 'night']);

    const night = routines.find(r => r.presetKey === 'night')!;
    expect(night.schedule).toEqual({ part: 'night' });
    expect(night.items.map(i => i.target)).toEqual([1, 3, 3, 3, 1, 33, 33, 34, 1]);
    expect(night.items.map(i => i.name)).toEqual([
      'Ayat al-Kursi',
      'Surah Al-Ikhlas',
      'Surah Al-Falaq',
      'Surah An-Nas',
      'Bismika Allahumma Amutu wa Ahya',
      'SubhanAllah',
      'Alhamdulillah',
      'Allahu Akbar',
      'Allahumma Aslamtu Nafsi Ilayk',
    ]);

    const friday = routines.find(r => r.presetKey === 'friday')!;
    expect(friday.schedule).toEqual({ part: 'any', weekday: 5 });
    expect(friday.items.map(i => i.target)).toEqual([1, 100, 100]);

    const morning = routines.find(r => r.presetKey === 'morning')!;
    expect(morning.schedule).toEqual({ part: 'morning' });
  });

  it('booting twice creates no duplicates (idempotent)', async () => {
    await routineService.ensurePresets();
    await routineService.ensurePresets(); // second boot path

    const routines = await routineService.getAll();
    expect(routines).toHaveLength(4);
    expect(new Set(routines.map(r => r.presetKey)).size).toBe(4);
  });

  it('a soft-deleted preset stays dismissed — never recreated on later boots', async () => {
    await routineService.ensurePresets();
    const morning = (await routineService.getAll()).find(r => r.presetKey === 'morning')!;
    await routineService.softDelete(morning.id);

    resetEnsurePresetsForTests(); // simulate the next boot
    await routineService.ensurePresets();

    const routines = await routineService.getAll();
    expect(routines).toHaveLength(3); // morning stays gone
    expect(routines.map(r => r.presetKey)).not.toContain('morning');
    // The dismissed row survives untouched.
    expect((await db.routines.get(morning.id))?.deletedAt).toBeTruthy();
  });

  it('skips a preset quietly when its zikrs cannot resolve (never blocks boot)', async () => {
    // Remove the new Quranic rows — night/friday can't resolve; morning/evening can.
    await db.zikrs.where('name').equals('Ayat al-Kursi').delete();
    await db.zikrs.where('name').equals('Surah Al-Kahf').delete();

    await routineService.ensurePresets();

    const routines = await routineService.getAll();
    expect(routines.map(r => r.presetKey).sort()).toEqual(['evening', 'morning']);
    // And no zikr was duplicated to paper over the gap.
    expect((await db.zikrs.toArray()).filter(z => z.name === 'SubhanAllah')).toHaveLength(1);
  });

  it('presets reference the EXISTING seeded zikr rows — the library never grows', async () => {
    const before = await db.zikrs.count();
    await routineService.ensurePresets();
    const night = (await routineService.getAll()).find(r => r.presetKey === 'night')!;
    for (const item of night.items) {
      const zikr = await db.zikrs.get(item.zikrId);
      expect(zikr?.name).toBe(item.name);
    }
    expect(await db.zikrs.count()).toBe(before);
  });
});
