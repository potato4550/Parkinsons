import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import { Controls } from './components/Controls'
import { Legend } from './components/Legend'
import { MultiDiseaseSections } from './components/MultiDiseaseSections'
import { ScanUpload, type UploadResult } from './components/ScanUpload'
import { RegionPanel } from './components/RegionPanel'
import { ResearchSections } from './components/ResearchSections'
import { Tooltip } from './components/Tooltip'
import { loadResearchData } from './data'
import type { AtlasGeometry, EnrichmentData, Hemisphere, Metric, MultidiseaseAtlas, ProjectMetadata, RegionTopGenes, ScanEffects, TypicalPatterns, RegionRecord, ViewPreset } from './types'

type Loaded = { enrichment: EnrichmentData; metadata: ProjectMetadata; geometry: AtlasGeometry; multidisease: MultidiseaseAtlas; patterns: TypicalPatterns | null; scan: ScanEffects | null; regionGenes: RegionTopGenes | null }
const BrainScene = lazy(() => import('./components/BrainScene').then((module) => ({ default: module.BrainScene })))
const query = new URLSearchParams(window.location.search)
const validMetrics: Metric[] = ['anatomy', 'z_score', 'observed_score', 'fdr_p', 'spatial_robustness', 'validation_score', 'agreement', 'pattern', 'scan_effect', 'upload']
const validViews: ViewPreset[] = ['reset', 'left', 'right', 'anterior', 'posterior', 'superior', 'inferior']

