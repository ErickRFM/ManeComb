import type { TestCardInput } from '../types';

function onlyDigits(value: string) {
  return String(value || '').replace(/\D/g, '');
}

function passesLuhn(value: string) {
  const digits = onlyDigits(value);
  let sum = 0;
  let doubleDigit = false;

  for (let index = digits.length - 1; index >= 0; index -= 1) {
    let digit = Number(digits[index]);
    if (doubleDigit) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    doubleDigit = !doubleDigit;
  }

  return digits.length >= 13 && digits.length <= 19 && sum % 10 === 0;
}

function isValidExpiry(value: string) {
  const match = String(value || '').trim().match(/^(\d{2})\s*\/\s*(\d{2}|\d{4})$/);
  if (!match) return false;
  const month = Number(match[1]);
  const year = Number(match[2].length === 2 ? `20${match[2]}` : match[2]);
  if (month < 1 || month > 12) return false;
  return new Date(year, month, 0, 23, 59, 59, 999).getTime() >= Date.now();
}

export function validateTestCard(input: TestCardInput) {
  if (input.cardholderName.trim().length < 3) return 'Ingresa el nombre del titular.';
  if (!passesLuhn(input.cardNumber)) return 'El número de tarjeta de prueba no tiene un formato válido.';
  if (!isValidExpiry(input.expiry)) return 'La fecha de expiración debe tener formato MM/AA y estar vigente.';
  if (!/^\d{3,4}$/.test(onlyDigits(input.cvv))) return 'El CVV debe tener 3 o 4 dígitos.';
  if (input.postalCode.trim() && !/^[a-zA-Z0-9 -]{4,10}$/.test(input.postalCode.trim())) {
    return 'El código postal no tiene un formato válido.';
  }
  return null;
}
