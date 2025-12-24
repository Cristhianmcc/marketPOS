// lib/superadmin.ts
// Verificación de SUPERADMIN mediante variable de entorno

export function isSuperAdmin(email: string): boolean {
  const superadminEmails = process.env.SUPERADMIN_EMAILS || '';
  
  if (!superadminEmails) {
    return false;
  }

  const emailList = superadminEmails
    .split(',')
    .map(e => e.trim().toLowerCase())
    .filter(e => e.length > 0);

  return emailList.includes(email.toLowerCase());
}

export function generateTemporaryPassword(): string {
  // Genera password temporal de 12 caracteres: letras + números
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  let password = '';
  for (let i = 0; i < 12; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return password;
}
