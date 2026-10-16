import {pool,migrate} from './db.js';
await migrate();
const repo=await pool.query("INSERT INTO repositories(remote_uuid,workspace,slug,name,active) VALUES('sim:sancho','simulador','demo','Repositorio de ejemplo (simulado)',true) ON CONFLICT(remote_uuid) DO UPDATE SET active=true RETURNING id");
await pool.query("INSERT INTO pull_requests(repository_id,number,title,author,source_sha,destination_sha,state,draft,url) VALUES($1,7,'Comprobar autorización de recurso','Equipo Sancho','sim-source-7','sim-destination-7','OPEN',false,'#') ON CONFLICT(repository_id,number) DO NOTHING",[repo.rows[0].id]);
console.log('Datos sintéticos añadidos: Repositorio de ejemplo (simulado), PR #7. Sin conexión remota ni llamadas IA.'); await pool.end();
