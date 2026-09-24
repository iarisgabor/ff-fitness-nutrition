// Generează o parolă nouă pentru contul general (BisericaLogos) și linia
// ADMIN_PASSWORD_HASH de pus în wrangler.toml. Același algoritm ca src/session.js
// (PBKDF2-SHA256, 100k iterații). Rulare: node scripts/admin-password.mjs
//
// Parola e aleatoare (16 caractere, ~92 biți) tocmai ca hash-ul să poată sta public
// în repo fără risc de spargere — nu înlocui cu o parolă aleasă de mână.
import { webcrypto as crypto } from 'node:crypto';

const ALPHABET = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // fără 0/O, 1/l/I
const ITERATIONS = 100000;
const toHex = (buf) => Buffer.from(buf).toString('hex');

function randomPassword() {
  const out = [];
  while (out.length < 16) {
    const [b] = crypto.getRandomValues(new Uint8Array(1));
    if (b < 256 - (256 % ALPHABET.length)) out.push(ALPHABET[b % ALPHABET.length]); // fără bias
  }
  return out.join('').match(/.{4}/g).join('-');
}

const password = process.argv[2] || randomPassword();
const salt = crypto.getRandomValues(new Uint8Array(16));
const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: ITERATIONS }, key, 256);

console.log(`Parolă: ${password}`);
console.log(`ADMIN_PASSWORD_HASH = "pbkdf2$${ITERATIONS}$${toHex(salt)}$${toHex(bits)}"`);
