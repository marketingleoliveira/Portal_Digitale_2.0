import {isIP} from 'node:net';
import {publicAddress} from './prospecting-verification.mjs';

export function publicEmailScanAddress(ip) {
  if (!publicAddress(ip)) return false;

  if (isIP(ip) === 4) {
    const [a,b,c] = ip.split('.').map(Number);

    // Redes reservadas, documentacao e usos especiais.
    if (a === 198 && b === 51 && c === 100) return false;
    if (a === 203 && b === 0 && c === 113) return false;
    if (a === 192 && b === 88 && c === 99) return false;

    // Outras faixas especiais.
    if (a === 192 && b === 0 && c === 0) return false;
    if (a === 198 && b === 19) return false;
  }

  return true;
}

export function validateEmailScanUrl(value) {
  let url;

  try {
    url = new URL(value);
  } catch {
    throw Error('email_scan_invalid_url');
  }

  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    (url.port && !['80','443'].includes(url.port))
  ) {
    throw Error('email_scan_invalid_url');
  }

  if (isIP(url.hostname) && !publicEmailScanAddress(url.hostname)) {
    throw Error('email_scan_non_public_address');
  }

  return url;
}
