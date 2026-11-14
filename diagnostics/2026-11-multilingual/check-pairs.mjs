import assert from 'node:assert/strict';

export function verifyPairs(receipts) {
  const byModel = new Map();
  for (const receipt of receipts) {
    const pair = byModel.get(receipt.model) ?? new Map();
    assert.ok(!pair.has(receipt.backend), 'Duplicate backend in paired diagnostics');
    pair.set(receipt.backend, receipt);
    byModel.set(receipt.model, pair);
  }
  for (const [id, rows] of byModel.entries()) {
    const cpu = rows.get('cpu');
    const gpu = rows.get('webgpu');
    assert.ok(cpu && gpu, id + ' requires a clean CPU and WebGPU observation');
    for (const key of ['source','modelRevision','fixtureSha256','sourceSha256','chunkId','start','end','chrome','os','arch','cpu','cores','ramBytes']) {
      assert.equal(cpu[key], gpu[key], id + ' differs in ' + key);
    }
    assert.equal(cpu.configuration.voice,gpu.configuration.voice,id + ' differs in voice');
    assert.equal(cpu.configuration.precision,gpu.configuration.precision,id + ' differs in precision');
    const synthesisSettings = receipt => {
      const {executionProviders, ...settings} = receipt.configuration.settings;
      return settings;
    };
    assert.deepEqual(synthesisSettings(cpu), synthesisSettings(gpu), id + ' differs in synthesis settings');
    assert.equal(cpu.measured.sampleRate, gpu.measured.sampleRate, id + ' differs in sample rate');
  }
}
