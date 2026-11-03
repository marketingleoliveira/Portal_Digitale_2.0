import dns from 'node:dns/promises';
import http from 'node:http';
import https from 'node:https';

import {
  publicEmailScanAddress,
  validateEmailScanUrl
} from './prospecting-email-network-safety.mjs';

const MAX_REDIRECTS = 3;
const MAX_BYTES = 1_000_000;

export async function checkEmailScanDestination(
  value,
  {lookup = dns.lookup} = {}
) {
  const url = validateEmailScanUrl(value);

  let addresses;
  try {
    addresses = await lookup(url.hostname, {all: true});
  } catch {
    throw Error('email_scan_dns_failed');
  }

  if (
    !Array.isArray(addresses) ||
    !addresses.length ||
    addresses.some(
      item =>
        !publicEmailScanAddress(item.address) ||
        ![4, 6].includes(item.family)
    )
  ) {
    throw Error('email_scan_non_public_address');
  }

  return {url, pinned: addresses[0]};
}

export function checkEmailScanRedirect(current, location) {
  if (!location) throw Error('email_scan_invalid_redirect');

  let next;
  try {
    next = validateEmailScanUrl(new URL(location, current).href);
  } catch {
    throw Error('email_scan_invalid_redirect');
  }

  const previous = new URL(current);

  // Evita sair do site empresarial durante o rastreamento.
  if (
    next.hostname !== previous.hostname ||
    next.protocol !== previous.protocol
  ) {
    throw Error('email_scan_cross_site_redirect');
  }

  return next.href;
}

export async function getEmailScanPublic(value, hops = 0) {
  if (hops > MAX_REDIRECTS) {
    throw Error('email_scan_redirect_limit');
  }

  // A resolucao e feita antes de cada conexao.
  const {url, pinned} = await checkEmailScanDestination(value);

  const transport = url.protocol === 'https:' ? https : http;

  const response = await new Promise((resolve, reject) => {
    let settled = false;

    const fail = error => {
      if (settled) return;
      settled = true;
      reject(error);
    };

    const req = transport.get(
      url,
      {
        agent: false,
        headers: {
          'User-Agent': 'DigitaleLeadVerifier/1.0',
          'Accept': 'text/html,text/plain'
        },
        lookup: (_hostname, options, callback) => {
          if (options.all) {
            callback(null, [pinned]);
          } else {
            callback(null, pinned.address, pinned.family);
          }
        }
      },
      res => {
        const status = res.statusCode || 0;

        if ([301, 302, 303, 307, 308].includes(status)) {
          let next;

          try {
            next = checkEmailScanRedirect(
              url.href,
              res.headers.location
            );
          } catch (error) {
            res.resume();
            fail(error);
            return;
          }

          res.resume();
          if (!settled) {
            settled = true;
            resolve({redirect: next});
          }
          return;
        }

        if (status !== 200) {
          res.resume();
          fail(Error(`fonte_http_${status}`));
          return;
        }

        let size = 0;
        const chunks = [];

        res.on('data', chunk => {
          size += chunk.length;

          if (size > MAX_BYTES) {
            res.destroy(Error('email_scan_response_too_large'));
            return;
          }

          chunks.push(chunk);
        });

        res.on('error', fail);

        res.on('end', () => {
          if (settled) return;
          settled = true;

          resolve({
            url: url.href,
            body: Buffer.concat(chunks).toString('utf8')
          });
        });
      }
    );

    req.setTimeout(15000, () => {
      req.destroy(Error('fonte_timeout'));
    });

    req.on('error', fail);
  });

  if (response.redirect) {
    return getEmailScanPublic(response.redirect, hops + 1);
  }

  return response;
}
