export type Metric = 'anatomy' | 'z_score' | 'observed_score' | 'fdr_p' | 'spatial_robustness' | 'validation_score' | 'agreement' | 'pattern' | 'scan_effect' | 'upload'
export interface ScanEffectRegion { region_id: number; region_name: string; mean_control: number; mean_patient: number; percent_difference: number; effect_d: number; p: number; fdr_p: number }
export interface ScanEffects { n_control: number; n_patient: number; caveat: string; n_regions_fdr_below_0_05: number; regions: ScanEffectRegion[] }
export interface RegionGene { gene: string; weight: number; expression: number; score: number }
export interface RegionTopGenes { caveat: string; method: string; diseases: Record<string, Record<string, RegionGene[]>> }
export interface TypicalPatterns { caveat: string; references: string[]; patterns: Record<string, Record<string, number>> }
export type Hemisphere = 'whole' | 'L' | 'R'
export type ViewPreset = 'reset' | 'left' | 'right' | 'anterior' | 'posterior' | 'superior' | 'inferior'

export interface RegionRecord {
  region_id: number
  region_name: string
  atlas_id: string
  atlas_label: string
  hemisphere: 'L' | 'R' | 'B'
  broad_system: string
  centroid_mni: [number, number, number]
  observed_score: number
  random_mean: number
  random_std: number
  z_score: number
  empirical_p: number
  fdr_p: number
  effect_size: number
  number_of_genes: number
  spatial_null_p: number
  spatial_null_fdr: number
  spatial_robustness: number
  spatial_robustness_label: 'robust' | 'not_robust'
  robustness_rank: number
  spatial_isolate: boolean
  validation_score: number | null
  validation_region: string | null
  validation_mapping_confidence: 'high' | 'medium' | null
  agreement_status: 'high_prediction_high_validation' | 'high_prediction_low_validation' | 'low_prediction_high_validation' | 'low_prediction_low_validation' | 'not_measured'
  biology: RegionBiology | null
}

export interface BiologicalGene {
  gene: string
  expression: number
  l2g_score: number
  weighted_contribution: number
  regional_rank: number
}

export interface BiologicalPathway {
  id: string
  name: string
  fdr: number
  genes: string[]
}

export interface BiologicalCellType {
  name: string
  fdr: number
  genes: string[]
}

export interface RegionBiology {
  region_id: number
  selected_for_regional_interpretation: boolean
  selection_rule: string
  robustness_rank: number | null
  top_genes: BiologicalGene[]
  pathways: BiologicalPathway[]
  cell_types: BiologicalCellType[]
}

export interface BiologicalInterpretationData {
  schema_version: string
  generated_on: string
  evidence_note: string
  regions: RegionBiology[]
}

export interface EnrichmentData {
  schema_version: string
  disease_id: string
  disease_name: string
  gene_set_version: string
  source_file: string
  generated_on: string
  regions: RegionRecord[]
}

export interface ExcludedDisease {
  disease_id: string
  disease_name: string
  status: 'needs_review' | 'excluded'
  reason: string
}

export interface MultidiseaseAtlas {
  schema_version: string
  generated_on: string
  primary_metric: string
  comparison_note: string
  z_domain: [number, number]
  pearson_similarity: Array<{ disease_1: string; disease_2: string; correlation: number; p_value: number; n_regions: number }>
  diseases: EnrichmentData[]
  excluded_or_needs_review: ExcludedDisease[]
}

export interface GeometryRegion {
  region_id: number
  positions: number[]
  indices: number[]
  voxel_count: number
  source?: string
}

export interface GeometryMesh {
  positions: number[]
  indices: number[]
}

export interface AtlasGeometry {
  schema_version: string
  atlas: string
  coordinate_system: string
  region_count: number
  anatomy?: GeometryMesh
  geometry_source?: string
  label_rule?: string
  regions: GeometryRegion[]
}

export interface ProjectMetadata {
  project: string
  title: string
  generated_on: string
  counts: Record<string, number>
  analysis: {
    fdr_threshold: number
    significant_regions: number
    primary_gene_set: string
    gwas_accession: string
    gwas_title: string
    gene_prioritization: string
    null_model: string
    null_draws_available: boolean
    null_summary_available: boolean
    null_summary_note: string
    spatial_sensitivity: {
      method: string
      neighbor_definition: string
      permutations: number
      global_statistic: string
      global_p: number
      robust_rule: string
      robust_regions: number
      isolated_regions: number
    }
    independent_validation: {
      dataset: string
      phenotype: string
      matched_validation_units: number
      mapped_aal3_regions: number
      pearson_r: number
      pearson_p: number
      pearson_ci: [number, number]
      spearman_rho: number
      spearman_p: number
      spatial_null_p: number
      interpretation: 'SUPPORTED' | 'PARTIALLY SUPPORTED' | 'NOT SUPPORTED'
      independence_note: string
      substantia_nigra: string
    }
    biological_interpretation: {
      status: string
      primary_gene_set: string
      genes_analyzed: number
      genes_represented_in_ahba: number
      background: string
      go_significant_terms: number
      reactome_significant_pathways: number
      ranked_significant_pathways: number
      cell_types_significant: number
      supported_region_pathway_rows: number
      region_rule: string
      interpretation_note: string
    }
  }
  metrics: Record<string, { label: string; domain?: number[]; threshold?: number; scale: string }>
  atlas: Record<string, unknown>
  sources: Array<{ name: string; url: string }>
}
