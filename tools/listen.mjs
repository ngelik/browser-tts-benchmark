import {startServer} from '../lib/server.mjs';
const server=await startServer(process.cwd());
console.log('Listening room: '+server.url+'audio/index.html');
for(const signal of ['SIGINT','SIGTERM'])process.once(signal,async()=>{await server.close();process.exit(0);});
