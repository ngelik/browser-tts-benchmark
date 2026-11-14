// Counts describe the pinned model/catalog, not the voices exercised by a run.
export function validateSupport(s) {
  const allowed=['voiceCount','bundledVoiceCount','languageCount','languages','scope','sources','notes'];
  if(!s||typeof s!=='object'||Array.isArray(s)||Object.keys(s).some(k=>!allowed.includes(k)))throw new Error('Invalid model support metadata');
  for (const key of ['voiceCount', 'bundledVoiceCount', 'languageCount']) {
    const minimum = key === 'bundledVoiceCount' ? 0 : 1;
    if (s[key] !== null && (!Number.isSafeInteger(s[key]) || s[key] < minimum)) {
      throw new Error('Invalid support ' + key);
    }
  }
  if(s.voiceCount!==null&&s.bundledVoiceCount!==null&&s.bundledVoiceCount>s.voiceCount)throw new Error('Bundled voices exceed supported voices');
  if(s.languageCount===null){if(s.languages!==null)throw new Error('Unknown language count requires null language list');}
  else if(!Array.isArray(s.languages)||s.languages.length!==s.languageCount||new Set(s.languages).size!==s.languages.length||s.languages.some(l=>!/^([a-z]{2,3})(-[A-Za-z0-9]{2,8})*$/.test(l)))throw new Error('Language list/count mismatch');
  for(const k of ['scope','notes'])if(typeof s[k]!=='string'||!s[k].trim()||s[k].length>2000)throw new Error('Invalid support '+k);
  if(!Array.isArray(s.sources)||!s.sources.length||s.sources.some(u=>{try{const parsed=new URL(u);return typeof u!=='string'||parsed.protocol!=='https:'||!!parsed.username||!!parsed.password||/[\s<>\[\]\\]/.test(u);}catch{return true;}}))throw new Error('Model support requires HTTPS primary sources');
  return s;
}
