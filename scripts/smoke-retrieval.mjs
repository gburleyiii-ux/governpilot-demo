import { buildKnowledgeIndex, loadKnowledgeDocuments, retrievePolicyContext } from "../agent/retrieval.mjs";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const documents = await loadKnowledgeDocuments();
const index = buildKnowledgeIndex(documents);

assert(index.algorithm === "local-tfidf-cosine-v1", `unexpected retrieval algorithm ${index.algorithm}`);
assert(index.documentCount >= 5, `expected at least 5 knowledge docs, received ${index.documentCount}`);
assert(index.vocabularySize >= 60, `expected meaningful vocabulary size, received ${index.vocabularySize}`);

const cases = [
  {
    query: "write capable external action group approval rollback audit retention scoped service account",
    expectedTop: "tool-approval-standard",
  },
  {
    query: "prompt injection hidden command instruction override exfiltration adversarial red team",
    expectedTop: "prompt-injection-standard",
  },
  {
    query: "retrieval drift allowlist source provenance stale policy citations governance memory",
    expectedTop: "retrieval-policy-standard",
  },
  {
    query: "evidence packet reviewer signatures latest event trail hash linked audit export",
    expectedTop: "audit-evidence-standard",
  },
];

const results = [];
for (const testCase of cases) {
  const citations = await retrievePolicyContext(testCase.query, 3);
  assert(citations.length > 0, `expected citations for query: ${testCase.query}`);
  assert(citations[0].id === testCase.expectedTop, `expected ${testCase.expectedTop}, received ${citations[0].id}`);
  assert(citations[0].score > 0, `expected positive score for ${testCase.expectedTop}`);
  assert(citations[0].retrieval.algorithm === index.algorithm, "expected citation retrieval algorithm metadata");
  assert(citations[0].retrieval.matchedTerms.length > 0, "expected matched terms in citation metadata");
  results.push({
    expectedTop: testCase.expectedTop,
    actualTop: citations[0].id,
    score: citations[0].score,
    matchedTerms: citations[0].retrieval.matchedTerms.slice(0, 6),
  });
}

console.log(
  JSON.stringify(
    {
      algorithm: index.algorithm,
      documentCount: index.documentCount,
      vocabularySize: index.vocabularySize,
      cases: results,
    },
    null,
    2,
  ),
);
