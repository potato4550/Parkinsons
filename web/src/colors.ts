import { Color } from 'three'
import type { Metric, RegionRecord } from './types'

const NEGATIVE = new Color('#2166ac')
const NEUTRAL = new Color('#f2efe5')
const POSITIVE = new Color('#b2182b')
const OBSERVED_LOW = new Color('#d9eee9')
const OBSERVED_HIGH = new Color('#006d77')
const NOT_SIGNIFICANT = new Color('#526068')
const SIGNIFICANT = new Color('#ffb000')
const SPATIAL_LOW = new Color('#e8e7ee')
const SPATIAL_HIGH = new Color('#54278f')
const NOT_MEASURED = new Color('#40494c')
const AGREEMENT_COLORS = {
  high_prediction_high_validation: new Color('#7b3294'),
  high_prediction_low_validation: new Color('#008837'),
  low_prediction_high_validation: new Color('#e66101'),
  low_prediction_low_validation: new Color('#9a9a9a'),
  not_measured: NOT_MEASURED,
}

export function colorForRegion(
  region: RegionRecord,
  metric: Metric,
  metadata: { zDomain: [number, number]; observedDomain: [number, number]; validationDomain: [number, number]; fdrThreshold: number },
  validationMode = false,
  overlay?: Map<number, number>,
) {
  if (validationMode) {
    return new Color().setHSL((region.region_id * 0.61803398875) % 1, 0.48, 0.61)
  }
  if (metric === 'anatomy') return NEUTRAL.clone()
  if (metric === 'pattern' || metric === 'scan_effect' || metric === 'upload') {
    const v = overlay?.get(region.region_id)
    if (v === undefined) return NOT_MEASURED.clone()
    return NEUTRAL.clone().lerp(metric === 'pattern' ? new Color('#d94801') : POSITIVE, Math.max(0, Math.min(1, v)))
  }
  if (metric === 'agreement') return AGREEMENT_COLORS[region.agreement_status].clone()
  if (metric === 'validation_score') {
    if (region.validation_score === null) return NOT_MEASURED.clone()
    const bound = Math.max(Math.abs(metadata.validationDomain[0]), Math.abs(metadata.validationDomain[1]))
    const t = Math.min(1, Math.abs(region.validation_score) / bound)
    return NEUTRAL.clone().lerp(region.validation_score < 0 ? NEGATIVE : POSITIVE, t)
  }
  if (metric === 'fdr_p') return (region.fdr_p < metadata.fdrThreshold ? SIGNIFICANT : NOT_SIGNIFICANT).clone()
  if (metric === 'spatial_robustness') return SPATIAL_LOW.clone().lerp(SPATIAL_HIGH, region.spatial_robustness)
  if (metric === 'observed_score') {
    const [low, high] = metadata.observedDomain
    const t = Math.max(0, Math.min(1, (region.observed_score - low) / (high - low)))
    return OBSERVED_LOW.clone().lerp(OBSERVED_HIGH, t)
  }
  const bound = Math.max(Math.abs(metadata.zDomain[0]), Math.abs(metadata.zDomain[1]))
  const t = Math.min(1, Math.abs(region.z_score) / bound)
  return NEUTRAL.clone().lerp(region.z_score < 0 ? NEGATIVE : POSITIVE, t)
}
