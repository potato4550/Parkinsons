import { useState } from 'react'
import { formatValue } from '../format'
import type { RegionRecord, ScanEffectRegion } from '../types'

function NullSummary({ region }: { region: RegionRecord }) {
  const low = Math.min(region.observed_score, region.random_mean - 3 * region.random_std)
  const high = Math.max(region.observed_score, region.random_mean + 3 * region.random_std)
  const scale = (value: number) => 8 + 84 * (value - low) / (high - low || 1)
  return (
    <div className="null-summary">
      <svg viewBox="0 0 100 34" role="img" aria-label="Observed score compared with null mean plus or minus one standard deviation">
        <line x1={scale(region.random_mean - region.random_std)} x2={scale(region.random_mean + region.random_std)} y1="18" y2="18" />
        <circle className="null-dot" cx={scale(region.random_mean)} cy="18" r="3" />
        <line className="observed-mark" x1={scale(region.observed_score)} x2={scale(region.observed_score)} y1="7" y2="29" />
      </svg>
      <div className="null-key"><span>● Null mean ± 1 SD</span><span>│ Observed</span></div>
      <p>Individual random-group draws are not displayed here; this is the real stored comparison summary, not a reconstructed distribution.</p>
    </div>
  )
}

export function RegionPanel({ scan, pattern, region, diseaseName, threshold, onClose }: { scan?: ScanEffectRegion | null; pattern?: number; region: RegionRecord; diseaseName: string; threshold: number; onClose: () => void }) {
  const [showNull, setShowNull] = useState(false)
  const [showWhy, setShowWhy] = useState(false)
  const direction = region.z_score > 0 ? 'above' : region.z_score < 0 ? 'below' : 'at'
  const biology = region.biology
  return (
    <aside className="region-panel" aria-live="polite" aria-label={`Details for ${region.region_name}`}>
      <button className="close-panel" onClick={onClose} aria-label="Close region details">×</button>
      <span className="eyebrow">AAL3 · {region.atlas_id}</span>
      <h2>{region.region_name}</h2>
      <p className="disease-label">{diseaseName} · weighted gene set</p>
      {pattern !== undefined && <p className="caution">Typical-pattern weight (illustrative, from published staging): {formatValue(pattern, 2)} of 1.</p>}
      {scan && <p className="caution">Your scans: grey-matter {formatValue(scan.percent_difference, 1)}% (patients vs controls), d = {formatValue(scan.effect_d, 2)}, FDR p = {formatValue(scan.fdr_p, 3)}. The genes listed below are the ones most expressed in this region in healthy brains; that suggests candidate biology, not that they caused the difference.</p>}
      <h3 className="panel-section-title">Why is this region highlighted?</h3>
      <p className="interpretation">Some genes linked to {diseaseName} are active here. Their combined activity is {region.z_score > 0 ? 'higher' : 'lower'} than expected when compared with matched random gene groups.</p>
      <div className="stat-grid">
        <div><span>Brain signal</span><strong>{region.z_score > 0 ? 'Higher' : region.z_score < 0 ? 'Lower' : 'Expected'}</strong></div>
        <div><span>Statistical evidence</span><strong>{region.fdr_p < threshold ? 'Strong' : 'Limited'}</strong></div>
        <div><span>Independent evidence</span><strong>{region.validation_score === null ? 'Not available' : 'Available'}</strong></div>
      </div>
      <p className="technical-reference">Independent validation data: {region.validation_region ?? 'Not available'} · Biological interpretation: {biology?.selected_for_regional_interpretation ? 'available for this region' : 'not assigned to this region'}</p>
      <h3 className="panel-section-title">What biology may be involved? <span className="technical-label">Biological interpretation</span></h3>
      {biology?.top_genes.length ? (
        <>
          <p className="biology-rule">Top weighted contributors</p>
          <ol className="biology-list">
            {biology.top_genes.map((item) => (
              <li key={item.gene}><strong>{item.gene}</strong><span>contribution {formatValue(item.weighted_contribution, 4)}</span></li>
            ))}
          </ol>
          <p className="biology-rule">Associated biological programs</p>
          {biology.pathways.length ? (
            <ul className="biology-list plain">
              {biology.pathways.map((pathway) => <li key={pathway.id}><strong>{pathway.name}</strong><span>statistical evidence {formatValue(pathway.fdr, 4)}</span></li>)}
            </ul>
          ) : <p className="caution">No region-specific pathway passed the project’s evidence threshold{biology.selected_for_regional_interpretation ? '.' : '; this parcel was not selected for regional interpretation.'}</p>}
          <p className="biology-rule">Cell types</p>
          {biology.cell_types.length ? (
            <ul className="biology-list plain">
              {biology.cell_types.map((cell) => <li key={cell.name}><strong>{cell.name}</strong><span>evidence {formatValue(cell.fdr, 4)}</span></li>)}
            </ul>
          ) : <p className="caution">Region-level cell-type annotation is not assigned; disease-level results are available in the downloadable project data.</p>}
        </>
      ) : <p className="caution">Biological interpretation is unavailable for this parcel.</p>}
      <details className="technical-details"><summary>Technical details</summary><div className="stat-grid"><span className="technical-label">Stage 7 · Spatial sensitivity</span><span className="technical-label">Independent validation data</span>
        <div><span>Enrichment Z-score</span><strong>{formatValue(region.z_score)}</strong></div><div><span>Adjusted p-value</span><strong>{formatValue(region.fdr_p, 4)}</strong></div><div><span>Observed score</span><strong>{formatValue(region.observed_score, 4)}</strong></div><div><span>Random expectation</span><strong>{formatValue(region.random_mean, 4)}</strong></div><div><span>Spatial robustness</span><strong>{formatValue(region.spatial_robustness, 4)}</strong></div><div><span>Genes represented</span><strong>{region.number_of_genes}</strong></div>
      </div></details>
      <p className="caution">This map does not diagnose disease, predict an individual, or show where disease begins. A highlighted region is a candidate molecular pattern, not proof of causation.</p>
      <button className="why-button" onClick={() => setShowWhy((visible) => !visible)} aria-expanded={showWhy}>
        {showWhy ? 'Hide explanation' : 'Why is this region highlighted?'}
      </button>
      {showWhy && (
        <section className="why-panel" aria-label="Why this region is highlighted">
          <h3>Why is this region highlighted?</h3>
          <ol>
            <li><span>Disease genes represented</span><strong>{region.number_of_genes}</strong></li>
            <li><span>Regional expression</span><strong>{formatValue(region.observed_score, 4)}</strong></li>
            <li><span>Random-set expectation</span><strong>{formatValue(region.random_mean, 4)}</strong></li>
            <li><span>How unusual the pattern is</span><strong>{formatValue(region.z_score)} SD</strong></li>
            <li><span>Statistical evidence</span><strong>{region.fdr_p < threshold ? 'Strong' : 'Limited'}</strong></li>
          </ol>
          <p><strong>Top contributing genes:</strong> {biology?.top_genes.map((item) => item.gene).join(', ') || 'not available'}</p>
          <p><strong>Biological programs:</strong> {biology?.pathways.map((item) => item.name).join('; ') || 'no robust region-specific enrichment detected'}</p>
          <p><strong>Independent comparison:</strong> {region.validation_score === null ? 'not measured for this parcel' : `external score ${formatValue(region.validation_score)}; the overall comparison was not supported`}</p>
          <p className="caution"><strong>Evidence:</strong> gene activity, matched random gene groups, and independent observations where available. <strong>Interpretation:</strong> pathway and cell-type annotations. Neither establishes causality.</p>
        </section>
      )}
      <button className="outline-button" onClick={() => setShowNull((visible) => !visible)} aria-expanded={showNull} aria-label={showNull ? 'Hide null distribution' : 'Show null distribution'}>
        {showNull ? 'Hide comparison with random genes' : 'Show comparison with random genes'}
      </button>
      {showNull && <NullSummary region={region} />}
    </aside>
  )
}
