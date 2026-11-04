export const MIN_PASSWORD = 8;

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

export function emailError(email: string): string | undefined {
  return isValidEmail(email) ? undefined : "Enter a valid email address.";
}

export function passwordError(password: string): string | undefined {
  return password.length >= MIN_PASSWORD
    ? undefined
    : `Use at least ${MIN_PASSWORD} characters.`;
}
