import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {DatabaseSync,backup} from 'node:sqlite';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const source=path.join(process.env.SALON_DATA_DIR||path.resolve(root,'../../work/vinayak-data'),'salon.sqlite');
const target=process.argv[2];
if(!target){console.error('Usage: npm run backup -- /absolute/path/to/backup.sqlite');process.exit(1)}
if(!path.isAbsolute(target)||path.resolve(target)===path.resolve(source)||fs.existsSync(target)){console.error('Choose a new absolute backup path, different from the live database.');process.exit(1)}
fs.mkdirSync(path.dirname(target),{recursive:true});
const db=new DatabaseSync(source,{readOnly:true});
try{await backup(db,target);console.log('Database backup completed. Keep it private; it contains customer details.');}finally{db.close()}
