const {
  parseBloodTypeQuery,
  buildStockMap,
  SNAPSHOT_CRON,
  SNAPSHOT_TIMEZONE
} = require('../../src/utils/hospitalStockHelpers');
const { VALID_BLOOD_TYPES } = require('../../src/utils/bloodCompatibility');

describe('Hospital Stock Helpers Unit Tests', () => {
  describe('Constants', () => {
    test('exports expected SNAPSHOT_CRON and SNAPSHOT_TIMEZONE', () => {
      expect(SNAPSHOT_CRON).toBe('5 0 * * *');
      expect(SNAPSHOT_TIMEZONE).toBe('Africa/Addis_Ababa');
    });
  });

  describe('parseBloodTypeQuery', () => {
    test('absent parameter (undefined) returns value: null', () => {
      expect(parseBloodTypeQuery(undefined)).toEqual({ value: null });
    });

    test('empty string returns value: null', () => {
      expect(parseBloodTypeQuery('')).toEqual({ value: null });
    });

    test('each valid blood type returns the exact type', () => {
      for (const type of VALID_BLOOD_TYPES) {
        expect(parseBloodTypeQuery(type)).toEqual({ value: type });
      }
    });

    test('tolerates space-decoded plus (A , AB , O )', () => {
      expect(parseBloodTypeQuery('A ')).toEqual({ value: 'A+' });
      expect(parseBloodTypeQuery('AB ')).toEqual({ value: 'AB+' });
      expect(parseBloodTypeQuery('O ')).toEqual({ value: 'O+' });
      expect(parseBloodTypeQuery('B ')).toEqual({ value: 'B+' });
    });

    test('rejects invalid blood types', () => {
      const res = parseBloodTypeQuery('Z+');
      expect(res.error).toBeDefined();
      expect(res.error).toMatch(/Invalid bloodType/);
    });

    test('rejects lowercase blood types', () => {
      const res = parseBloodTypeQuery('a+');
      expect(res.error).toBeDefined();
      expect(res.error).toMatch(/Invalid bloodType/);
    });

    test('rejects array query parameter (e.g. repeated query parameter)', () => {
      const res = parseBloodTypeQuery(['A+', 'B+']);
      expect(res.error).toBe('bloodType must be a single value.');
    });

    test('rejects object query parameter', () => {
      const res = parseBloodTypeQuery({ type: 'A+' });
      expect(res.error).toBe('bloodType must be a single value.');
    });
  });

  describe('buildStockMap', () => {
    test('missing or null bloodStock array returns all eight types with 0', () => {
      const resNull = buildStockMap(null);
      const resUndefined = buildStockMap(undefined);
      expect(Object.keys(resNull)).toEqual(VALID_BLOOD_TYPES);
      expect(Object.values(resNull)).toEqual([0, 0, 0, 0, 0, 0, 0, 0]);
      expect(resUndefined).toEqual(resNull);
    });

    test('empty bloodStock array returns all eight types with 0', () => {
      const res = buildStockMap([]);
      expect(res).toEqual({
        'A+': 0,
        'A-': 0,
        'B+': 0,
        'B-': 0,
        'AB+': 0,
        'AB-': 0,
        'O+': 0,
        'O-': 0
      });
    });

    test('missing blood types default to 0', () => {
      const stock = [{ bloodType: 'A+', availableUnits: 15 }];
      const res = buildStockMap(stock);
      expect(res['A+']).toBe(15);
      expect(res['O-']).toBe(0);
      expect(Object.keys(res)).toEqual(VALID_BLOOD_TYPES);
    });

    test('negative and non-numeric units count as 0', () => {
      const stock = [
        { bloodType: 'A+', availableUnits: -5 },
        { bloodType: 'B+', availableUnits: 'invalid' },
        { bloodType: 'AB+', availableUnits: NaN },
        { bloodType: 'O+', availableUnits: null }
      ];
      const res = buildStockMap(stock);
      expect(res['A+']).toBe(0);
      expect(res['B+']).toBe(0);
      expect(res['AB+']).toBe(0);
      expect(res['O+']).toBe(0);
    });

    test('returns only single type when onlyType is specified', () => {
      const stock = [
        { bloodType: 'A+', availableUnits: 10 },
        { bloodType: 'O+', availableUnits: 25 }
      ];
      const res = buildStockMap(stock, 'O+');
      expect(res).toEqual({ 'O+': 25 });
    });

    test('first entry wins if duplicate entries exist for a blood type', () => {
      const stock = [
        { bloodType: 'A+', availableUnits: 12 },
        { bloodType: 'A+', availableUnits: 99 }
      ];
      const res = buildStockMap(stock);
      expect(res['A+']).toBe(12);
    });

    test('reservedUnits and minimumUnits are ignored completely', () => {
      const stock = [{ bloodType: 'A+', availableUnits: 8, reservedUnits: 50, minimumUnits: 100 }];
      const res = buildStockMap(stock);
      expect(res['A+']).toBe(8);
    });
  });
});
