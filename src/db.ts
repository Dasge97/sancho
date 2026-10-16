import pg from 'pg';
import fs from 'node:fs/promises';
const {Pool}=pg;
export const pool=new Pool({connectionString:process.env.DATABASE_URL||'postgres://sancho:sancho@localhost:5432/sancho'});
export async function migrate(){ await pool.query(await fs.readFile(new URL('./db/schema.sql',import.meta.url),'utf8')); }
