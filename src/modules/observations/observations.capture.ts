import type { ObservationCaptureSummary } from './observations.types.js';

// Stored capture metadata is trusted only in shape: anything missing or malformed becomes null,
// so older records stay readable.
export function summarizeCaptureMetadata(
  metadata: unknown,
): ObservationCaptureSummary | null {
  if (!isRecord(metadata)) return null;

  const device = isRecord(metadata.device) ? metadata.device : {};
  const parameters = isRecord(metadata.parameters) ? metadata.parameters : {};
  const summary: ObservationCaptureSummary = {
    deviceName:
      typeof device.name === 'string' && device.name ? device.name : null,
    iso: finiteNumber(parameters.iso),
    exposureTimeSeconds: finiteNumber(parameters.exposureTimeSeconds),
    exposureCompensationEv: finiteNumber(parameters.exposureCompensationEv),
    focusMode:
      typeof parameters.focusMode === 'string' ? parameters.focusMode : null,
    focusLensPosition: finiteNumber(parameters.focusLensPosition),
    whiteBalanceKelvin: finiteNumber(parameters.whiteBalanceKelvin),
  };

  return Object.values(summary).every((value) => value === null)
    ? null
    : summary;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function finiteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}
