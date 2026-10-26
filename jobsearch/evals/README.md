# Quality evals

`npm run eval` runs the model-quality checks against the real OpenAI models (≈ $0.30 per run, ~2 minutes). They are **not** part of `npm test`/CI — run them before and after any prompt or model change and compare `evals/reports/<date>.json`.

| Suite | What it measures | Gate |
|---|---|---|
| `level inference` | `inferCandidateLevel` vs recruiter labels (`datasets/level.json`) | accuracy ≥ 90% |
| `reranker fit` | reranker fit (0–100) vs recruiter labels on 23 résumé×posting pairs (`datasets/match.json`) | pairwise order ≥ 85%, Spearman ≥ 0.75, MAE ≤ 15 |
| `interview debrief` | `finalFeedback` on 3 transcripts: score band, must-mention facts, no invented experience, LLM judge (specificity/honesty/actionability/tone) | no inventions, judge avg ≥ 3.5, honesty ≥ 4 |

Adding a case: append to the dataset JSON with the label a recruiter would give; keep labels honest (they are the ground truth everything is measured against). When a gate fails after a change, the report's `worst` list says where.
