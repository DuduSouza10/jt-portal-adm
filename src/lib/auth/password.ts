import bcrypt from "bcryptjs";

const ROUNDS = 11;

export const hashPassword = (plain: string) => bcrypt.hash(plain, ROUNDS);

/**
 * Senha TEMPORÁRIA (gerada pelo sistema, troca obrigatória no 1º acesso) usa custo menor: ~30 ms em vez de
 * ~160 ms por senha. Importar milhares de usuários cabe no limite de tempo de uma requisição no Netlify.
 * Continua seguro porque a senha é aleatória (12 caracteres de 54 ≈ 69 bits): o custo do bcrypt protege
 * senhas fracas escolhidas por pessoas, e essa não é uma delas. A senha que a pessoa cria usa ROUNDS.
 */
const TEMP_ROUNDS = 8;
export const hashTempPassword = (plain: string) => bcrypt.hash(plain, TEMP_ROUNDS);
export const verifyPassword = (plain: string, hash: string) => bcrypt.compare(plain, hash);

/** Senha temporária legível (sem caracteres ambíguos) para reset pelo admin. */
export function generateTempPassword(length = 12) {
  const chars = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, (b) => chars[b % chars.length]).join("");
}

export const PASSWORD_MIN = 8;
