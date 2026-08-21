// Backend/src/utils/bloodCompatibility.js

const COMPATIBILITY_CHART = {
  'O-': ['O-'],
  'O+': ['O+', 'O-'],
  'A-': ['A-', 'O-'],
  'A+': ['A+', 'A-', 'O+', 'O-'],
  'B-': ['B-', 'O-'],
  'B+': ['B+', 'B-', 'O+', 'O-'],
  'AB-': ['AB-', 'A-', 'B-', 'O-'],
  'AB+': ['AB+', 'AB-', 'A+', 'A-', 'B+', 'B-', 'O+', 'O-'],
};

const VALID_BLOOD_TYPES = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];

function getCompatibleDonorTypes(recipientBloodType) {
  return COMPATIBILITY_CHART[recipientBloodType] || [];
}

function isBloodTypeKnown(bloodType) {
  return VALID_BLOOD_TYPES.includes(bloodType);
}

module.exports = {
  COMPATIBILITY_CHART,
  VALID_BLOOD_TYPES,
  getCompatibleDonorTypes,
  isBloodTypeKnown,
};