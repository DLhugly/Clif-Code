export interface SimilarityScore {
  a: number;
  b: number;
  file_overlap: number;
  title_similarity: number;
  diff_hash_overlap: number;
  combined: number;
}

export interface RelatedPr {
  pr_number: number;
  title: string;
  author: string;
  score: SimilarityScore;
}
