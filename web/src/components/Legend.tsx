import type { Metric } from '../types'
import { formatValue } from '../format'

export function Legend({ scan, metric, zDomain, observedDomain, validationDomain, threshold, significant, spatialRobustRegions, mappedValidationRegions, validationMode }: {
  scan?: { n_control: number; n_patient: number; caveat: string; n_regions_fdr_below_0_05: number } | null
  metric: Metric
  zDomain: [number, number]
  observedDomain: [number, number]
  validationDomain: [number, number]
  threshold: number
  significant: number
  spatialRobustRegions: number
  mappedValidationRegions: number
  validationMode: boolean
}) {
  if (validationMode) return (
    <div className="legend" aria-label="Atlas validation legend">
      <strong>Atlas Region Validation</strong><span>Deterministic colors distinguish region IDs; they do not encode disease values.</span>
    </div>
  )
  if (metric === 'anatomy') return (
    <div className="legend" aria-label="Anatomy only legend">
      <strong>Anatomy only</strong><span>Folded fsaverage6 pial cortical surface. No research values or region colors are shown.</span>
    </div>
  )
  if (metric === 'pattern') return (
    <div className="legend" aria-label="Typical pattern legend">
      <strong>Typical disease pattern · illustrative</strong>
      <div className="legend-values"><span>Less involved</span><span>Most involved</span></div>
      <span>Hand-assigned from published staging (Braak &amp; Braak 1991; Braak 2003). Not measured data and not a scan result. Available for Parkinson and Alzheimer; gray otherwise.</span>
    </div>
  )
  if (metric === 'upload') return (
    <div className="legend" aria-label="Uploaded scan legend">
      <strong>Your uploaded scan</strong>
      <div className="legend-values"><span>Typical for controls</span><span>Much less grey matter</span></div>
      <span>Regions where this scan has less grey matter than the control group (up to 3 SD). Rough pipeline; gray means no upload yet.</span>
    </div>
  )
  if (metric === 'scan_effect') return (
    <div className="legend" aria-label="MRI group difference legend">
      <strong>Your MRI group difference</strong>
      {scan ? <><div className="legend-values"><span>No difference</span><span>Less grey matter in patients</span></div>
      <span>{scan.n_patient} patients vs {scan.n_control} controls; {scan.n_regions_fdr_below_0_05} regions pass FDR 0.05. Rough pipeline: {scan.caveat}</span></>
      : <span>No scan_group_effects.json found. Run scripts/scan_group_map.py on your scans and put the output in web/public/data/.</span>}
    </div>
  )
  if (metric === 'fdr_p') return (
    <div className="legend" aria-label="FDR significance legend">
      <strong>Statistical evidence</strong>
      <div className="binary-legend"><i className="sig" /> stronger evidence <i className="nonsig" /> limited evidence</div>
      <span>{significant} of 138 regions show strong statistical evidence.</span>
      <details><summary>Technical detail</summary><span>Adjusted p-value threshold: q &lt; {threshold}.</span></details>
    </div>
  )
  if (metric === 'spatial_robustness') return (
    <div className="legend" aria-label="Spatial robustness legend">
      <strong>Pattern robustness</strong>
      <div className="gradient-key spatial" />
      <div className="legend-values"><span>0</span><span>Spatial-null percentile</span><span>1</span></div>
      <span>{spatialRobustRegions} regions meet the project’s robustness rule.</span>
    </div>
  )
  if (metric === 'validation_score') return (
    <div className="legend" aria-label="Independent validation legend">
      <strong>Independent validation data</strong>
      <div className="gradient-key diverging" />
      <div className="legend-values"><span>{formatValue(validationDomain[0], 2)}</span><span>0</span><span>{formatValue(validationDomain[1], 2)}</span></div>
      <span>Higher values mean thinner cortex or smaller subcortical volume in PD. Gray: not measured ({mappedValidationRegions} AAL3 parcels mapped).</span>
    </div>
  )
  if (metric === 'agreement') return (
    <div className="legend" aria-label="Regional agreement legend">
      <strong>Agreement · median split</strong>
      <div className="agreement-legend"><i className="hh" /> high / high <i className="hl" /> high / low <i className="lh" /> low / high <i className="ll" /> low / low</div>
      <span>Descriptive categories only. Gray parcels were not measured.</span>
    </div>
  )
  const observed = metric === 'observed_score'
  const domain = observed ? observedDomain : zDomain
  return (
    <div className="legend" aria-label={`${observed ? 'Observed expression' : 'Z-score'} color legend`}>
      <strong>{observed ? 'Gene activity' : 'Brain signal'}</strong>
      <div className={`gradient-key ${observed ? 'sequential' : 'diverging'}`} />
      <div className="legend-values"><span>Lower signal</span>{!observed && <span>Expected</span>}<span>Higher signal</span></div>
      <span>{observed ? 'Lower to higher measured gene activity' : 'Regions with stronger signals appear more prominently.'}</span>
      <details><summary>Technical detail</summary><span>{observed ? `Measured score range: ${formatValue(domain[0], 2)} to ${formatValue(domain[1], 2)}.` : `Standardized enrichment range: ${formatValue(domain[0], 2)} to ${formatValue(domain[1], 2)}.`}</span></details>
    </div>
  )
}
