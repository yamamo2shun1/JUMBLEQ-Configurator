const FADER_CURVE_EXPONENT_MAX = 115.12925465;
const FADER_CURVE_LINEAR_EPSILON = 0.0001;

export function evaluateFaderCurve(cc: number, t: number) {
  const normalizedPosition = Math.max(0, Math.min(1, t));
  const amount = cc <= 64
    ? (cc - 64) / 64
    : (cc - 64) / 63;
  const magnitude = Math.abs(amount);

  if (magnitude <= FADER_CURVE_LINEAR_EPSILON) {
    return normalizedPosition;
  }

  const k = FADER_CURVE_EXPONENT_MAX * magnitude;
  const denominator = -Math.expm1(-k);
  const y = amount > 0
    ? -Math.expm1(-k * normalizedPosition) / denominator
    : 1 - (-Math.expm1(-k * (1 - normalizedPosition)) / denominator);

  return Math.max(0, Math.min(1, y));
}

export function createFaderCurvePath(
  cc: number,
  width: number,
  height: number,
  left: number,
  bottom: number,
  descending = false,
) {
  const segmentCount = Math.max(1, Math.ceil(width));

  return Array.from({ length: segmentCount + 1 }, (_, index) => {
    const t = index / segmentCount;
    const curvePosition = descending ? 1 - t : t;
    const x = left + (width * t);
    const y = bottom - (height * evaluateFaderCurve(cc, curvePosition));
    return `${index === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
  }).join(" ");
}
