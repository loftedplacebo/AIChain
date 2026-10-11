'use strict';
// Root-only operator binding for synthetic pilot inventory checks.
const fs=require('node:fs');
const {connectionOptions}=require('../services/governance/postgres-connection.cjs');
const FILE='/etc/aichain/pilot-database-binding.json';
const MANAGED='orvessian-pilot-test-do-user-45565720-0.k.db.ondigitalocean.com';
const CA='/etc/aichain/governance/digitalocean-ca.crt';
function protectedText(file,max){
 const st=fs.lstatSync(file);
 if(!st.isFile()||st.isSymbolicLink()||st.uid!==0||(st.mode&0o077)||st.size<1||st.size>max)throw Error('Protected pilot database binding required');
 return fs.readFileSync(file,'utf8').replace(/\r?\n$/,'');
}
function administrator(){
 if(process.getuid?.()!==0)throw Error('Root pilot operator required');
 const binding=JSON.parse(protectedText(FILE,2048));
 if(!binding||Array.isArray(binding)||Object.keys(binding).sort().join(',')!=='caFile,database,host,passwordFile,port,profile,sslmode,user')throw Error('Exact pilot database binding required');
 const managed=binding.profile==='managed'&&binding.host===MANAGED&&binding.port===25060&&binding.database==='governance_test'&&binding.user==='doadmin'&&binding.sslmode==='verify-full'&&binding.caFile===CA&&binding.passwordFile==='/etc/aichain/pilot-backup/database-password';
 const local=binding.profile==='contabo-local'&&binding.host==='127.0.0.1'&&binding.port===5433&&binding.database==='governance_test'&&binding.user==='postgres'&&binding.sslmode==='disable'&&binding.caFile===null&&binding.passwordFile==='/var/lib/aichain-pilot-db-migration/local-postgres-password';
 if(!managed&&!local)throw Error('Unreviewed pilot database binding');
 const password=protectedText(binding.passwordFile,1025);
 if(!password||/[\r\n]/.test(password))throw Error('Invalid pilot administrator password');
 const url=new URL('postgresql://localhost');url.hostname=binding.host;url.port=String(binding.port);url.username=binding.user;url.password=password;url.pathname='/'+binding.database;url.searchParams.set('sslmode',binding.sslmode);
 return connectionOptions(url.toString(),{caFile:managed?CA:undefined});
}
module.exports={administrator};
