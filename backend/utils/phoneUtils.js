const crypto = require('crypto');

/**
 * Masks a phone number for display to authorities
 * Example: +919876543210 -> 98XXXX3210
 */
const maskPhoneNumber = (phoneNumber) => {
  if (!phoneNumber || phoneNumber.length < 4) {
    return 'XXXX';
  }
  
  // Remove all non-digit characters
  const cleanNumber = phoneNumber.replace(/[^\d]/g, '');
  
  if (cleanNumber.length >= 10) {
    const first2 = cleanNumber.slice(0, 2);
    const last4 = cleanNumber.slice(-4);
    const middleX = 'X'.repeat(cleanNumber.length - 6);
    return `${first2}${middleX}${last4}`;
  }
  
  // Fallback for shorter numbers
  const last4 = cleanNumber.slice(-4);
  const frontX = 'X'.repeat(Math.max(0, cleanNumber.length - 4));
  return `${frontX}${last4}`;
};

/**
 * Creates a hash of the phone number for internal use
 */
const hashPhoneNumber = (phoneNumber) => {
  if (!phoneNumber) return null;
  return crypto.createHash('sha256')
    .update(phoneNumber.toString())
    .digest('hex');
};

/**
 * Validates phone number format
 */
const validatePhoneNumber = (phoneNumber) => {
  if (!phoneNumber) return true; // Optional field
  
  // Allow digits, spaces, hyphens, parentheses, and plus sign
  const phoneRegex = /^\+?[\d\s\-\(\)]{10,15}$/;
  return phoneRegex.test(phoneNumber);
};

module.exports = {
  maskPhoneNumber,
  hashPhoneNumber,
  validatePhoneNumber
};