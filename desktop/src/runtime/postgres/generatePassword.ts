/**
 * D7.1 - Password Generator
 * Generates secure random passwords for PostgreSQL
 */

import * as crypto from 'crypto';

// Characters allowed in password (avoid special chars that cause issues in URLs)
const CHARSET = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
const DEFAULT_LENGTH = 24;

/**
 * Generate a cryptographically secure random password
 * @param length Password length (default: 24)
 * @returns Random password string
 */
export function generatePassword(length: number = DEFAULT_LENGTH): string {
  const bytes = crypto.randomBytes(length);
  let password = '';
  
  for (let i = 0; i < length; i++) {
    password += CHARSET[bytes[i] % CHARSET.length];
  }
  
  return password;
}

/**
 * Generate a password and write it to a temporary file
 * Used for initdb --pwfile option
 * @param filePath Path to write password file
 * @param password Password to write
 */
export function writePasswordFile(filePath: string, password: string): void {
  const fs = require('fs');
  fs.writeFileSync(filePath, password, { encoding: 'utf-8', mode: 0o600 });
}

/**
 * Delete a password file securely
 * @param filePath Path to password file
 */
export function deletePasswordFile(filePath: string): void {
  const fs = require('fs');
  if (fs.existsSync(filePath)) {
    // Overwrite with random data before deleting
    const randomData = crypto.randomBytes(32).toString('hex');
    fs.writeFileSync(filePath, randomData);
    fs.unlinkSync(filePath);
  }
}
