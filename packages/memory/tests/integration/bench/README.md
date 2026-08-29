# The memory bench — a reproducible measure for local-first memory

This is the corpus and harness UGO uses to prove its retrieval does not drift.
It is intentionally public: a companion that remembers must be **measurable**,
or "it remembers" is a marketing claim. The same rule should apply to anyone
building a local-first companion — so here is the bench, open.

## What it measures

Real infrastructure, not mocks: Postgres 16 + pgvector, a real `nomic-embed-text`
Ollama model, 22 Italian memories, 13 questions, `k = 5`, clock frozen at
2026-08-11T12:00:00Z. Families:

| Family | Question | Why it exists |
|--------|----------|---------------|
| temporale | «cosa si è rotto in casa?» | a fresh episode must beat an old fact |
| contraddizione | «come si chiama il gatto?» | a retired fact must stay dead |
| semantica | «come si chiama il gatto?» | cosine similarity against the Italian text |
| lessicale | «GK492NR» | exact tokens the vector arm misses |
| astensione | no-answer questions | the judge must say «non lo so» |

Full baseline and history of the measurements live in [`BASELINE.md`](./BASELINE.md).

## How to run it

```bash
# first time on a machine without the models cached
mkdir -p ~/.ugo-ollama
UGO_TEST_OLLAMA_MODELS=~/.ugo-ollama pnpm --filter @ugo/memory test:integration
```

The run needs Docker (Postgres) and Ollama (the embedder). On CI the models are
cached between runs; the cache key is `ollama-nomic-embed-text-v1`.

## How to add a family

1. Add the memories to `corpus.it.json` (they are inserted into a fresh DB per
   run) and the question to the same file.
2. Write the assertion in `memoryBench.integration.test.ts`: `expect` what the
   rank should be, then measure. If the number is a measurement and not a
   guarantee, print it and assert the structural property (e.g. "episode must
   beat fact"), not a fitted threshold.
3. Update `BASELINE.md`.

The only hard rules are the ones the project holds itself to:

- **no fitted margins** on the model you happen to run today — the bench is
  there to catch drift, not to bless one checkpoint;
- **no `vi.mock`** on the database or the embedder — a bench that fakes the
  network proves the fake, not the memory;
- **no content in logs** — ids and counts only.

## Why Italian?

The corpus is in Italian because the product is. The *method* transfers:
families, frozen clock, hybrid retrieval. If you have a corpus in another
language, the harness is the thing to reuse — the questions are the contract.