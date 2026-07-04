function validateEmail(email) {
  if (!email || !email.trim()) return 'El correo es obligatorio.';
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!re.test(email)) return 'Formato de correo inválido.';
  return null;
}

function validatePassword(password) {
  if (!password) return 'La contraseña es obligatoria.';
  if (password.length < 6) return 'La contraseña debe tener al menos 6 caracteres.';
  return null;
}

function validateRequired(value, fieldName) {
  if (value === undefined || value === null || String(value).trim() === '')
    return `${fieldName} es obligatorio.`;
  return null;
}

function validateDigits(value, fieldName) {
  const text = String(value ?? '').trim();
  if (!text) return `${fieldName} es obligatorio.`;
  if (!/^\d+$/.test(text)) return `${fieldName} debe contener solo números.`;
  return null;
}

function validateNumeric(value, fieldName) {
  if (isNaN(Number(value))) return `${fieldName} debe ser numérico.`;
  return null;
}

function validateAge(age) {
  const text = String(age ?? '').trim();
  if (text === '') return 'La edad es obligatoria.';
  const num = Number(age);
  if (!Number.isInteger(num)) return 'La edad debe ser un número entero.';
  if (num < 0 || num > 13) return 'La edad debe estar entre 0 y 13.';
  return null;
}

function validateGender(gender) {
  if (!['male', 'female'].includes(gender)) return 'El género debe ser masculino o femenino.';
  return null;
}

function validateSlug(slug) {
  if (!slug || !slug.trim()) return 'El slug es obligatorio.';
  const re = /^[a-z0-9-]+$/;
  if (!re.test(slug)) return 'El slug solo puede contener letras minúsculas, números y guiones.';
  return null;
}

function validateGiftStock(stock) {
  const num = Number(stock);
  if (!Number.isInteger(num)) return 'El stock debe ser un número entero.';
  if (num < 0) return 'El stock no puede ser negativo.';
  return null;
}

function validateAgeRange(minAge, maxAge) {
  const min = Number(minAge);
  const max = Number(maxAge);
  if (!Number.isInteger(min) || !Number.isInteger(max)) {
    return 'Las edades deben ser números enteros.';
  }
  if (min < 0 || max > 13) {
    return 'Las edades deben estar entre 0 y 13.';
  }
  if (min > max) {
    return 'La edad mínima debe ser menor o igual a la edad máxima.';
  }
  return null;
}

const SUPPORT_TYPES = [
  'NOT_FOUND',
  'BENEFICIARY_DATA_INCORRECT',
  'MISSING_BENEFICIARY',
  'AGE_GENDER_INCORRECT',
  'GIFT_SELECTION_PROBLEM',
  'OTHER',
];

function validateSupportType(type) {
  if (!SUPPORT_TYPES.includes(type)) {
    return 'Selecciona un tipo de problema válido.';
  }
  return null;
}

function validateSupportMessage(message) {
  const text = String(message ?? '').trim();
  if (!text) return 'El mensaje es obligatorio.';
  if (text.length < 10) return 'El mensaje debe tener al menos 10 caracteres.';
  if (text.length > 1000) return 'El mensaje no puede superar 1000 caracteres.';
  return null;
}

export {
  validateEmail,
  validatePassword,
  validateRequired,
  validateDigits,
  validateNumeric,
  validateAge,
  validateGender,
  validateSlug,
  validateGiftStock,
  validateAgeRange,
  validateSupportType,
  validateSupportMessage,
  SUPPORT_TYPES,
};

