require('dotenv').config({ path: '/etc/secrets/.env' });
const path = require('path');
const fs = require('fs');
const { DatabaseSync } = require('node:sqlite');

const dataDir = process.env.DATA_DIR || path.join(__dirname, 'data');
const db = new DatabaseSync(path.join(dataDir, 'scottyhub.db'));

const email = 'maposacourage41@gmail.com';
const result = db.prepare("UPDATE users SET role='admin' WHERE email=?").run(email);

if (result.changes > 0) {
  console.log(`✅ ${email} is now admin`);
} else {
  console.log(`❌ User not found — make sure you've registered first`);
}

db.close();
process.exit(0);
