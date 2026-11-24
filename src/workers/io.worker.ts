/**
 * Runs the expensive parts of loading and saving (JSON parse/stringify, migration,
 * validation) off the main thread so the UI stays responsive with large files.
 */
import { decodeDocument, encodeDocument, peekHeader } from '@/persistence/codec';
import type { IoRequest, IoResponse } from '@/persistence/io';

self.onmessage = (event: MessageEvent<IoRequest>) => {
  const req = event.data;
  let res: IoResponse;
  const transfer: Transferable[] = [];
  try {
    switch (req.type) {
      case 'decode':
        res = { id: req.id, ok: true, result: decodeDocument(req.bytes) };
        break;
      case 'encode': {
        const bytes = encodeDocument(req.model);
        transfer.push(bytes.buffer);
        res = { id: req.id, ok: true, result: bytes };
        break;
      }
      case 'peekHeader':
        res = { id: req.id, ok: true, result: peekHeader(req.bytes) };
        break;
    }
  } catch (err) {
    res = { id: req.id, ok: false, message: err instanceof Error ? err.message : String(err) };
  }
  try {
    (self as unknown as Worker).postMessage(res, transfer);
  } catch (err) {
    // Never leave the caller waiting: report results that can't be sent.
    (self as unknown as Worker).postMessage({
      id: req.id,
      ok: false,
      message: `Couldn’t return the result: ${err instanceof Error ? err.message : String(err)}`,
    } satisfies IoResponse);
  }
};
