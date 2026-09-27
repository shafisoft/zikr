/**
 * R1 bundled city list — offline search quality gates (AC1.1.2):
 * coverage (all 64 Bangladesh districts + diaspora entries with bn names),
 * bn+en matching, prefix ranking, and the no-network shape of the data.
 */

import { describe, it, expect } from 'vitest';
import { PRAYER_CITIES, cityById, searchCities } from '../../../src/core/data/prayerCities';

describe('prayerCities — bundled dataset shape', () => {
  it('is a thorough, offline, bn-at-parity list', () => {
    expect(PRAYER_CITIES.length).toBeGreaterThanOrEqual(150);

    // Every entry carries both names and sane coordinates.
    for (const city of PRAYER_CITIES) {
      expect(city.id.length).toBeGreaterThan(0);
      expect(city.name.length).toBeGreaterThan(0);
      expect(city.nameBn.length).toBeGreaterThan(0);
      expect(Math.abs(city.lat)).toBeLessThanOrEqual(90);
      expect(Math.abs(city.lng)).toBeLessThanOrEqual(180);
    }

    // ALL 64 Bangladesh districts are present.
    const bd = PRAYER_CITIES.filter(c => c.id.startsWith('bd-'));
    expect(bd.length).toBe(64);

    // Diaspora coverage: UK, US, Canada, Gulf, Malaysia, Singapore, Australia.
    for (const prefix of ['gb-', 'us-', 'ca-', 'ae-', 'sa-', 'qa-', 'kw-', 'om-', 'bh-', 'my-', 'sg-', 'au-']) {
      expect(PRAYER_CITIES.some(c => c.id.startsWith(prefix)), prefix).toBe(true);
    }

    // ids are unique (the cityId → bn label lookup depends on it).
    expect(new Set(PRAYER_CITIES.map(c => c.id)).size).toBe(PRAYER_CITIES.length);
  });
});

describe('searchCities — offline bn+en search', () => {
  it('matches English names case-insensitively', () => {
    const hits = searchCities('dha');
    expect(hits[0]?.name).toBe('Dhaka');
    expect(searchCities('LONDON')[0]?.id).toBe('gb-london');
  });

  it('matches Bangla names', () => {
    const hits = searchCities('সিলেট');
    expect(hits[0]?.id).toBe('bd-sylhet');
    expect(searchCities('চট্ট')[0]?.id).toBe('bd-chattogram');
  });

  it('ranks prefix matches first and caps the result size', () => {
    const hits = searchCities('ra', 8);
    expect(hits.length).toBeLessThanOrEqual(8);
    expect(hits[0]?.name.toLowerCase().startsWith('ra')).toBe(true);
  });

  it('returns nothing for empty or unmatched queries', () => {
    expect(searchCities('')).toEqual([]);
    expect(searchCities('   ')).toEqual([]);
    expect(searchCities('zzzzzz')).toEqual([]);
  });
});

describe('cityById — saved-location bn label lookup', () => {
  it('round-trips a city id', () => {
    const city = searchCities('khulna')[0];
    expect(cityById(city.id)?.nameBn).toBe('খুলনা');
    expect(cityById('nope')).toBeUndefined();
  });
});
