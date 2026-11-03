// DIGITALE_COMMERCIAL_EVIDENCE_V2
// Extracao de evidencias para auditoria.
// Nenhuma alteracao na producao.

import {
  normalizeFeedbackText
} from './prospecting-feedback-learning.mjs';

const RULES = [
  {
    type: 'fabricacao',
    regex: /\b(fabricamos|somos uma confeccao|somos uma fabrica|producao propria|private label)\b/
  },
  {
    type: 'compra_tecidos',
    regex: /\b(compramos tecidos|compra de tecidos|tecidos para confeccao)\b/
  },
  {
    type: 'revenda',
    regex: /\b(revenda|multimarcas|produtos importados)\b/
  }
];

export function extractCommercialEvidence(pages = []) {
  const evidence = [];

  for (const page of pages) {
    const text = normalizeFeedbackText(page.text || '');
    const url = String(page.url || '');

    if (!text || !/^https?:\/\//i.test(url)) continue;

    for (const rule of RULES) {
      const match = rule.regex.exec(text);
      if (!match) continue;

      const start = Math.max(0, match.index - 80);
      const end = Math.min(
        text.length,
        match.index + match[0].length + 80
      );

      evidence.push({
        type: rule.type,
        source_url: url,
        excerpt: text.slice(start, end),
        matched_term: match[0]
      });
    }
  }

  return {
    version: 2,
    evidence,
    evidence_count: evidence.length,
    automatic_rejection: false,
    production_enabled: false
  };
}
