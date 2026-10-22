const crypto = require('crypto');
const Donor = require('../models/Donor');

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
const ID_LENGTH = 8;
const MAX_RETRIES = 5;

function createRawShortId() {
  let id = '';
  for (let i = 0; i < ID_LENGTH; i++) {
    id += ALPHABET[crypto.randomInt(0, ALPHABET.length)];
  }
  return id;
}

async function generateUniqueDonorShortId(maxRetries = MAX_RETRIES) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const candidate = createRawShortId();
    const exists = await Donor.exists({ shortId: candidate });
    if (!exists) {
      return candidate;
    }
  }
  throw new Error(`Failed to generate a unique Short ID after ${maxRetries} attempts.`);
}

module.exports = {
  createRawShortId,
  generateUniqueDonorShortId,
  ALPHABET,
  ID_LENGTH,
};