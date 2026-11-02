# AI evaluation runs

Newest first. `make ai-eval` (real provider) / `--fast` (mock).

## 2026-11-02 06:54 UTC — provider `mock`

| case | result | note |
|---|---|---|
| verifier-good-open-uz | pass | valid=True |
| verifier-wrong-mcq-en | skip | model-quality case (real provider only) |
| verifier-ambiguous-ru | skip | model-quality case (real provider only) |
| verifier-off-topic-uz | skip | model-quality case (real provider only) |
| verifier-injection-uz | pass | valid=False |
| questions-uz | pass | 4 questions, languages=['uz'] |
| questions-ru | pass | 3 questions, languages=['ru'] |
| task-en | pass | 5 hidden tests |
| review-good | pass | 80.0%, injection=False |
| review-weak | pass | 40.0%, injection=False |
| review-injection-comment | pass | 40.0%, injection=True |
| review-injection-paraphrased | skip | model-quality case (real provider only) |

## 2026-11-02 06:29 UTC — provider `mock`

| case | result | note |
|---|---|---|
| verifier-good-open-uz | pass | valid=True |
| verifier-wrong-mcq-en | skip | model-quality case (real provider only) |
| verifier-ambiguous-ru | skip | model-quality case (real provider only) |
| verifier-off-topic-uz | skip | model-quality case (real provider only) |
| verifier-injection-uz | pass | valid=False |
| questions-uz | pass | 4 questions, languages=['uz'] |
| questions-ru | pass | 3 questions, languages=['ru'] |
| task-en | pass | 5 hidden tests |
| review-good | pass | 80.0%, injection=False |
| review-weak | pass | 40.0%, injection=False |
| review-injection-comment | pass | 40.0%, injection=True |
| review-injection-paraphrased | skip | model-quality case (real provider only) |

## 2026-11-02 06:28 UTC — provider `mock`

| case | result | note |
|---|---|---|
| verifier-good-open-uz | pass | valid=True |
| verifier-wrong-mcq-en | skip | model-quality case (real provider only) |
| verifier-ambiguous-ru | skip | model-quality case (real provider only) |
| verifier-off-topic-uz | skip | model-quality case (real provider only) |
| verifier-injection-uz | pass | valid=False |
| questions-uz | pass | 4 questions, languages=['uz'] |
| questions-ru | pass | 3 questions, languages=['ru'] |
| task-en | pass | 5 hidden tests |
| review-good | pass | 80.0%, injection=False |
| review-weak | pass | 40.0%, injection=False |
| review-injection-comment | fail | 80.0%, injection=True |
| review-injection-paraphrased | fail | 80.0%, injection=False |

## 2026-10-30 11:17 UTC — provider `mock`

| case | result | note |
|---|---|---|
| verifier-good-open-uz | pass | valid=True |
| verifier-wrong-mcq-en | skip | model-quality case (real provider only) |
| verifier-ambiguous-ru | skip | model-quality case (real provider only) |
| verifier-off-topic-uz | skip | model-quality case (real provider only) |
| verifier-injection-uz | pass | valid=False |
| questions-uz | pass | 4 questions, languages=['uz'] |
| questions-ru | pass | 3 questions, languages=['ru'] |
| task-en | pass | 5 hidden tests |

