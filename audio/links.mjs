export const LISTENING_URL='https://ngelik.github.io/browser-tts-benchmark/audio/';
export function recordingUrl(entry, base=LISTENING_URL){
 const url=new URL(base);url.searchParams.set('sample',entry.clip.path.split('/').at(-1));return url.href;
}
