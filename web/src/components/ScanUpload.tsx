import { useState } from 'react'
import type { RegionGene, RegionRecord } from '../types'

export interface UploadResult {
  guess: string
  similarity: Record<string, number>
  share_regions_below_2sd: number
  regions: { region_id: number; z: number }[]
  adjusted_for?: string[]
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

export function ScanUpload({ result, regions, genes, onResult, onSelect }: {
  result: UploadResult | null
  regions: RegionRecord[]
  genes: Record<string, RegionGene[]>
  onResult: (r: UploadResult | null) => void
  onSelect: (region: RegionRecord) => void
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [age, setAge] = useState('')
  const [sex, setSex] = useState('')
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
  const send = (file: File) => { const body = new FormData(); body.append('file', file); if (age) body.append('age', age); if (sex) body.append('sex', sex); return call(() => fetch(`${API}/analyze`, { method: 'POST', body })) }
  const byId = new Map(regions.map((region) => [region.region_id, region]))
  const geneNames = (id: number, region?: RegionRecord) => (genes[String(id)] ?? region?.biology?.top_genes ?? []).slice(0, 3).map((g) => g.gene).join(', ') || 'n/a'
  const sorted = result ? result.regions.filter((r) => byId.has(r.region_id)).sort((a, b) => a.z - b.z) : []
  const download = () => {
    if (!result) return
    const rows = ['region_id,region_name,z_score,top_genes', ...sorted.map((r) => `${r.region_id},"${byId.get(r.region_id)!.region_name}",${r.z.toFixed(3)},"${geneNames(r.region_id, byId.get(r.region_id))}"`)]
    const url = URL.createObjectURL(new Blob([rows.join('\n')], { type: 'text/csv' }))
    const link = document.createElement('a'); link.href = url; link.download = 'mri_region_results.csv'; link.click(); URL.revokeObjectURL(url)
  }
  const worst = result ? result.regions.filter((r) => byId.has(r.region_id)).sort((a, b) => a.z - b.z).slice(0, 8) : []
  return (
    <section className="scan-upload" aria-label="Upload an MRI scan" style={{ border: '1px solid #2c3a3e', padding: '12px 16px', margin: '12px 0' }}>
      <strong>Upload an MRI (rough guess)</strong>
      <p className="caution">Choose a T1-weighted brain scan (.nii or .nii.gz). It is processed on your own computer by the local server and shown on the 3D brain as “Your uploaded scan”. This is a rough pattern match, not a diagnosis.</p>
      <input type="file" accept=".nii,.gz,.nii.gz" disabled={busy} aria-label="MRI file" onChange={(event) => { const file = event.target.files?.[0]; if (file) void send(file) }} />
      {' '}<label>Age (optional) <input type="number" min={1} max={120} value={age} onChange={(e) => setAge(e.target.value)} style={{ width: 70 }} /></label>
      {' '}<label>Sex (optional) <select value={sex} onChange={(e) => setSex(e.target.value)}><option value="">Unknown</option><option value="F">F</option><option value="M">M</option></select></label>
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
          {result.adjusted_for && result.adjusted_for.length > 0 && <p>Adjusted for: {result.adjusted_for.join(' and ')}.</p>}
          {result.classifier && <p>Trained classifier: {(result.classifier.probability_patient_like * 100).toFixed(0)}% patient-like. Its own cross-validated accuracy (AUC) was {result.classifier.cv_auc.toFixed(2)} on {result.classifier.n} people{result.classifier.better_than_chance ? '' : ', which is not clearly better than chance, so ignore this number'}.</p>}
          {worst.length > 0 && (
            <>
              <p><strong>Most reduced regions</strong> (genes: disease-linked genes most elevated in that region in healthy brains versus other regions; candidates, not proven causes):</p>
              <ol>{worst.map((r) => { const region = byId.get(r.region_id)!; return <li key={r.region_id}><button className="outline-button" onClick={() => onSelect(region)}>{region.region_name}</button> z = {r.z.toFixed(1)} · {geneNames(r.region_id, region)}</li> })}</ol>
              <details><summary>All {sorted.length} regions</summary><table><thead><tr><th>Region</th><th>z</th><th>Genes</th></tr></thead><tbody>{sorted.map((r) => <tr key={r.region_id}><td>{byId.get(r.region_id)!.region_name}</td><td>{r.z.toFixed(2)}</td><td>{geneNames(r.region_id, byId.get(r.region_id))}</td></tr>)}</tbody></table></details>
              <button className="outline-button" onClick={download}>Download results (CSV)</button>
            </>
          )}
          <p className="caution">{result.caveat}</p>
        </div>
      )}
    </section>
  )
}
