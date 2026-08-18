// tests/unit/donorModel.test.js
const Donor = require('../../src/models/Donor');

describe('Unit Tests: Donor Model', () => {
  const validDonorData = {
    name: 'Abebe Kebede',
    passwordHash: 'hashedpassword',
    phone: '+251911000000',
    fin: 'FIN-123456',
    gender: 'male',
    bloodType: 'O+',
    location: { type: 'Point', coordinates: [38.75, 9.03] },
    agreedToTerms: true,
  };

  test('pushToken should default to null on new donor documents', async () => {
    const donor = await Donor.create(validDonorData);

    expect(donor.pushToken).toBeNull();
  });

  test('pushToken should persist after save', async () => {
    const donor = await Donor.create({ ...validDonorData, phone: '+251911000001' });
    donor.pushToken = 'fcm-device-token-123';
    await donor.save();

    const reloaded = await Donor.findById(donor._id);
    expect(reloaded.pushToken).toBe('fcm-device-token-123');
  });
});