// Set (or reset) a user's password from the server, using the admin database connection.
// For the very first administrator, or if every administrator is locked out.
//
//   npm run db:set-password -- <user e-mail>            (password is read from PMIS_NEW_PASSWORD)
//
// The password is taken from the environment, not the command line, so it does
// not end up in shell history. The user must choose their own at next sign-in.
import { adminUrl, loadEnv, withClient } from "./lib.mjs";

loadEnv();
const email = process.argv[2];
const password = process.env.PMIS_NEW_PASSWORD;
if (!email || !password) {
  console.error("Usage: PMIS_NEW_PASSWORD=<password> npm run db:set-password -- <user e-mail>");
  process.exit(2);
}

await withClient(adminUrl(), async (c) => {
  const { rows } = await c.query("SELECT id, name, active FROM users WHERE email = $1::citext", [email]);
  if (!rows.length) {
    console.error(`No user with e-mail ${email}. Add the user first (Users & Roles).`);
    process.exit(1);
  }
  await c.query("SELECT app.store_password($1, $2, true)", [rows[0].id, password]);
  console.log(`Password set for ${rows[0].name}${rows[0].active ? "" : " (note: this account is deactivated)"}. They must choose their own at next sign-in.`);
}).catch((e) => { console.error(e.message); process.exit(1); });
