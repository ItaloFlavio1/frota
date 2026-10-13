// Abre o backup automático gerado pelo GitHub (openssl enc -aes-256-cbc -pbkdf2 -iter 200000 -md sha256).
// Formato do arquivo: "Salted__" + 8 bytes de sal + dados cifrados.
export const ITERACOES = 200000;

export async function decifrarBackup(buffer, senha) {
  const bytes = new Uint8Array(buffer);
  const cabecalho = new TextDecoder().decode(bytes.slice(0, 8));
  if (cabecalho !== 'Salted__') throw new Error('Arquivo .enc inválido.');
  const sal = bytes.slice(8, 16);
  const chaveBase = await crypto.subtle.importKey('raw', new TextEncoder().encode(senha), 'PBKDF2', false, ['deriveBits']);
  const bits = new Uint8Array(await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: sal, iterations: ITERACOES, hash: 'SHA-256' }, chaveBase, 384));
  const chave = await crypto.subtle.importKey('raw', bits.slice(0, 32), 'AES-CBC', false, ['decrypt']);
  try {
    const claro = await crypto.subtle.decrypt({ name: 'AES-CBC', iv: bits.slice(32, 48) }, chave, bytes.slice(16));
    return new TextDecoder().decode(claro);
  } catch {
    throw new Error('Senha do backup incorreta.');
  }
}
