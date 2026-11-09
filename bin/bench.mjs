#!/usr/bin/env node
import { runBenchmark } from '../lib/runner.mjs';
import { prepareAssets, listModels } from '../lib/assets.mjs';

const argv=process.argv.slice(2);
const usage=`Browser TTS Benchmark

  npm run bench -- models
  npm run assets -- fetch --model phonon
  npm run assets -- verify --model phonon
  npm run assets -- import --model phonon --source /path/to/asset-tree
  npm run bench -- run --model phonon --backend cpu --smoke
  npm run bench -- run --model paradee --backend webgpu --scenario warm --machine "M1 Pro"

Options: --model ID --backend cpu|webgpu --scenario warm|cold|cached|network|offline|switch
         --repetitions N --machine LABEL --chrome PATH --smoke --resources
         --accept-license --timeout-minutes N --predecessor ID --note TEXT

Warm defaults to one excluded full article plus five full scored articles.
Cold/cached/network default to three trials; offline/switch default to one.
--smoke is a short nonpublishable diagnostic. Network uses a shared 1 Mbps limiter.
Assets are staged separately. Inference cannot contact third-party services.
Results and optional audio stay in ignored runs/ until explicitly submitted.
`;
function options(args){const out={};const flags=new Set(['smoke','resources','accept-license']);const valued=new Set(['model','backend','scenario','repetitions','machine','chrome','source','timeout-minutes','predecessor','note']);for(let i=0;i<args.length;i++){const arg=args[i];if(!arg.startsWith('--'))throw new Error(`Unexpected argument: ${arg}`);const key=arg.slice(2);if(flags.has(key))out[key]=true;else if(valued.has(key)&&args[i+1]&&!args[i+1].startsWith('--'))out[key]=args[++i];else throw new Error(`Unknown option or missing value: ${arg}`);}return out;}
try{
 if(!argv.length||argv.includes('--help')||argv[0]==='help'){console.log(usage);}
 else if(argv[0]==='models')console.log(JSON.stringify(await listModels(),null,2));
 else if(argv[0]==='assets'){
  const mode=argv[1];if(!['fetch','verify','import'].includes(mode))throw new Error('Choose assets fetch, verify or import');
  const o=options(argv.slice(2));if(!o.model)throw new Error('--model is required');
  const receipt=await prepareAssets(o.model,{mode,source:o.source,acceptLicense:o['accept-license']===true});console.log(JSON.stringify(receipt,null,2));
 }else if(argv[0]==='run')console.log(JSON.stringify(await runBenchmark(options(argv.slice(1))),null,2));
 else throw new Error('Unknown command; use --help');
}catch(error){console.error(error.message);process.exitCode=1;}
