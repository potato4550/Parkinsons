import type { AtlasGeometry, BiologicalInterpretationData, EnrichmentData, MultidiseaseAtlas, ProjectMetadata, RegionRecord, RegionTopGenes, ScanEffects, TypicalPatterns } from './types'

const DATA_ROOT = '/data'

async function fetchJson<T>(name: string): Promise<T> {
  const response = await fetch(`${DATA_ROOT}/${name}`)
  if (!response.ok) throw new Error(`Could not load ${name} (${response.status})`)
  return response.json() as Promise<T>
}

async function optionalJson<T>(name: string): Promise<T | null> {
  try { return await fetchJson<T>(name) } catch { return null }
}

export async function loadResearchData() {
  const [enrichment, metadata, geometry, biology, multidisease] = await Promise.all([
    fetchJson<EnrichmentData>('parkinson_brain_enrichment.json'),
    fetchJson<ProjectMetadata>('project_metadata.json'),
    fetchJson<AtlasGeometry>('anatomical_brain.json'),
    fetchJson<BiologicalInterpretationData>('parkinson_biological_interpretation.json'),
    fetchJson<MultidiseaseAtlas>('multidisease_atlas.json'),
  ])
  const biologyByRegion = new Map(biology.regions.map((record) => [record.region_id, record]))
  enrichment.regions = enrichment.regions.map((region) => ({
    ...region,
    biology: biologyByRegion.get(region.region_id) ?? null,
  }))
  validateClientData(enrichment, metadata, geometry, biology)
  validateMultidiseaseData(multidisease, geometry)
  const [patterns, scan, regionGenes] = await Promise.all([optionalJson<TypicalPatterns>('typical_patterns.json'), optionalJson<ScanEffects>('scan_group_effects.json'), optionalJson<RegionTopGenes>('region_top_genes.json')])
  return { enrichment, metadata, geometry, multidisease, patterns, scan, regionGenes }
}

export function validateMultidiseaseData(atlas: MultidiseaseAtlas, geometry: AtlasGeometry) {
  if (atlas.diseases.length < 2) throw new Error('Multi-disease atlas contains fewer than two completed diseases')
  const expected = new Set(geometry.regions.map((region) => region.region_id))
  const diseaseIds = atlas.diseases.map((disease) => disease.disease_id)
  if (new Set(diseaseIds).size !== diseaseIds.length) throw new Error('Duplicate disease IDs')
  if (atlas.pearson_similarity.length !== atlas.diseases.length * (atlas.diseases.length + 1) / 2) {
    throw new Error('Frozen Pearson similarity table is incomplete')
  }
  atlas.diseases.forEach((disease) => {
    if (disease.regions.length !== expected.size || disease.regions.some((region) => !expected.has(region.region_id))) {
      throw new Error(`${disease.disease_name} does not cover the common AAL3 geometry`)
    }
    disease.regions.forEach((region) => {
      if (![region.z_score, region.observed_score, region.fdr_p, region.spatial_robustness].every(Number.isFinite)) {
        throw new Error(`Invalid multi-disease value for ${disease.disease_name}, region ${region.region_id}`)
      }
    })
  })
  if (!(atlas.z_domain[0] < 0 && atlas.z_domain[1] > 0)) throw new Error('Invalid shared Z-score domain')
}

export function validateClientData(
  enrichment: EnrichmentData,
  metadata: ProjectMetadata,
  geometry: AtlasGeometry,
  biology?: BiologicalInterpretationData,
) {
  const recordIds = enrichment.regions.map((region) => region.region_id)
  const geometryIds = geometry.regions.map((region) => region.region_id)
  if (new Set(recordIds).size !== recordIds.length) throw new Error('Duplicate research region IDs')
  if (new Set(geometryIds).size !== geometryIds.length) throw new Error('Duplicate atlas region IDs')
  if (recordIds.length !== geometryIds.length || recordIds.some((id) => !geometryIds.includes(id))) {
    throw new Error('Research records and atlas geometry do not map one-to-one')
  }
  const numeric: Array<keyof RegionRecord> = [
    'observed_score', 'random_mean', 'random_std', 'z_score', 'empirical_p', 'fdr_p', 'effect_size',
    'spatial_null_p', 'spatial_null_fdr', 'spatial_robustness', 'robustness_rank',
  ]
  enrichment.regions.forEach((region) => {
    numeric.forEach((field) => {
      if (!Number.isFinite(region[field] as number)) throw new Error(`Invalid ${field} for region ${region.region_id}`)
    })
    if ([region.fdr_p, region.empirical_p, region.spatial_null_p, region.spatial_null_fdr, region.spatial_robustness].some((value) => value < 0 || value > 1)) {
      throw new Error(`Invalid probability for region ${region.region_id}`)
    }
    if (region.validation_score !== null && !Number.isFinite(region.validation_score)) {
      throw new Error(`Invalid validation_score for region ${region.region_id}`)
    }
    if (!['high_prediction_high_validation', 'high_prediction_low_validation', 'low_prediction_high_validation', 'low_prediction_low_validation', 'not_measured'].includes(region.agreement_status)) {
      throw new Error(`Invalid agreement_status for region ${region.region_id}`)
    }
  })
  if (!(metadata.analysis.fdr_threshold > 0 && metadata.analysis.fdr_threshold < 1)) {
    throw new Error('Invalid configured FDR threshold')
  }
  if (biology) {
    const biologyIds = biology.regions.map((record) => record.region_id)
    if (new Set(biologyIds).size !== biologyIds.length) throw new Error('Duplicate biological interpretation region IDs')
    if (biologyIds.some((id) => !recordIds.includes(id))) throw new Error('Biological interpretation includes an unknown region')
    biology.regions.forEach((record) => {
      record.top_genes.forEach((gene) => {
        if (![gene.expression, gene.l2g_score, gene.weighted_contribution].every(Number.isFinite)) {
          throw new Error(`Invalid biological gene value for region ${record.region_id}`)
        }
      })
    })
  }
}
