import { useState } from 'react'

export interface UploadResult {
  guess: string
  similarity: Record<string, number>
  share_regions_below_2sd: number
  regions: { region_id: number; z: number }[]
  caveat: string
}

const API = 'http://localhost:8000'
const LABEL: Record<string, string> = { parkinson: 'Parkinson-like pattern', alzheimer: 'Alzheimer-like pattern', 'normal-like': 'No clear pattern (normal-like)' }

export function ScanUpload({ result, onResult }: { result: UploadResult | null; onResult: (r: UploadResult | null) => void }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const send = async (file: File) => {
    setBusy(true); setError(''); onResult(null)
    try {
      const body = new FormData(); body.append('file', file)
      const response = await fetch(`${API}/analyze`, { method: 'POST', body })
      const json = await response.json()
      if (!response.ok) throw new Error(json.detail ?? `Server error ${response.status}`)
      onResult(json as UploadResult)
    } catch (reason) {
      setError(reason instanceof TypeError ? 'Cannot reach the local scan server. Start it with: python -m uvicorn server.app:app --port 8000' : reason instanceof Error ? reason.message : 'Upload failed')
    } finally { setBusy(false) }
  }
  return (
    <section className="scan-upload" aria-label="Upload an MRI scan" style={{ border: '1px solid #2c3a3e', padding: '12px 16px', margin: '12px 0' }}>
      <strong>Upload an MRI (rough guess)</strong>
      <p className="caution">Choose a T1-weighted brain scan (.nii or .nii.gz). It is processed on your own computer by the local server and shown on the 3D brain as “Your uploaded scan”. This is a rough pattern match, not a diagnosis.</p>
      <input type="file" accept=".nii,.gz,.nii.gz" disabled={busy} aria-label="MRI file" onChange={(event) => { const file = event.target.files?.[0]; if (file) void send(file) }} />
      {busy && <p role="status">Processing… this can take a minute or two.</p>}
      {error && <p className="caution" role="alert">{error}</p>}
      {result && (
        <div role="status">
          <p><strong>Rough guess: {LABEL[result.guess] ?? result.guess}</strong> (low confidence)</p>
          <p>Pattern similarity — Parkinson: {result.similarity.parkinson.toFixed(2)}, Alzheimer: {result.similarity.alzheimer.toFixed(2)}. Regions more than 2 SD below controls: {(result.share_regions_below_2sd * 100).toFixed(1)}%.</p>
          <p className="caution">{result.caveat}</p>
        </div>
      )}
    </section>
  )
}
