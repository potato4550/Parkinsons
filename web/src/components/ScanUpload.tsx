import { useState } from 'react'
import type { RegionRecord } from '../types'

export interface UploadResult {
  guess: string
  similarity: Record<string, number>
  share_regions_below_2sd: number
  regions: { region_id: number; z: number }[]
  classifier: { probability_patient_like: number; cv_auc: number; permutation_p: number; n: number; better_than_chance: boolean } | null
  warnings: string[]
  previews: string[]
  sample?: boolean
  caveat: string
}

const API = 'http://localhost:8000'
const LABEL: Record<string, string> = { parkinson: 'Parkinson-like pattern', alzheimer: 'Alzheimer-like pattern', 'normal-like': 'No clear pattern (normal-like)' }
const SIM_LABEL: Record<string, string> = { parkinson: 'Parkinson (textbook)', alzheimer: 'Alzheimer (textbook)', data_driven: 'Your patient data' }
const VIEW = ['Axial', 'Coronal', 'Sagittal']

export function ScanUpload({ result, regions, onResult, onSelect }: {
  result: UploadResult | null
  regions: RegionRecord[]
  onResult: (r: UploadResult | null) => void
  onSelect: (region: RegionRecord) => void
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const call = async (request: () => Promise<Response>) => {
    setBusy(true); setError(''); onResult(null)
    try {
      const response = await request()
      const json = await response.json()
      if (!response.ok) throw new Error(json.detail ?? `Server error ${response.status}`)
      onResult(json as UploadResult)
    } catch (reason) {
      setError(reason instanceof TypeError ? 'Cannot reach the local scan server. Start it with: python -m uvicorn server.app:app --port 8000' : reason instanceof Error ? reason.message : 'Upload failed')
    } finally { setBusy(false) }
  }
  const send = (file: File) => { const body = new FormData(); body.append('file', file); return call(() => fetch(`${API}/analyze`, { method: 'POST', body })) }
  const byId = new Map(regions.map((region) => [region.region_id, region]))
  const worst = result ? result.regions.filter((r) => byId.has(r.region_id)).sort((a, b) => a.z - b.z).slice(0, 8) : []
  return (
    <section className="scan-upload" aria-label="Upload an MRI scan" style={{ border: '1px solid #2c3a3e', padding: '12px 16px', margin: '12px 0' }}>
      <strong>Upload an MRI (rough guess)</strong>
      <p className="caution">Choose a T1-weighted brain scan (.nii or .nii.gz). It is processed on your own computer by the local server and shown on the 3D brain as “Your uploaded scan”. This is a rough pattern match, not a diagnosis.</p>
      <input type="file" accept=".nii,.gz,.nii.gz" disabled={busy} aria-label="MRI file" onChange={(event) => { const file = event.target.files?.[0]; if (file) void send(file) }} />
      {' '}<button className="outline-button" disabled={busy} onClick={() => void call(() => fetch(`${API}/analyze-sample`))}>Try the sample scan</button>
      {busy && <p role="status">Processing… this can take a minute or two.</p>}
      {error && <p className="caution" role="alert">{error}</p>}
      {result && (
        <div role="status">
          {result.sample && <p className="caution">This is the sample average healthy brain, not a person.</p>}
          {result.warnings.map((warning) => <p key={warning} className="caution" role="alert">⚠ {warning}</p>)}
          {result.previews.length > 0 && <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>{result.previews.map((src, i) => <figure key={VIEW[i]} style={{ margin: 0 }}><img src={src} alt={`${VIEW[i]} slice of the uploaded scan`} width={140} height={140} /><figcaption style={{ fontSize: 12 }}>{VIEW[i]}</figcaption></figure>)}</div>}
          <p><strong>Rough guess: {LABEL[result.guess] ?? result.guess}</strong> (low confidence)</p>
          <p>Pattern similarity: {Object.entries(result.similarity).map(([key, value]) => `${SIM_LABEL[key] ?? key} ${value.toFixed(2)}`).join(' · ')}. Regions more than 2 SD below controls: {(result.share_regions_below_2sd * 100).toFixed(1)}%.</p>
          {result.classifier && <p>Trained classifier: {(result.classifier.probability_patient_like * 100).toFixed(0)}% patient-like. Its own cross-validated accuracy (AUC) was {result.classifier.cv_auc.toFixed(2)} on {result.classifier.n} people{result.classifier.better_than_chance ? '' : ', which is not clearly better than chance, so ignore this number'}.</p>}
          {worst.length > 0 && (
            <>
              <p><strong>Most reduced regions</strong> (genes are the most expressed there in healthy brains, not proven causes):</p>
              <ol>{worst.map((r) => { const region = byId.get(r.region_id)!; const genes = region.biology?.top_genes.slice(0, 3).map((g) => g.gene).join(', ') || 'n/a'
                return <li key={r.region_id}><button className="outline-button" onClick={() => onSelect(region)}>{region.region_name}</button> z = {r.z.toFixed(1)} · {genes}</li> })}</ol>
            </>
          )}
          <p className="caution">{result.caveat}</p>
        </div>
      )}
    </section>
  )
}
