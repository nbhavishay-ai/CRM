import { Database } from 'bun:sqlite';
import { existsSync } from 'node:fs';
const target = `${import.meta.dir}/retest.db`;
if (existsSync(target)) throw new Error('Refusing to overwrite an existing retest database.');
const original = new Database(`${import.meta.dir}/audit.db`, {readonly:true});
const schema = original.query("SELECT sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ORDER BY CASE type WHEN 'table' THEN 0 ELSE 1 END").all();
const db = new Database(target,{create:true});
for (const row of schema) db.exec(row.sql);
db.close(); original.close();
