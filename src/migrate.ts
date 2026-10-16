import {migrate,pool} from './db.js';
await migrate(); console.log('Migraciones aplicadas'); await pool.end();
