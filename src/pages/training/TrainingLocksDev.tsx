import { useCallback, useEffect, useState } from 'react';
import { ShieldCheck, Unlock, RefreshCw } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';

type BlockedUser = {
  user_id: string;
  email: string;
  user_name: string;
  reason: string;
  locked_at: string;
  lesson_title: string | null;
};

const API = '/api/training-activity-player-test';

export default function TrainingLocksDev() {
  const { session, realRole } = useAuth();

  const token =
    (session as any)?.access_token ||
    (session as any)?.token || '';

  const [users, setUsers] = useState<BlockedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (realRole !== 'dev' || !token) return;

    setLoading(true);
    setError('');

    try {
      const response = await fetch(`${API}/admin/blocked`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      const json = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          json.error?.message || `HTTP ${response.status}`
        );
      }

      setUsers(json.data?.users || []);
    } catch (err: any) {
      setError(err.message || 'Falha ao consultar bloqueios.');
    } finally {
      setLoading(false);
    }
  }, [realRole, token]);

  useEffect(() => {
    void load();
  }, [load]);

  async function unlock(item: BlockedUser) {
    if (!window.confirm(
      `Liberar treinamento para ${item.user_name}?\n` +
      `Aula: ${item.lesson_title || 'Não identificada'}\n` +
      `Motivo: ${item.reason}`
    )) return;

    setWorking(item.user_id);
    setMessage('');
    setError('');

    try {
      const response = await fetch(
        `${API}/admin/unlock/${encodeURIComponent(item.user_id)}`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` }
        }
      );

      const json = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          json.error?.message || `HTTP ${response.status}`
        );
      }

      setMessage(`Treinamento liberado para ${item.user_name}.`);
      await load();
    } catch (err: any) {
      setError(err.message || 'Falha ao desbloquear.');
    } finally {
      setWorking('');
    }
  }

  if (realRole !== 'dev') return null;

  return (
    <section className="mb-6 rounded-xl border bg-white p-5 space-y-4">
      <div className="flex flex-wrap justify-between items-center gap-3">
        <div className="flex items-center gap-3">
          <ShieldCheck className="w-7 h-7 text-[#1F3147]" />
          <div>
            <h2 className="text-lg font-bold text-[#1F3147]">
              Liberação de Aulas — Desenvolvedor
            </h2>
            <p className="text-sm text-slate-500">
              Avaliações supervisionadas bloqueadas
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="flex gap-2 items-center border rounded-lg px-4 py-2 text-sm"
        >
          <RefreshCw className="w-4 h-4" />
          Atualizar
        </button>
      </div>

      {error && (
        <p className="p-3 rounded bg-red-50 text-red-700">
          {error}
        </p>
      )}

      {message && (
        <p className="p-3 rounded bg-emerald-50 text-emerald-700">
          {message}
        </p>
      )}

      {loading ? (
        <p className="text-sm text-slate-500">
          Carregando bloqueios...
        </p>
      ) : error ? null : users.length === 0 ? (
        <p className="rounded-lg border border-dashed p-5 text-center text-slate-500">
          Nenhum usuário bloqueado.
        </p>
      ) : (
        <div className="space-y-3">
          {users.map(item => (
            <div
              key={item.user_id}
              className="flex flex-wrap justify-between items-center gap-4 border rounded-lg p-4"
            >
              <div className="space-y-1">
                <p className="font-semibold">
                  {item.user_name}
                </p>
                <p className="text-sm text-slate-500">
                  {item.email}
                </p>
                <p className="text-sm">
                  <strong>Aula:</strong>{' '}
                  {item.lesson_title || 'Não identificada'}
                </p>
                <p className="text-sm">
                  <strong>Motivo:</strong> {item.reason}
                </p>
                <p className="text-xs text-slate-500">
                  Bloqueio:{' '}
                  {new Date(item.locked_at).toLocaleString('pt-BR')}
                </p>
              </div>

              <button
                type="button"
                disabled={working === item.user_id}
                onClick={() => void unlock(item)}
                className="flex items-center gap-2 bg-[#1F3147] text-white rounded-lg px-5 py-3 text-sm font-semibold disabled:opacity-50"
              >
                <Unlock className="w-4 h-4" />
                {working === item.user_id
                  ? 'Liberando...'
                  : 'Desbloquear treinamento'}
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
