// Regenerates js/seed.js from database/library_sqlite.sql (single source of truth)
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const sql = fs.readFileSync(path.join(root, 'database/library_sqlite.sql'), 'utf8');
fs.writeFileSync(path.join(root, 'js/seed.js'),
  '/* Generated from database/library_sqlite.sql - run `node tools/build_seed.js` after editing the SQL. */\n' +
  'window.LIBRARY_SEED_SQL = ' + JSON.stringify(sql) + ';\n');
console.log('js/seed.js written (' + sql.length + ' chars)');
