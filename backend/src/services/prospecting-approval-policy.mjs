
// DIGITALE — POLÍTICA DE APROVAÇÃO
// Não atribuir novos leads à Nicolle ou ao CRM.
// CNPJ + telefone + CNAE permitido: APROVADO.
// E-mail válido: também elegível para o Disparo.

export const APPROVED_DESTINATION = 'IA_DIGITALE';
export const APPROVED_MENU = 'APROVADOS';

export function normalizeCnpj(value) {
  return String(value || '').replace(/\D/g, '');
}

export function validCnpj(value) {
  const cnpj = normalizeCnpj(value);

  if (!/^\d{14}$/.test(cnpj)) return false;
  if (/^(\d)\1{13}$/.test(cnpj)) return false;

  const digit = length => {
    const weights = length === 12
      ? [5,4,3,2,9,8,7,6,5,4,3,2]
      : [6,5,4,3,2,9,8,7,6,5,4,3,2];

    const sum = weights.reduce(
      (total, weight, i) => total + Number(cnpj[i]) * weight, 0
    );

    const remainder = sum % 11;
    return remainder < 2 ? 0 : 11 - remainder;
  };

  return Number(cnpj[12]) === digit(12) &&
         Number(cnpj[13]) === digit(13);
}

export function normalizePhone(value) {
  let number = String(value || '').replace(/\D/g, '');

  if (number.startsWith('55') && number.length > 11)
    number = number.slice(2);

  return number;
}

export function validPhone(value) {
  const number = normalizePhone(value);

  if (!/^[1-9][0-9]\d{8,9}$/.test(number))
    return false;

  if (/^(\d)\1+$/.test(number))
    return false;

  return true;
}

export function validEmail(value) {
  const email = String(value || '').trim().toLowerCase();

  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function normalizeCnae(value) {
  return String(value || '').replace(/\D/g, '');
}

export function evaluateApproval(company, allowedCnaes = ['1412601']) {
  const cnpj = normalizeCnpj(company.cnpj);
  const phone = normalizePhone(company.phone || company.telefone);
  const email = String(company.email || '').trim().toLowerCase();

  const cnaes = [
    company.cnae,
    company.cnae_principal,
    ...(Array.isArray(company.cnaes) ? company.cnaes : []),
    ...(Array.isArray(company.cnaes_secundarios)
      ? company.cnaes_secundarios : [])
  ].map(normalizeCnae);

  const permitted = allowedCnaes
    .map(normalizeCnae)
    .some(cnae => cnaes.includes(cnae));

  // Exige confirmação explícita de que não é MEI.
  const meiValue = company.mei;
  const meiText = String(meiValue ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();

  const mei = (
    meiValue === false || meiValue === 0 ||
    ['nao', 'false', '0'].includes(meiText)
  ) ? false : (
    meiValue === true || meiValue === 1 ||
    ['sim', 'true', '1'].includes(meiText)
  ) ? true : null;

  // BrasilAPI utiliza 2; outras fontes usam 02 ou ATIVA.
  const status = String(company.situacao_cadastral ?? '')
    .trim().toUpperCase();

  const active = ['2', '02', 'ATIVA'].includes(status);

  const approved =
    validCnpj(cnpj) &&
    validPhone(phone) &&
    permitted &&
    mei === false &&
    active;

  return {
    approved,
    cnpj,
    phone,
    email: validEmail(email) ? email : null,
    sendToDisparo: approved && validEmail(email),
    destination: approved ? APPROVED_DESTINATION : null,
    menu: approved ? APPROVED_MENU : null,
    sendToNicolle: false,
    sendToCrm: false,
    reason: !validCnpj(cnpj) ? 'cnpj_invalido'
      : !validPhone(phone) ? 'telefone_invalido'
      : !permitted ? 'cnae_nao_permitido'
      : mei === true ? 'mei'
       : mei === null ? 'mei_status_unconfirmed'
      : !active ? 'empresa_inativa'
      : null
  };
}
