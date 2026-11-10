// Read the stored ZIP/NumPy format of the pinned official Kitten voice archive.
// Reject compression, types or dimensions outside the reviewed artifact contract.
export function readVoiceNpz(buffer, name) {
  const bytes = new Uint8Array(buffer), view = new DataView(buffer);
  const decoder = new TextDecoder();
  for (let p = 0; p + 46 <= bytes.length; p++) {
    if (view.getUint32(p, true) !== 0x02014b50) continue;
    const nameLength = view.getUint16(p + 28, true), extra = view.getUint16(p + 30, true), comment = view.getUint16(p + 32, true);
    const filename = decoder.decode(bytes.subarray(p + 46, p + 46 + nameLength));
    if (filename === name + '.npy') {
      if (view.getUint16(p + 10, true) !== 0) throw new Error('Unsupported compressed voice archive');
      const size = view.getUint32(p + 24, true), offset = view.getUint32(p + 42, true);
      if (view.getUint32(offset, true) !== 0x04034b50) throw new Error('Invalid voice local header');
      const start = offset + 30 + view.getUint16(offset + 26, true) + view.getUint16(offset + 28, true);
      const npy = bytes.slice(start, start + size), nv = new DataView(npy.buffer);
      if (npy[0] !== 147 || decoder.decode(npy.subarray(1, 6)) !== 'NUMPY' || npy[6] !== 1) throw new Error('Unsupported NumPy format');
      const headerSize = nv.getUint16(8, true), header = decoder.decode(npy.subarray(10, 10 + headerSize));
      if (!header.includes("'descr': '<f4'") || !header.includes("'fortran_order': False")) throw new Error('Unsupported voice dtype/order');
      const shape = header.match(/'shape': \((\d+), (\d+)\)/);
      if (!shape || Number(shape[2]) !== 256) throw new Error('Invalid voice dimensions');
      const rows = Number(shape[1]);
      if (size !== 10 + headerSize + rows * 256 * 4) throw new Error('Invalid voice byte length');
      const data = new Float32Array(npy.buffer.slice(10 + headerSize));
      if (!data.every(Number.isFinite)) throw new Error('Nonfinite voice style');
      return { rows, data };
    }
    p += 45 + nameLength + extra + comment;
  }
  throw new Error('Voice not found: ' + name);
}
