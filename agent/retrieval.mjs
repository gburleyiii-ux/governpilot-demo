import { readdir, readFile } from "node:fs/promises";

const knowledgeUrl = new URL("../knowledge/", import.meta.url);
const stopWords = new Set([
  "about",
  "after",
  "also",
  "and",
  "are",
  "before",
  "both",
  "but",
  "can",
  "for",
  "from",
  "has",
  "have",
  "into",
  "must",
  "not",
  "that",
  "the",
  "then",
  "this",
  "until",
  "when",
  "with",
]);

function tokenize(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 2 && !stopWords.has(token));
}

function termFrequency(tokens) {
  const counts = new Map();
  for (const token of tokens) {
    counts.set(token, (counts.get(token) || 0) + 1);
  }
  return counts;
}

function vectorNorm(vector) {
  let sum = 0;
  for (const value of vector.values()) {
    sum += value * value;
  }
  return Math.sqrt(sum);
}

function cosineSimilarity(left, right) {
  const leftNorm = vectorNorm(left);
  const rightNorm = vectorNorm(right);
  if (leftNorm === 0 || rightNorm === 0) return 0;

  let dot = 0;
  for (const [token, leftWeight] of left.entries()) {
    dot += leftWeight * (right.get(token) || 0);
  }
  return dot / (leftNorm * rightNorm);
}

function buildVector(tokens, idf) {
  const counts = termFrequency(tokens);
  const vector = new Map();
  for (const [token, count] of counts.entries()) {
    const weight = (1 + Math.log(count)) * (idf.get(token) || 0);
    if (weight > 0) vector.set(token, weight);
  }
  return vector;
}

function buildExcerpt(content, queryTerms) {
  const paragraphs = content
    .replace(/^#\s+.+$/m, "")
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.replace(/\s+/g, " ").trim())
    .filter(Boolean);
  const ranked = paragraphs
    .map((paragraph) => {
      const paragraphTokens = new Set(tokenize(paragraph));
      const matches = [...queryTerms].filter((term) => paragraphTokens.has(term)).length;
      return { paragraph, matches };
    })
    .sort((a, b) => b.matches - a.matches || b.paragraph.length - a.paragraph.length);
  return (ranked[0]?.paragraph || paragraphs[0] || content).slice(0, 320);
}

export function buildKnowledgeIndex(documents) {
  const tokenizedDocuments = documents.map((document) => ({
    ...document,
    tokens: tokenize(`${document.title} ${document.content}`),
  }));
  const documentFrequency = new Map();
  for (const document of tokenizedDocuments) {
    for (const token of new Set(document.tokens)) {
      documentFrequency.set(token, (documentFrequency.get(token) || 0) + 1);
    }
  }
  const idf = new Map();
  for (const [token, frequency] of documentFrequency.entries()) {
    idf.set(token, Math.log((1 + documents.length) / (1 + frequency)) + 1);
  }
  return {
    algorithm: "local-tfidf-cosine-v1",
    documentCount: documents.length,
    vocabularySize: idf.size,
    idf,
    documents: tokenizedDocuments.map((document) => ({
      ...document,
      vector: buildVector(document.tokens, idf),
    })),
  };
}

export async function loadKnowledgeDocuments() {
  const files = (await readdir(knowledgeUrl)).filter((file) => file.endsWith(".md")).sort();
  return Promise.all(
    files.map(async (file) => {
      const content = await readFile(new URL(file, knowledgeUrl), "utf8");
      const title = content.match(/^#\s+(.+)$/m)?.[1] || file.replace(/\.md$/, "");
      return {
        id: file.replace(/\.md$/, ""),
        title,
        path: `knowledge/${file}`,
        content,
      };
    }),
  );
}

export async function retrievePolicyContext(query, limit = 3) {
  const documents = await loadKnowledgeDocuments();
  const index = buildKnowledgeIndex(documents);
  const queryTokens = tokenize(query);
  const queryTerms = new Set(queryTokens);
  const queryVector = buildVector(queryTokens, index.idf);
  return index.documents
    .map((document) => {
      const matchedTerms = [...new Set(document.tokens)].filter((token) => queryTerms.has(token)).sort();
      const rawScore = cosineSimilarity(queryVector, document.vector);
      return {
        id: document.id,
        title: document.title,
        path: document.path,
        score: Number((rawScore * 100).toFixed(2)),
        excerpt: buildExcerpt(document.content, queryTerms),
        retrieval: {
          algorithm: index.algorithm,
          documentCount: index.documentCount,
          vocabularySize: index.vocabularySize,
          matchedTerms: matchedTerms.slice(0, 12),
        },
      };
    })
    .filter((document) => document.score > 0)
    .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title))
    .slice(0, limit);
}
