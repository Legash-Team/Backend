const { VALID_BLOOD_TYPES } = require('./bloodCompatibility');

const SNAPSHOT_CRON = '5 0 * * *';
const SNAPSHOT_TIMEZONE = 'Africa/Addis_Ababa';

// Returns { value } (null when absent) or { error }.
function parseBloodTypeQuery(raw) {
  if (raw === undefined || raw === '') return { value: null };
  if (typeof raw !== 'string') return { error: 'bloodType must be a single value.' };
  // An unencoded "A+" in a query string decodes to "A " (plus becomes a space).
  const match = [raw, raw.replace(/ $/, '+')].find((c) => VALID_BLOOD_TYPES.includes(c));
  if (!match) return { error: `Invalid bloodType. Allowed: ${VALID_BLOOD_TYPES.join(', ')}` };
  return { value: match };
}

// All eight types (or just onlyType), availableUnits only, missing or invalid -> 0.
function buildStockMap(bloodStock, onlyType = null) {
  const types = onlyType ? [onlyType] : VALID_BLOOD_TYPES;
  const map = {};
  for (const type of types) {
    const entry = (bloodStock || []).find((s) => s.bloodType === type);
    const units = Number(entry && entry.availableUnits);
    map[type] = Number.isFinite(units) && units > 0 ? units : 0;
  }
  return map;
}

module.exports = {
  parseBloodTypeQuery,
  buildStockMap,
  SNAPSHOT_CRON,
  SNAPSHOT_TIMEZONE
};
