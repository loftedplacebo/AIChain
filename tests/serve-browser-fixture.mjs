import {createServer} from 'vite';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const website=fileURLToPath(new URL('..',import.meta.url));
const server=await createServer({configFile:false,root:path.join(website,'tests/browser-fixture'),plugins:[{name:'synthetic-auth-navigation',configureServer(server){server.middlewares.use((req,res,next)=>{if(req.url?.startsWith('/api/auth/start')){res.setHeader('content-type','text/html');res.setHeader('cache-control','no-store');res.end('<h1>Simulated active sign-in</h1><p>This fixture does not connect to WorkOS or authenticate a user.</p><a href="/?reauthenticated=1">Return to workspace (simulation)</a>');return;}next();});}}],server:{host:'127.0.0.1',port:3013,strictPort:true,fs:{allow:[website],deny:['**/.env*','**/.dev.vars','**/*.key','**/*.sqlite*','**/.git/**','**/build/**']}},esbuild:{jsx:'automatic'}});
await server.listen();console.log('Synthetic browser fixture: http://127.0.0.1:3013/');
let stopping=false;const stop=async()=>{if(stopping)return;stopping=true;await server.close();process.exitCode=0;};process.once('SIGINT',stop);process.once('SIGTERM',stop);
