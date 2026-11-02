# Prompts

One file per role and version: `<role>.v<N>.md` (e.g. `evaluate_answer.v1.md`). Each starts by including
`_base_rules.md`. Any change bumps the version and must pass `make ai-eval` (Phase 3+).
Every stored AI result records `prompt_version` and `model`.
