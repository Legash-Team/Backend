// tests/unit/bloodRequestModels.test.js
const mongoose = require('mongoose');
const BloodRequest = require('../../src/models/BloodRequest');
const BloodRequestResponse = require('../../src/models/BloodRequestResponse');

describe('Unit Tests: BloodRequest Model', () => {
  const validRequest = {
    hospital: new mongoose.Types.ObjectId(),
    bloodType: 'O+',
    quantityNeeded: 2,
    closesAt: new Date(Date.now() + 8 * 60 * 60 * 1000),
  };

  test('should create a request with defaults and required closesAt', async () => {
    const request = await BloodRequest.create(validRequest);

    expect(request.status).toBe('open');
    expect(request.closedReason).toBeNull();
    expect(request.closedAt).toBeNull();
    expect(request.createdAt).toBeInstanceOf(Date);
    expect(request.closesAt).toBeInstanceOf(Date);
  });

  test('should reject invalid bloodType', async () => {
    await expect(
      BloodRequest.create({ ...validRequest, bloodType: 'unknown' })
    ).rejects.toThrow();
  });

  test('should reject quantityNeeded below 1', async () => {
    await expect(
      BloodRequest.create({ ...validRequest, quantityNeeded: 0 })
    ).rejects.toThrow();
  });

  test('should reject invalid status and closedReason', async () => {
    await expect(
      BloodRequest.create({ ...validRequest, status: 'expired' })
    ).rejects.toThrow();
    await expect(
      BloodRequest.create({ ...validRequest, closedReason: 'nope' })
    ).rejects.toThrow();
  });

  test('should require closesAt at creation', async () => {
    const { closesAt: _closesAt, ...withoutClosesAt } = validRequest;
    await expect(BloodRequest.create(withoutClosesAt)).rejects.toThrow();
  });

  test('should have an index on { status, closesAt }', async () => {
    const indexes = BloodRequest.schema.indexes().map(([fields]) => fields);
    expect(indexes).toContainEqual({ status: 1, closesAt: 1 });
  });
});

describe('Unit Tests: BloodRequestResponse Model', () => {
  const validResponse = {
    bloodRequest: new mongoose.Types.ObjectId(),
    donor: new mongoose.Types.ObjectId(),
  };

  test('should create a response with defaults', async () => {
    const response = await BloodRequestResponse.create(validResponse);

    expect(response.status).toBe('pending');
    expect(response.notifiedAt).toBeInstanceOf(Date);
    expect(response.respondedAt).toBeNull();
  });

  test('should accept denied status and record respondedAt', async () => {
    const response = await BloodRequestResponse.create({
      ...validResponse,
      status: 'denied',
      respondedAt: new Date(),
    });

    expect(response.status).toBe('denied');
    expect(response.respondedAt).toBeInstanceOf(Date);
  });

  test('should reject invalid status', async () => {
    await expect(
      BloodRequestResponse.create({ ...validResponse, status: 'maybe' })
    ).rejects.toThrow();
  });

  test('should have a compound index on { donor, status }', async () => {
    const indexes = BloodRequestResponse.schema.indexes().map(([fields]) => fields);
    expect(indexes).toContainEqual({ donor: 1, status: 1 });
  });
});