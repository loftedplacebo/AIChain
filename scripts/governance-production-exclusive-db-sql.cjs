'use strict';
// Generates non-secret SQL for review; never connects to PostgreSQL.
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {render}=require('../deploy/governance/production-exclusive-db-sql.cjs');
const root=path.resolve(__dirname,'../build/governance/production-exclusive-db-sql');
if(process.argv.length!==2){process.stderr.write('Usage: node scripts/governance-production-exclusive-db-sql.cjs\n');process.exitCode=2;}
else{
 try{
  fs.mkdirSync(root,{recursive:true,mode:0o700});
  for(const [name,sql] of Object.entries(render())){
   const target=path.join(root,name);
   fs.writeFileSync(target,sql,{flag:'wx',mode:0o600});
   process.stdout.write(name+' sha256='+crypto.createHash('sha256').update(sql).digest('hex')+'\n');
  }
  process.stdout.write('Review SQL in '+root+'; no database change was made.\n');
 }catch(error){process.stderr.write('SQL preparation failed: '+error.message+'\n');process.exitCode=1;}
}
