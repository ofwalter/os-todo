// Usage: npm run hash-password -- "your password"
// Prints the value to put in APP_PASSWORD_HASH (.env locally, Vercel env vars in prod).
import { hashPassword } from "../server/auth/password.js";

const password = process.argv[2];
if (!password) {
  console.error('Usage: npm run hash-password -- "your password"');
  process.exit(1);
}
console.log(await hashPassword(password));
