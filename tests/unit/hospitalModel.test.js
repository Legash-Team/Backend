// tests/unit/hospitalModel.test.js
const Hospital = require('../../src/models/Hospital');

describe('Unit Tests: Hospital Model Schema & Default Blood Stock', () => {
  const validHospitalData = {
    name: 'Test Hospital',
    email: 'test@hospital.edu.et',
    password: 'StrongPassword123!',
    phone: '+251911999999',
    licenseNumber: 'HOSP-ETH-999',
    location: {
      coordinates: [38.75, 9.03],
      address: 'Addis Ababa, Ethiopia'
    }
  };

  test('should successfully save a hospital and auto-populate bloodStock with defaults', async () => {
    const hospital = await Hospital.create(validHospitalData);

    expect(hospital).toHaveProperty('bloodStock');
    expect(hospital.bloodStock).toBeInstanceOf(Array);
    expect(hospital.bloodStock).toHaveLength(8);

    const expectedOrder = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
    hospital.bloodStock.forEach((stock, index) => {
      expect(stock.bloodType).toBe(expectedOrder[index]);
      expect(stock.quantity).toBe(0);
    });
  });

  test('should fail validation if bloodStock contains an invalid blood type', async () => {
    const invalidData = {
      ...validHospitalData,
      email: 'invalid_type@hospital.edu.et',
      phone: '+251911000001',
      licenseNumber: 'HOSP-ETH-101',
      bloodStock: [
        { bloodType: 'X+', quantity: 5 }
      ]
    };

    await expect(Hospital.create(invalidData)).rejects.toThrow();
  });

  test('should fail validation if bloodStock contains a negative quantity', async () => {
    const invalidData = {
      ...validHospitalData,
      email: 'negative_qty@hospital.edu.et',
      phone: '+251911000002',
      licenseNumber: 'HOSP-ETH-102',
      bloodStock: [
        { bloodType: 'O+', quantity: -1 }
      ]
    };

    await expect(Hospital.create(invalidData)).rejects.toThrow();
  });

  test('should allow custom valid quantities when specified', async () => {
    const customData = {
      ...validHospitalData,
      email: 'custom_stock@hospital.edu.et',
      phone: '+251911000003',
      licenseNumber: 'HOSP-ETH-103',
      bloodStock: [
        { bloodType: 'A+', quantity: 10 },
        { bloodType: 'O-', quantity: 5 }
      ]
    };

    const hospital = await Hospital.create(customData);
    expect(hospital.bloodStock).toHaveLength(2);
    expect(hospital.bloodStock[0].bloodType).toBe('A+');
    expect(hospital.bloodStock[0].quantity).toBe(10);
    expect(hospital.bloodStock[1].bloodType).toBe('O-');
    expect(hospital.bloodStock[1].quantity).toBe(5);
  });
});
