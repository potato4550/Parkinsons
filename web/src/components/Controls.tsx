import { useEffect, useState } from 'react'
import type { EnrichmentData, Hemisphere, Metric, RegionRecord, ViewPreset } from '../types'

export function Controls({
  metric, hemisphere, regions, diseases, diseaseId, selected, onDisease, onMetric, onHemisphere, onSelect, onView,
}: {
  metric: Metric
  hemisphere: Hemisphere
  regions: RegionRecord[]
  diseases: EnrichmentData[]
  diseaseId: string
  selected: RegionRecord | null
  onDisease: (diseaseId: string) => void
  onMetric: (metric: Metric) => void
  onHemisphere: (hemisphere: Hemisphere) => void
  onSelect: (region: RegionRecord) => void
  onView: (view: ViewPreset) => void
}) {
  const [query, setQuery] = useState('')
  useEffect(() => { setQuery(selected?.region_name ?? '') }, [selected])
  return (
    <div className="control-stack">
      <div className="control-row primary-controls">
        <label>Disease
          <select value={diseaseId} onChange={(event) => onDisease(event.target.value)} aria-label="Disease">
            {diseases.map((disease) => <option key={disease.disease_id} value={disease.disease_id}>{disease.disease_name}</option>)}
          </select>
        </label>
        <label>What to see
          <select value={metric} onChange={(event) => onMetric(event.target.value as Metric)} aria-label="Metric">
            <option value="z_score">Brain signal</option>
            <option value="anatomy">Anatomy only</option>
            <option value="observed_score">Gene activity</option>
            <option value="fdr_p">Statistical evidence</option>
            <option value="spatial_robustness">Pattern robustness</option>
            <option value="validation_score">Independent evidence</option>
            <option value="agreement">Evidence agreement</option>
            <option value="pattern">Typical disease pattern (illustrative)</option>
            <option value="upload">Your uploaded scan</option>
            <option value="scan_effect">Your MRI group difference</option>
          </select>
        </label>
        <label className="search-control">Search brain region
          <input
            list="region-options"
            placeholder="Putamen, caudate…"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value)
              const match = regions.find((region) => region.region_name.toLowerCase() === event.target.value.toLowerCase())
              if (match) onSelect(match)
            }}
            aria-label="Search brain region"
          />
          <datalist id="region-options">
            {regions.map((region) => <option key={region.region_id} value={region.region_name} />)}
          </datalist>
        </label>
      </div>
      <div className="control-row compact-controls" aria-label="Anatomical navigation">
        <div className="segmented">
          {([['whole', 'Whole'], ['L', 'Left'], ['R', 'Right']] as const).map(([value, label]) => (
            <button key={value} className={hemisphere === value ? 'active' : ''} onClick={() => onHemisphere(value)}>{label}</button>
          ))}
        </div>
        <div className="view-buttons">
          {(['left', 'right', 'anterior', 'posterior', 'superior', 'inferior'] as ViewPreset[]).map((view) => (
            <button key={view} onClick={() => onView(view)}>{view[0].toUpperCase() + view.slice(1)}</button>
          ))}
          <button className="reset-button" onClick={() => onView('reset')} aria-label="Reset camera">Reset view</button>
        </div>
      </div>
    </div>
  )
}
