// DIGITALE_FEEDBACK_LEARNING_V1
// Analise de feedback comercial. Sem bloqueio automatico.

const STOPWORDS = new Set([
  'de','da','do','das','dos','e','em','para',
  'com','uma','um','a','o','as','os','www',
  'combr','brasil','ltda','mei','eireli',
  'empresa','site','oficial','loja'
]);

export function normalizeFeedbackText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function extractBusinessSignals(value) {
  const text = normalizeFeedbackText(value);

  return [...new Set(
    text.split(' ')
      .filter(word =>
        word.length >= 4 &&
        !STOPWORDS.has(word) &&
        !/^\d+$/.test(word)
      )
  )];
}

export function learnRejectedPatterns(
  examples = [],
  minimum = 5
) {
  const frequency = new Map();
  const companies = new Set();

  for (const example of examples) {
    const id = String(
      example.cnpj || example.id || ''
    ).trim();

    if (!id || companies.has(id)) continue;
    companies.add(id);

    // Somente evidencias comerciais verificadas.
    // Nunca utilizar a descricao automatica do CRM.
    const evidence = String(
      example.commercial_evidence || ''
    );

    const signals = extractBusinessSignals(evidence);

    for (const signal of signals) {
      frequency.set(
        signal,
        (frequency.get(signal) || 0) + 1
      );
    }
  }

  const threshold = Math.max(
    5,
    Math.trunc(Number(minimum) || 5)
  );

  const patterns = [...frequency.entries()]
    .filter(([, count]) => count >= threshold)
    .map(([signal, count]) => ({
      signal,
      occurrences: count,
      sample_size: companies.size,
      frequency: count / companies.size
    }))
    .sort((a, b) => b.occurrences - a.occurrences);

  return {
    version: 2,
    total_examples: companies.size,
    minimum_occurrences: threshold,
    patterns,
    automatic_rejection: false
  };
}

export function assessFeedbackRisk(description, learning) {
  const signals = new Set(extractBusinessSignals(description));

  const matches = (learning?.patterns || [])
    .filter(pattern => signals.has(pattern.signal));

  return {
    classification: matches.length
      ? 'revisao_recomendada'
      : 'sem_alerta_de_feedback',
    matched_patterns: matches,
    automatic_rejection: false
  };
}

// Consulta feedback comercial do Agendor no MariaDB.
// Nao altera negocios, classificacoes ou entregas.
export async function loadOutsideProfileFeedback(
  db,
  { ownerId, limit = 200 } = {}
) {
  if (typeof ownerId !== 'string' ||
      !/^[a-f0-9-]{36}$/i.test(ownerId)) {
    throw new Error('invalid_feedback_owner');
  }

  const safeLimit = Math.max(
    1,
    Math.min(500, Math.trunc(Number(limit) || 200))
  );

  const [rows] = await db.execute(`
    SELECT
      d.id,
      o.cnpj,
      o.name AS company,
      o.website,
      d.description AS business_description,
      d.loss_reason,
      d.closed_at,
      d.source
    FROM crm_deals d
    JOIN crm_organizations o
      ON o.id = d.organization_id
    WHERE d.status = 'perdido'
      AND d.owner_user_id = ?
      AND LOWER(
        TRIM(
          REGEXP_REPLACE(
            REPLACE(
              REPLACE(COALESCE(d.loss_reason, ''), '_', ' '),
              '-', ' '
            ),
            '[[:space:]]+', ' '
          )
        )
      ) IN ('fora de perfil', 'fora do perfil')
      AND d.source = 'IA PROSPECÇÃO'
    ORDER BY d.closed_at DESC, d.id
    LIMIT ${safeLimit}
  `, [ownerId]);

  return rows.map(row => ({
    ...row,
    feedback_type: 'fora_de_perfil',
    original_classification: null
  }));
}

// Avaliacao comercial baseada em evidencias.
// Nao realiza rejeicao automatica.
export function evaluateCommercialEvidence({
  websiteText = '',
  buyerSegment = null,
  feedbackRisk = null
} = {}) {
  const text = normalizeFeedbackText(websiteText);

  const manufacturingEvidence =
    /\bconfeccao\b|\bfabricamos\b|\bfabricante\b|\bproducao propria\b|\bfabrica\b|\bprivate label\b|\bfaccao\b/.test(text);

  const resaleEvidence =
    /\brevenda\b|\brevendedor\b|\bmultimarcas\b|\bprodutos importados\b|\bimportadora\b/.test(text);

  const textileEvidence =
    /\bcompramos tecidos\b|\bcompra de tecidos\b|\btecidos para confeccao\b|\bfornecimento de tecidos\b/.test(text);

  const reasons = [];

  if (manufacturingEvidence) {
    reasons.push('Evidencia de fabricacao ou confeccao');
  }

  if (textileEvidence) {
    reasons.push('Evidencia de atividade relacionada a tecidos');
  }

  if (resaleEvidence) {
    reasons.push('Evidencia de revenda ou importacao');
  }

  if (feedbackRisk?.classification === 'revisao_recomendada') {
    reasons.push('Semelhanca com registros comerciais rejeitados');
  }

  const positive =
    manufacturingEvidence ||
    textileEvidence ||
    buyerSegment === 'confeccao' ||
    buyerSegment === 'comprador_tecidos';

  return {
    version: 1,
    classification: positive
      ? 'potencial_comprador'
      : 'perfil_nao_confirmado',
    manufacturing_evidence: manufacturingEvidence,
    resale_evidence: resaleEvidence,
    textile_evidence: textileEvidence,
    reasons,
    requires_review:
      !positive ||
      feedbackRisk?.classification === 'revisao_recomendada',
    automatic_rejection: false
  };
}
