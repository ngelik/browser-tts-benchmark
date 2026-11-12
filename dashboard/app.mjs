const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt = (value, digits = 2) => Number.isFinite(value) ? value.toLocaleString('en-US', {minimumFractionDigits: digits, maximumFractionDigits: digits}) : '—';
const repo = 'https://github.com/ngelik/tts-bench';
const labels = {cpu: 'CPU', webgpu: 'GPU'};
const shortLicense = value => value.startsWith('Model license not separately') ? 'Unspecified · terms ↗' : value.startsWith('OpenRAIL-M') ? 'OpenRAIL-M ↗' : value.startsWith('Underdog Non-Commercial') ? 'Underdog NC 1.0 ↗' : value;
const chromeVersion = metric => (metric?.environment?.chromeVersion ?? 'unknown').replace(/^Google Chrome\s+/, '');
const state = {data: null, view: 'table', metric: 'generation', sort: 'cpu', direction: 1, playing: null, cohorts: new Map()};
const audio = $('#sample-audio');
const dialog = $('#details');
let playRequest = 0;
const statusLabel = metric => metric?.status === 'measured' ? 'Measured' : metric?.status === 'unsupported' ? 'Unsupported' : metric?.status === 'error' ? 'Run failed' : 'Unavailable';
const isMeasured = metric => metric?.status === 'measured';
const historical = model => ['cpu', 'webgpu'].some(b => model.warm[b]?.origin === 'historical-import');
const cohortName = metric => state.cohorts.get(metric?.cohortKey)?.label ?? (metric?.origin === 'historical-import' ? 'Historical' : 'Unavailable');
const metricValue = (model, key) => ({name: model.name, modelMB: model.modelMB, cpu: model.warm.cpu?.medianSeconds, webgpu: model.warm.webgpu?.medianSeconds, cpuMemory: model.memory.cpu?.meanMB, gpuMemory: model.memory.webgpu?.meanMB})[key];
function outputWarningTag(model) {
  const scored = ['cpu', 'webgpu'].flatMap(backend => model.warm[backend]?.outputNotes?.scored ? [[backend, model.warm[backend].outputNotes.scored.text]] : []);
  const warmup = ['cpu', 'webgpu'].flatMap(backend => model.warm[backend]?.outputNotes?.warmup ? [[backend, model.warm[backend].outputNotes.warmup.text]] : []);
  const button = (className, label, rows, prefix) => {
    if (!rows.length) return '';
    const detail = rows.map(([backend, text]) => `${labels[backend]}: ${text}`).join(' ');
    return `<button type="button" class="evidence-tag ${className}" data-detail="${escape(model.id)}" aria-label="${escape(`${prefix}. ${detail}`)}" title="${escape(detail)}">${label}</button>`;
  };
  return button('output-warning', 'Check audio', scored, 'Check audio') + button('output-warmup', 'Warm-up note', warmup, 'Excluded warm-up note');
}
const compareValues = (a, b, av, bv, direction = 1) => {
  if (av == null && bv == null) return a.name.localeCompare(b.name);
  if (av == null) return 1;
  if (bv == null) return -1;
  return (typeof av === 'string' ? av.localeCompare(bv) : av - bv) * direction || a.name.localeCompare(b.name);
};
const compare = (a, b) => compareValues(a, b, metricValue(a, state.sort), metricValue(b, state.sort), state.direction);
function visibleModels() {
  const term = $('#search').value.trim().toLowerCase(), cohort = $('#cohort').value, license = $('#license').value;
  return state.data.models.filter(model => (!term || `${model.name} ${model.id}`.toLowerCase().includes(term)) && (license === 'all' || model.license.model === license) && (cohort === 'all' || (cohort === 'paired' && model.pairedWarm) || (cohort === 'historical' && historical(model)) || ['cpu', 'webgpu'].some(b => model.warm[b]?.cohortKey === cohort))).sort(compare);
}
function exampleFor(model, backend) {
  return model.preferredAudio[backend] ?? model.audio.filter(a => a.backend === backend).sort((a, b) => (b.sourceCreatedAt ?? '').localeCompare(a.sourceCreatedAt ?? ''))[0] ?? null;
}
function audioButtons(model) {
  return `<div class="audio-buttons">${['cpu', 'webgpu'].map(backend => {
    const sample = exampleFor(model, backend);
    return sample ? `<button class="listen-button" data-play="${escape(model.id)}" data-backend="${backend}" aria-label="Play ${escape(model.name)} ${labels[backend]} audio example" aria-pressed="${state.playing?.clip.path === sample.clip.path && !audio.paused}"><span class="play-symbol" aria-hidden="true">▶</span> ${labels[backend]}</button>` : `<span class="metric-unavailable" title="No published ${labels[backend]} recording">${labels[backend]} —</span>`;
  }).join('')}</div>`;
}
function metricCell(metric, key, max, backend, label, withBar = true) {
  const value = metric?.[key];
  return `<td data-label="${label}">${Number.isFinite(value) ? `<a class="value metric-link" href="${escape(metric.reportUrl)}" title="Open ${escape(label)} receipt · ${escape(cohortName(metric))}">${fmt(value)}</a>${withBar ? `<div class="mini-track ${backend === 'webgpu' ? 'gpu' : ''}" aria-hidden="true"><span style="width:${max > 0 ? value / max * 100 : 0}%"></span></div>` : ''}` : `<span class="metric-unavailable" title="${escape(metric?.reason || 'No published measurement for this path')}">${statusLabel(metric)}</span>`}</td>`;
}
function renderTable(models) {
  const maxTime = Math.max(1, ...models.flatMap(m => ['cpu', 'webgpu'].map(b => m.warm[b]?.medianSeconds ?? 0)));
  $('#model-rows').innerHTML = models.map(model => `<tr data-model="${escape(model.id)}"><td data-label="Model"><div class="model-cell"><span class="model-monogram" aria-hidden="true">${escape(model.name.slice(0, 2).toUpperCase())}</span><div><button class="model-name" data-detail="${escape(model.id)}">${escape(model.name)}</button><div class="model-sub"><span>${fmt(model.support.voiceCount, 0)} ${model.support.voiceCount === 1 ? 'voice' : 'voices'} · ${fmt(model.support.languageCount, 0)} ${model.support.languageCount === 1 ? 'language' : 'languages'}</span><span class="evidence-tag ${historical(model) ? 'historical' : ''}" title="${model.pairedWarm ? 'Native CPU/GPU pair with compatible protocol, source, assets, settings and environment' : historical(model) ? 'Imported historical results; CPU and GPU use different timing protocols' : 'See details for execution support and provenance'}">${model.pairedWarm ? 'Matched pair' : historical(model) ? 'Historical' : 'See evidence'}</span>${outputWarningTag(model)}</div></div></div></td><td data-label="Weights · MB"><span class="value">${fmt(model.modelMB)}</span></td><td data-label="Model license"><button class="license-tag" data-detail="${escape(model.id)}" title="${escape(model.license.model)}" aria-label="License details: ${escape(model.name)}">${escape(shortLicense(model.license.model))}</button></td>${metricCell(model.warm.cpu, 'medianSeconds', maxTime, 'cpu', 'CPU · seconds')}${metricCell(model.warm.webgpu, 'medianSeconds', maxTime, 'webgpu', 'GPU · seconds')}${metricCell(model.memory.cpu, 'meanMB', 1, 'cpu', 'Chrome RAM · CPU · avg MB', false)}${metricCell(model.memory.webgpu, 'meanMB', 1, 'webgpu', 'Chrome RAM · GPU · avg MB', false)}<td data-label="Listen · 30s">${audioButtons(model)}</td></tr>`).join('');
  $$('th[data-column]').forEach(th => {
    const active = th.dataset.column === state.sort;
    if (active) th.setAttribute('aria-sort', state.direction === 1 ? 'ascending' : 'descending'); else th.removeAttribute('aria-sort');
    th.querySelector('button > span').textContent = active ? state.direction === 1 ? '↑' : '↓' : '↕';
  });
}
function renderCharts(models) {
  const kind = state.metric, key = kind === 'generation' ? 'medianSeconds' : 'meanMB';
  const backends = kind === 'size' ? ['size'] : ['cpu', 'webgpu'];
  const get = (model, backend) => backend === 'size' ? model.modelMB : model[kind === 'generation' ? 'warm' : 'memory'][backend]?.[key];
  const max = Math.max(1, ...models.flatMap(m => backends.map(b => get(m, b) ?? 0)));
  const units = kind === 'generation' ? 'seconds' : 'MB';
  $('#charts').classList.toggle('single', kind === 'size');
  $('#charts').innerHTML = backends.map(backend => `<section class="chart-panel ${backend === 'webgpu' ? 'gpu' : backend}" aria-label="${backend === 'size' ? 'Model size' : labels[backend]} chart"><h3>${backend === 'size' ? 'Model weights' : `<i class="key ${backend === 'cpu' ? 'cpu' : 'gpu'}"></i>${labels[backend]} / ${backend === 'cpu' ? 'WebAssembly' : 'WebGPU'}`}</h3><p class="small">${kind === 'generation' ? 'Median full-article generation · seconds' : kind === 'memory' ? 'Average Chrome process RSS · MB' : 'Verified core model weights · MB'}</p>${[...models].sort((a, b) => compareValues(a, b, get(a, backend), get(b, backend))).map(model => {
    const value = get(model, backend), missing = !Number.isFinite(value);
    const metric = kind === 'size' ? null : model[kind === 'generation' ? 'warm' : 'memory'][backend];
    return `<div class="bar-row ${missing ? 'unavailable' : ''}"><div class="bar-label"><button data-detail="${escape(model.id)}">${escape(model.name)}</button><span class="value">${missing ? statusLabel(metric) : `${fmt(value)} <span class="sr-only">${units}</span>`}</span></div>${missing ? '' : `<div class="bar-track" aria-hidden="true"><div class="bar-fill" style="width:${value / max * 100}%"></div></div>`}</div>`;
  }).join('')}<p class="chart-foot">${kind === 'size' ? 'Excludes runtime and voice assets.' : 'Shared scale across CPU and GPU. Open a model for source and sample count.'}</p></section>`).join('');
}
function render() {
  if (!state.data) return;
  const models = visibleModels();
  $('#visible-count').textContent = `${models.length} of ${state.data.models.length} configurations`;
  $('#table-view').hidden = state.view !== 'table' || models.length === 0;
  $('#charts-view').hidden = state.view !== 'charts' || models.length === 0;
  $('.sort-field').hidden = state.view !== 'table';
  $('#no-results').hidden = models.length > 0;
  const cohort = $('#cohort').value;
  $('#scope-note').textContent = cohort === 'all' || cohort === 'historical' ? 'Warm generation medians. Lower is better. Different source and Chrome cohorts are shown together; open a model for its exact test conditions.' : cohort === 'paired' ? 'CPU and GPU are compatible within each model’s native pair. Different pairs can still use different source and Chrome cohorts. RAM comes from separate diagnostics.' : 'Models with warm evidence in the selected source / environment cohort. Each backend and memory diagnostic retains its own source in model details.';
  renderTable(models); renderCharts(models);
}
function reset() { $('#search').value = ''; $('#cohort').value = 'all'; $('#license').value = 'all'; state.sort = 'cpu'; state.direction = 1; $('#sort-select').value = 'cpu'; render(); }
function provenance(metric) {
  if (!metric?.resultId) return '<p class="provenance">No published result for this path.</p>';
  const env = metric.environment;
  return `<p class="provenance"><a href="${escape(metric.reportUrl)}">Open full result receipt ↗</a><br>${escape(metric.origin)} · ${escape(metric.protocolId)}<br>${escape(env?.machineLabel ?? '')}<br>Chrome ${escape(chromeVersion(metric))} · ${escape(env?.os ?? '')}<br>${metric.sourceCommit ? `<a href="${repo}/commit/${escape(metric.sourceCommit)}">Source ${escape(metric.sourceCommit.slice(0, 8))}</a>` : 'Historical source'} · ${escape(metric.createdAt?.slice(0, 10))} UTC</p>`;
}
function outputNoteDetails(metric) {
  const notes = metric?.outputNotes;
  if (!notes) return '';
  return `${notes.scored ? `<p class="detail-note output-warning-text"><strong>Check audio:</strong> ${escape(notes.scored.text)}</p>` : ''}${notes.warmup ? `<p class="detail-note output-warmup-text"><strong>Excluded warm-up:</strong> ${escape(notes.warmup.text)}</p>` : ''}<p class="detail-note output-archive-note">Warm-up audio is not archived. Published clips come from the scored trial listed by <code>trialIndex</code> in <code>audio/manifest.json</code>; the clip may not match the receipt or trial with the shortest source chunk.</p>`;
}
function detailMetric(metric, backend, kind) {
  const warm = kind === 'warm';
  return `<section class="detail-card"><h4><i class="key ${backend === 'cpu' ? 'cpu' : 'gpu'}"></i> ${labels[backend]} ${warm ? 'warm generation' : 'memory diagnostic'}</h4>${isMeasured(metric) ? `<dl>${warm ? `<dt>Median</dt><dd>${fmt(metric.medianSeconds)} s</dd><dt>Observed min–max</dt><dd>${fmt(metric.minSeconds)}–${fmt(metric.maxSeconds)} s</dd><dt>Scored articles</dt><dd>${fmt(metric.n, 0)}</dd><dt>First PCM (median)</dt><dd>${fmt(metric.firstPcmMs)} ms</dd><dt>Real-time factor</dt><dd>${fmt(metric.rtf, 3)}</dd><dt>Audio length (median)</dt><dd>${fmt(metric.audioSeconds)} s</dd>` : `<dt>Generation mean</dt><dd>${fmt(metric.meanMB)} MB</dd><dt>Sampled generation peak</dt><dd>${fmt(metric.peakMB)} MB</dd><dt>Diagnostic articles</dt><dd>${fmt(metric.n, 0)}</dd><dt>Generation samples</dt><dd>${fmt(metric.sampleCount, 0)}</dd>`}</dl>` : `<p class="detail-note">${statusLabel(metric)}. ${escape(metric?.reason ?? '')}</p>`}${warm ? outputNoteDetails(metric) : ''}${provenance(metric)}</section>`;
}
function openDetails(id) {
  const model = state.data.models.find(m => m.id === id); if (!model) return;
  const samples = ['cpu', 'webgpu'].map(b => exampleFor(model, b)).filter(Boolean);
  $('#detail-content').innerHTML = `<h2 id="detail-title">${escape(model.name)}</h2><p class="detail-subtitle">${model.pairedWarm ? 'Matched native CPU / GPU pair' : historical(model) ? 'Historical warm evidence · distinct CPU / GPU timing protocols' : 'Backend availability retained in the evidence'}</p><div class="detail-stats"><div class="detail-stat"><strong>${fmt(model.modelMB)}</strong><span>MB · core weights</span></div><div class="detail-stat"><strong>${fmt(model.support.voiceCount, 0)}</strong><span>supported voices</span></div><div class="detail-stat"><strong>${fmt(model.support.languageCount, 0)}</strong><span>supported languages</span></div></div><p class="detail-note">${escape(model.support.scope)}. ${escape(model.support.notes)} English and one selected voice are benchmarked.</p><h3>Warm generation · 20,000 characters</h3><div class="detail-grid">${['cpu', 'webgpu'].map(b => detailMetric(model.warm[b], b, 'warm')).join('')}</div><p class="detail-note">First PCM measures generated audio availability, not audible playback. Real-time factor = generation time / audio duration; lower is faster. Exact voice, precision, settings, warm-up and power conditions are recorded in each receipt.</p><h3>Average memory · separate resource diagnostics</h3><div class="detail-grid">${['cpu', 'webgpu'].map(b => detailMetric(model.memory[b], b, 'memory')).join('')}</div><p class="detail-note">One isolated Chrome instance with one benchmark tab, sampled during generation. Process RSS includes workers and browser baseline; shared pages may be counted more than once. Mean RAM is not a minimum hardware requirement. Sampled peaks can miss brief spikes. These diagnostics have their own source and timing.</p><h3>Licenses</h3><dl class="detail-license"><dt>Model weights</dt><dd>${escape(model.license.model)}</dd><dt>Runtime / code</dt><dd>${escape(model.license.code ?? 'Not specified in the pinned catalog')}</dd></dl><p class="detail-note">The model license does not cover every component or determine output rights. See the upstream terms and <a href="${repo}/blob/main/docs/LICENSING.md">license inventory</a>.</p><h3>Audio examples</h3><ul class="recording-list">${samples.map(a => `<li><button class="listen-button" data-play="${escape(model.id)}" data-backend="${a.backend}">▶ ${labels[a.backend]} · ${fmt(a.clip.seconds, 0)} seconds</button><p>${escape(a.voice)} · ${escape(a.language)} · ${escape(a.scenario)} recording${a.matchesSelectedWarm ? ' · matches the selected warm receipt' : ' · example from a separate receipt'}</p><p>${escape(a.attribution ?? '')}</p><p>Model terms: ${escape(a.modelTerms ?? model.license.model)}</p><a href="${escape(a.full.url)}">Full WAV ↗</a><a href="${escape(a.reportUrl)}">Recording receipt ↗</a></li>`).join('') || '<li>No published recording.</li>'}</ul><div class="detail-bottom">${model.sourceUrl ? `<a href="${escape(model.sourceUrl)}">Model source ↗</a>` : ''}<a href="?model=${encodeURIComponent(model.id)}">Link to this model ↗</a><a href="./audio/">Browse all recordings ↗</a></div>`;
  if (!dialog.open) dialog.showModal();
  dialog.scrollTop = 0;
}
function updatePlaybackButtons() {
  $$('[data-play]').forEach(button => {
    const m = state.data.models.find(m => m.id === button.dataset.play);
    const selected = exampleFor(m, button.dataset.backend)?.clip.path === state.playing?.clip.path;
    button.setAttribute('aria-pressed', String(selected && !audio.paused));
  });
}
async function play(id, backend) {
  const model = state.data.models.find(m => m.id === id), sample = exampleFor(model, backend); if (!sample) return;
  const request = ++playRequest;
  const same = state.playing?.clip.path === sample.clip.path;
  $('#player').hidden = false; document.body.classList.add('has-player'); $('#player-error').hidden = true;
  if (same && !audio.paused) { audio.pause(); return; }
  state.playing = sample;
  if (!same) { audio.src = new URL(sample.clip.path, document.baseURI).href; }
  $('#player-title').textContent = `${model.name} · ${labels[backend]}`;
  $('#player-tag').textContent = `${sample.clip.seconds}-SECOND AUDIO EXAMPLE`;
  $('#player-caption').textContent = `${sample.voice} · ${sample.matchesSelectedWarm ? 'selected warm receipt' : `${sample.scenario} recording · separate receipt`}`;
  $('#player-full').href = sample.full.url; $('#player-receipt').href = sample.reportUrl;
  $('#player-details').dataset.detail = model.id;
  try { await audio.play(); } catch { if (request === playRequest) $('#player-error').hidden = false; }
  if (request === playRequest) updatePlaybackButtons();
}
for (const event of ['play', 'pause', 'ended']) audio.addEventListener(event, updatePlaybackButtons);
audio.addEventListener('error', () => { $('#player-error').hidden = false; });
$('#close-player').addEventListener('click', () => { const previous = state.playing; ++playRequest; audio.pause(); audio.removeAttribute('src'); audio.load(); state.playing = null; $('#player').hidden = true; document.body.classList.remove('has-player'); updatePlaybackButtons(); const button = $$('[data-play]').find(b => b.dataset.play === previous?.model && b.dataset.backend === previous?.backend && b.getClientRects().length); button?.focus(); });
$('#close-details').addEventListener('click', () => dialog.close());
dialog.addEventListener('click', event => { if (event.target === dialog) { const box = dialog.getBoundingClientRect(); if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) dialog.close(); } });
document.addEventListener('click', event => {
  const detail = event.target.closest('[data-detail]'); if (detail) openDetails(detail.dataset.detail);
  const playButton = event.target.closest('[data-play]'); if (playButton) play(playButton.dataset.play, playButton.dataset.backend);
  const view = event.target.closest('[data-view]'); if (view) { state.view = view.dataset.view; $$('[data-view]').forEach(b => b.setAttribute('aria-pressed', String(b === view))); render(); }
  const metric = event.target.closest('[data-metric]'); if (metric) { state.metric = metric.dataset.metric; $$('[data-metric]').forEach(b => b.setAttribute('aria-pressed', String(b === metric))); render(); }
  const sort = event.target.closest('[data-sort]'); if (sort) { state.direction = state.sort === sort.dataset.sort ? -state.direction : 1; state.sort = sort.dataset.sort; $('#sort-select').value = state.sort; render(); }
});
$('#search').addEventListener('input', render);
$('#cohort').addEventListener('change', render);
$('#license').addEventListener('change', render);
$('#sort-select').addEventListener('change', () => {state.sort = $('#sort-select').value; state.direction = 1; render();});
$('#reset').addEventListener('click', reset);
$('#clear-filters').addEventListener('click', reset);
try {
  const response = await fetch('./assets/data.json'); if (!response.ok) throw new Error(`Data HTTP ${response.status}`);
  state.data = await response.json();
  if (state.data.schemaVersion !== 1 || !state.data.models.length) throw new Error('Unsupported dashboard data');
  const cohorts = [...new Map(state.data.models.flatMap(m => ['cpu', 'webgpu'].map(b => m.warm[b])).filter(m => m?.origin === 'native' && m.cohortKey).map(m => [m.cohortKey, m])).entries()].sort((a, b) => a[1].createdAt.localeCompare(b[1].createdAt));
  cohorts.forEach(([key, metric], index) => {
    const label = `C${index + 1} · ${metric.sourceCommit.slice(0, 8)} · Chrome ${chromeVersion(metric)}`;
    state.cohorts.set(key, {label, metric});
    const option = document.createElement('option'); option.value = key; option.textContent = label; $('#cohort').append(option);
  });
  for (const license of [...new Set(state.data.models.map(m => m.license.model))].sort()) { const option = document.createElement('option'); option.value = license; option.textContent = license; $('#license').append(option); }
  $('#model-count').textContent = state.data.models.length;
  $('#recording-count').textContent = state.data.models.reduce((sum, m) => sum + m.audio.length, 0);
  $('#updated').textContent = `Latest receipt ${state.data.updatedAt.slice(0, 10)} UTC`;
  const params = new URL(location.href).searchParams;
  $('#search').value = params.get('q') ?? '';
  if (['table', 'charts'].includes(params.get('view'))) state.view = params.get('view');
  if (['generation', 'memory', 'size'].includes(params.get('metric'))) state.metric = params.get('metric');
  $$('[data-view]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.view === state.view)));
  $$('[data-metric]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.metric === state.metric)));
  render();
  const requestedModel = params.get('model'); if (requestedModel) openDetails(requestedModel);
} catch (error) { $('#load-error').hidden = false; $('#table-view').hidden = true; $('#updated').textContent = 'Results unavailable'; console.error('Dashboard failed:', error); }
