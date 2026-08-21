const {
  COMPATIBILITY_CHART,
  VALID_BLOOD_TYPES,
  getCompatibleDonorTypes,
  isBloodTypeKnown,
} = require('../../src/utils/bloodCompatibility');

describe('Unit Tests: Blood Compatibility Utility', () => {
  describe('COMPATIBILITY_CHART and VALID_BLOOD_TYPES', () => {
    test('contains exactly 8 standard blood types', () => {
      expect(VALID_BLOOD_TYPES).toEqual(['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']);
      expect(Object.keys(COMPATIBILITY_CHART)).toHaveLength(8);
    });

    test('O- is the universal red cell donor (only receives O-)', () => {
      expect(getCompatibleDonorTypes('O-')).toEqual(['O-']);
    });

    test('AB+ is the universal red cell recipient (can receive from all 8 types)', () => {
      expect(getCompatibleDonorTypes('AB+')).toEqual(['AB+', 'AB-', 'A+', 'A-', 'B+', 'B-', 'O+', 'O-']);
    });

    test('A+ can receive from A+, A-, O+, O-', () => {
      expect(getCompatibleDonorTypes('A+')).toEqual(['A+', 'A-', 'O+', 'O-']);
    });

    test('A- can receive from A-, O-', () => {
      expect(getCompatibleDonorTypes('A-')).toEqual(['A-', 'O-']);
    });

    test('B+ can receive from B+, B-, O+, O-', () => {
      expect(getCompatibleDonorTypes('B+')).toEqual(['B+', 'B-', 'O+', 'O-']);
    });

    test('B- can receive from B-, O-', () => {
      expect(getCompatibleDonorTypes('B-')).toEqual(['B-', 'O-']);
    });

    test('AB- can receive from AB-, A-, B-, O-', () => {
      expect(getCompatibleDonorTypes('AB-')).toEqual(['AB-', 'A-', 'B-', 'O-']);
    });

    test('returns empty array for invalid or unknown recipient blood types', () => {
      expect(getCompatibleDonorTypes('unknown')).toEqual([]);
      expect(getCompatibleDonorTypes('XYZ')).toEqual([]);
      expect(getCompatibleDonorTypes(null)).toEqual([]);
      expect(getCompatibleDonorTypes(undefined)).toEqual([]);
    });
  });

  describe('isBloodTypeKnown', () => {
    test('returns true for valid blood types', () => {
      VALID_BLOOD_TYPES.forEach((type) => {
        expect(isBloodTypeKnown(type)).toBe(true);
      });
    });

    test('returns false for unknown and invalid blood types', () => {
      expect(isBloodTypeKnown('unknown')).toBe(false);
      expect(isBloodTypeKnown('C+')).toBe(false);
      expect(isBloodTypeKnown(null)).toBe(false);
      expect(isBloodTypeKnown(undefined)).toBe(false);
      expect(isBloodTypeKnown('')).toBe(false);
    });
  });
});