export default function App() {
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [metric, setMetric] = useState<Metric>(() => validMetrics.includes(query.get('metric') as Metric) ? query.get('metric') as Metric : 'z_score')
  const [diseaseId, setDiseaseId] = useState(query.get('disease') ?? 'parkinson')
  const [hemisphere, setHemisphere] = useState<Hemisphere>(() => query.get('hemi') === 'L' || query.get('hemi') === 'R' ? query.get('hemi') as Hemisphere : 'whole')
  const [selected, setSelected] = useState<RegionRecord | null>(null)
  const [hovered, setHovered] = useState<RegionRecord | null>(null)
  const [tooltipPoint, setTooltipPoint] = useState({ x: 0, y: 0 })
  const [focusNonce, setFocusNonce] = useState(0)
  const [viewPreset, setViewPreset] = useState<ViewPreset>(() => validViews.includes(query.get('view') as ViewPreset) ? query.get('view') as ViewPreset : 'reset')
  const [upload, setUpload] = useState<UploadResult | null>(null)
  const [shareMessage, setShareMessage] = useState('')
  const [showGuide, setShowGuide] = useState(() => window.localStorage.getItem('gene2brain-guide-seen') !== '1')
  const validationMode = useMemo(() => window.location.pathname.endsWith('/dev/atlas-validation') || query.get('mode') === 'atlas', [])

  useEffect(() => {
    loadResearchData().then(setLoaded).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'Unknown data error'))
  }, [])

  useEffect(() => {
    if (!loaded) return
    if (!loaded.multidisease.diseases.some((item) => item.disease_id === diseaseId)) {
      setDiseaseId(loaded.multidisease.diseases[0].disease_id)
    }
    const requested = Number(query.get('region'))
    const disease = loaded.multidisease.diseases.find((item) => item.disease_id === diseaseId) ?? loaded.multidisease.diseases[0]
    if (Number.isInteger(requested) && requested > 0) {
      const match = disease.regions.find((region) => region.region_id === requested) ?? null
      setSelected(match)
      if (match && hemisphere !== 'whole' && match.hemisphere !== hemisphere) setHemisphere('whole')
    }
  }, [loaded]) // Initial URL hydration only; subsequent selections are controlled by the UI.

  useEffect(() => {
    if (!loaded) return
    const next = new URL(window.location.href)
    next.searchParams.set('disease', diseaseId)
    next.searchParams.set('metric', metric)
    next.searchParams.set('hemi', hemisphere)
    if (selected) next.searchParams.set('region', String(selected.region_id))
    else next.searchParams.delete('region')
    if (viewPreset !== 'reset') next.searchParams.set('view', viewPreset)
    else next.searchParams.delete('view')
    window.history.replaceState(null, '', next)
  }, [diseaseId, hemisphere, loaded, metric, selected, viewPreset])

  if (error) return <main className="load-state error-state"><h1>Visualization unavailable</h1><p>{error}</p><p>No scientific values have been displayed.</p></main>
  if (!loaded) return <main className="load-state"><div className="loader" /><p>Loading verified AAL3 atlas geometry…</p></main>

  const { metadata, geometry, multidisease } = loaded
  const enrichment = multidisease.diseases.find((disease) => disease.disease_id === diseaseId) ?? multidisease.diseases[0]
  const zDomain = multidisease.z_domain
  const observedValues = enrichment.regions.map((region) => region.observed_score)
  const observedDomain: [number, number] = [Math.min(...observedValues), Math.max(...observedValues)]
  const validationDomain = metadata.metrics.validation_score.domain as [number, number]
  const overlay = (() => {
    if (metric === 'pattern') {
      const p = loaded.patterns?.patterns[diseaseId]
      return p ? new Map(Object.entries(p).map(([k, v]) => [Number(k), v])) : new Map<number, number>()
    }
    if (metric === 'upload' && upload) return new Map(upload.regions.map((r) => [r.region_id, Math.min(1, Math.max(0, -r.z) / 3)] as [number, number]))
    if (metric === 'scan_effect' && loaded.scan) {
      const bound = Math.max(0.01, ...loaded.scan.regions.map((r) => Math.abs(r.effect_d)))
      return new Map(loaded.scan.regions.map((r) => [r.region_id, Math.max(0, -r.effect_d) / bound] as [number, number]))
    }
    return new Map<number, number>()
  })()
  const selectRegion = (region: RegionRecord) => {
    setHemisphere('whole')
    setSelected(region)
    setFocusNonce((value) => value + 1)
  }
  const setView = (view: ViewPreset) => {
    setViewPreset(view)
    setSelected(null)
    setFocusNonce(0)
  }
  const shareView = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href)
      setShareMessage('Link copied')
    } catch {
      setShareMessage('Copy the current address-bar URL to share this view')
    }
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="GENE2BRAIN home"><strong>GENE<span>2</span>BRAIN</strong><small>Atlas · healthy human brain</small></a>
        <nav aria-label="Primary navigation"><a href="#top">Home</a><a href="#explore">Explore the brain</a><a href="#how">How it works</a><a href="#results">What we found</a><a href="#compare">Compare diseases</a><a href="#methods">Data &amp; methods</a><a href="#about">About</a></nav>
        <details className="mobile-nav"><summary>Menu</summary><div><a href="#top">Home</a><a href="#explore">Explore the brain</a><a href="#how">How it works</a><a href="#results">What we found</a><a href="#compare">Compare diseases</a><a href="#methods">Data &amp; methods</a><a href="#about">About</a></div></details>
      </header>

      <section className="hero" id="top">
        <div className="hero-heading">
          <div><p className="eyebrow">GENE2BRAIN Atlas · interactive research</p><h1>From Genetic Risk to<br /><em>Spatial Brain Vulnerability</em></h1></div>
          <div><p>Can genes linked to a disease help us understand which parts of the brain may carry a stronger molecular signal?</p><p className="hero-note">Explore real disease-linked gene activity across the healthy human brain.</p><a className="download-button" href="#explore">Explore the brain</a> <a className="outline-button" href="#how">How it works</a> <button className="outline-button share-button" onClick={shareView}>Share view</button>{shareMessage && <span className="share-message" role="status">{shareMessage}</span>}</div>
        </div>
        <div id="explore" className="explore-label"><strong>Explore the brain</strong><span>Parkinson disease · Brain signal</span></div>
        <Controls
          metric={metric}
          hemisphere={hemisphere}
          regions={enrichment.regions}
          diseases={multidisease.diseases}
          diseaseId={enrichment.disease_id}
          selected={selected}
          onDisease={(value) => { setDiseaseId(value); setSelected(null); setHovered(null); setMetric('z_score') }}
          onMetric={setMetric}
          onHemisphere={setHemisphere}
          onSelect={selectRegion}
          onView={setView}
        />
        <ScanUpload result={upload} regions={enrichment.regions} genes={loaded.regionGenes?.diseases[diseaseId] ?? {}} onSelect={selectRegion} onResult={(r) => { setUpload(r); if (r) setMetric('upload') }} />
        <div className={`brain-stage ${selected ? 'has-panel' : ''}`}>
          <Suspense fallback={<div className="scene-loading">Preparing WebGL brain…</div>}><BrainScene
            geometryData={geometry}
            regions={enrichment.regions}
            metric={metric}
            hemisphere={hemisphere}
            selected={selected}
            focusNonce={focusNonce}
            viewPreset={viewPreset}
            validationMode={validationMode}
            zDomain={zDomain}
            observedDomain={observedDomain}
            validationDomain={validationDomain}
            fdrThreshold={metadata.analysis.fdr_threshold}
            overlay={overlay}
            onHover={(region, point) => { setHovered(region); if (point) setTooltipPoint(point) }}
            onSelect={selectRegion}
            onReset={() => setView('reset')}
          /></Suspense>
          <div className="stage-label"><span>{validationMode ? 'ATLAS REGION VALIDATION' : `${enrichment.disease_name.toUpperCase()} · AAL3 · 138 REGIONS`}</span><span>Drag to rotate · scroll/pinch to zoom · right-drag to pan</span></div>
          <Legend
            scan={loaded.scan}
            metric={metric}
            zDomain={zDomain}
            observedDomain={observedDomain}
            validationDomain={validationDomain}
            threshold={metadata.analysis.fdr_threshold}
            significant={enrichment.regions.filter((region) => region.fdr_p < metadata.analysis.fdr_threshold).length}
            spatialRobustRegions={enrichment.regions.filter((region) => region.spatial_robustness_label === 'robust').length}
            mappedValidationRegions={enrichment.regions.filter((region) => region.validation_score !== null).length}
            validationMode={validationMode}
          />
          {validationMode && (
            <div className="validation-list" aria-label="Atlas region list"><strong>Region ID map</strong>{[...enrichment.regions].sort((a, b) => a.region_id - b.region_id).map((region) => (
              <button key={region.region_id} onClick={() => selectRegion(region)}><span>{region.region_id}</span>{region.region_name}</button>
            ))}</div>
          )}
          {selected && <RegionPanel scan={loaded.scan?.regions.find((r) => r.region_id === selected.region_id) ?? null} pattern={loaded.patterns?.patterns[diseaseId]?.[String(selected.region_id)]} region={selected} diseaseName={enrichment.disease_name} threshold={metadata.analysis.fdr_threshold} onClose={() => setSelected(null)} />}
          {showGuide && !selected && <div className="explore-guide" role="dialog" aria-label="Explore the brain"><p className="eyebrow">Explore the brain</p><h2>Find the signal</h2><p>Rotate by dragging. Zoom with your scroll wheel or pinch. Hover over a region, then click it to see the evidence behind its signal.</p><button className="download-button" onClick={() => { window.localStorage.setItem('gene2brain-guide-seen', '1'); setShowGuide(false) }}>Got it</button></div>}
        </div>
      </section>
      {hovered && <Tooltip region={hovered} point={tooltipPoint} />}
      {!validationMode && <MultiDiseaseSections atlas={multidisease} geometry={geometry} />}
      <ResearchSections metadata={metadata} />
      <footer><strong>GENE2BRAIN</strong><span>Research visualization · values generated by the validated scientific pipeline</span></footer>
    </div>
  )
}
