// Compatibilidade após migração do Portal Digitale.
// O sistema NÃO utiliza mais Supabase em runtime.
// Chamadas antigas são redirecionadas para o backend local.

export * from '../local/client';
