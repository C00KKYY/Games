/** Audio thresholds from Brief §8.3 / §8.4 / §12.8 – single source for build, measure and the unit test. */
export const T = {
  sfxKbps: 64,
  /** "~64 kbps": accepted measured range for CBR 64k incl. container overhead */
  sfxKbpsRange: [56, 72] as const,
  loopKbpsRange: [64, 80] as const,
  /** 72 kbps is not a valid MPEG-1 Layer III bitrate (LAME would fall back to 64); 64 keeps 90 s loops < 0.9 MB */
  musicKbps: 64,
  ambKbps: 64,
  sfxPeakDb: -3,
  sfxPeakTol: 1,
  /** every SFX RMS within ±3 dB of the SFX median */
  sfxRmsTol: 3,
  loopLufs: -20,
  loopLufsTol: 2,
  /** build target inside the window: slightly below −20 so the SFX can sit 6–10 dB above the music without heavy limiting */
  loopLufsTarget: -21,
  /** SFX RMS (median) 6–10 dB above music RMS (median) */
  sfxOverMusic: [6, 10] as const,
  musicMaxBytes: 900_000,
  initialMaxBytes: 250_000,
  initialMaxCount: 12,
  /** loop-point click test: RMS jump across the seam */
  seamMaxJumpDb: 6,
  /** analysis window for the seam test (each side) */
  seamWindowMs: 20,
  /** whole shipped build budget (Brief §9.x) */
  buildMaxBytes: 8_000_000,
};
