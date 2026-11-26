const SAMPLES = 3;
const SAMPLE_TIMEOUT_MS = 3000;

let offsetMs = 0;

export function serverNow() {
  return Date.now() + offsetMs;
}

export async function syncClock(socket) {
  let best = null;
  for (let i = 0; i < SAMPLES; i += 1) {
    const sentAt = Date.now();
    try {
      const { serverNow: remoteNow } = await socket
        .timeout(SAMPLE_TIMEOUT_MS)
        .emitWithAck('time:sync', {});
      const receivedAt = Date.now();
      const roundTrip = receivedAt - sentAt;
      const offset = remoteNow + roundTrip / 2 - receivedAt;
      if (!best || roundTrip < best.roundTrip) best = { roundTrip, offset };
    } catch {
      break;
    }
  }
  if (best) offsetMs = best.offset;
}
