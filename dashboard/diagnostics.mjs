const dataUrl = './2026-11-multilingual/observations.json';
const format = new Intl.NumberFormat('en', {maximumFractionDigits: 2});

function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}

function timingCell(value, scale, kind) {
  const td = element('td');
  if (value === null) {
    td.append(element('span', 'Untimed', 'muted'));
    return td;
  }
  td.append(element('span', format.format(value) + ' s', 'duration'));
  const bar = element('span', undefined, 'bar-track');
  bar.setAttribute('aria-hidden', 'true');
  const fill = element('i', undefined, kind);
  fill.style.width = (100 * value / scale) + '%';
  bar.append(fill);
  td.append(bar);
  return td;
}

function group(section, rows, models) {
  const article = element('article', undefined, 'input-group');
  const title = element('h3', section.label);
  const cohort = rows[0].comparison || 'development';
  const titleId = 'input-' + rows[0].input + '-' + cohort;
  title.id = titleId;
  article.append(title, element('div', section.characters + ' characters · ' +
    ({matched:'Matched CPU and WebGPU runs',individual:'Individual measurement',development:'Development probes'}[cohort]), 'input-meta'));
  article.append(element('blockquote', section.text.trim()));
  if (rows[0].pairStatus) article.append(element('p',rows[0].pairStatus,'guide'));
  const wrapper = element('div', undefined, 'diagnostic-table-wrap');
  wrapper.tabIndex = 0;
  wrapper.setAttribute('role', 'region');
  wrapper.setAttribute('aria-labelledby', titleId);
  const table = element('table', undefined, 'diagnostic-table');
  table.setAttribute('aria-labelledby', titleId);
  const head = table.createTHead().insertRow();
  for (const label of ['Model', 'Execution', 'Warm-up', 'Generation', 'Playback']) {
    const th = element('th',label); th.scope = 'col'; head.append(th);
  }
  const body = table.createTBody();
  const scale = Math.max(1, ...rows.flatMap(r => [r.audioSeconds, r.generationSeconds ?? 0]));
  for (const r of rows) {
    const tr = body.insertRow();
    const th = element('th'); th.scope = 'row';
    const link = element('a', models[r.model].label);
    link.href = models[r.model].weights; th.append(link);
    const backend = r.effectiveBackend === 'webgpu+wasm' ? 'WebGPU + WASM'
      : r.effectiveBackend === 'webgpu' ? 'WebGPU'
      : r.requestedBackend === 'cpu' ? 'CPU / WASM' : 'WebGPU requested';
    tr.append(th, element('td', backend), element('td', r.warmupLabel),
      timingCell(r.generationSeconds, scale, 'generation'), timingCell(r.audioSeconds, scale, 'playback'));
  }
  wrapper.append(table);
  article.append(wrapper);
  const recordings = rows.filter(r => r.recording);
  if (recordings.length) {
    const players = element('div', undefined, 'diagnostic-players');
    for (const r of recordings) {
      const name = models[r.model].label + ' · ' + (r.requestedBackend === 'cpu' ? 'CPU' : 'WebGPU');
      const player = element('figure');
      player.append(element('figcaption',name));
      const audio = document.createElement('audio');
      audio.controls = true;
      audio.preload = 'none';
      audio.setAttribute('aria-label', name + ' reading the article opening');
      audio.src = './2026-11-multilingual/audio/' + encodeURIComponent(r.recording) + '.wav';
      const link = element('a','Run receipt');
      link.href = './2026-11-multilingual/receipts/' + encodeURIComponent(r.recording) + '.json';
      player.append(audio,link);
      players.append(player);
    }
    article.append(players);
    const attribution = element('a','Recording sources and voice attribution','audio-attribution');
    attribution.href = './2026-11-multilingual/audio.json';
    article.append(attribution);
  }
  const details = element('details');
  details.append(element('summary','Run details'));
  const ul = element('ul');
  for (const r of rows) {
    const backend = r.requestedBackend === 'cpu' ? 'CPU' : 'WebGPU';
    const threads = Number.isInteger(r.wasmThreads) ? ', ' + r.wasmThreads + ' WASM thread' + (r.wasmThreads === 1 ? '' : 's') : '';
    const notes = [models[r.model].label + ' · ' + backend + '.',
      models[r.model].runtime + threads + '.', models[r.model].precision + '.',
      format.format(r.audioFrames) + ' frames at ' + format.format(r.sampleRateHz) + ' Hz.'];
    if (r.capabilityProbeMethod) notes.push(r.capabilityProbeMethod);
    if (models[r.model].voice) notes.push(models[r.model].voice + '.');
    if (r.warmup === 'different-input') notes.push('Capability probe used “Hello, world.”');
    if (r.generationSeconds === null) notes.push('The probe captured the finished waveform only.');
    notes.push(r.sourceStatus + '.');
    ul.append(element('li', notes.join(' ')));
  }
  details.append(ul); article.append(details);
  return article;
}

async function render() {
  const response = await fetch(dataUrl);
  if (!response.ok) throw new Error('Diagnostics could not be loaded.');
  const {inputs, models, observations} = await response.json();
  const groups = document.querySelector('#groups');
  for (const [key, section] of Object.entries(inputs)) {
    const rows = observations.filter(row => row.input === key);
    const paired = rows.filter(row => row.comparison === 'matched');
    const individual = rows.filter(row => row.comparison === 'individual');
    const development = rows.filter(row => !row.recording);
    if (paired.length) groups.append(group(section, paired, models));
    if (individual.length) groups.append(group(section, individual, models));
    if (development.length) groups.append(group(section, development, models));
  }
  document.querySelector('#load-status').hidden = true;
}

render().catch(() => {
  document.querySelector('#load-status').textContent = 'The observations could not be loaded. Use the JSON download above.';
});
