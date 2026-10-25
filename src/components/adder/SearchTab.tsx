import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { AlertCircle, Clock, Globe, Loader2, Search } from 'lucide-react';
import type { FoodItem } from '../../types/nutrition';
import { db } from '../../db/localDb';
import { FoodApiError, MIN_QUERY_LENGTH, isAbortError, searchLocal, searchRemote } from '../../services/foodApi';
import { useDebounce, useOnlineStatus } from '../../hooks/useDebounce';
import { normalizeText } from '../../utils/common';
import { FoodRow } from './FoodRow';

interface SearchTabProps {
  onSelect: (food: FoodItem) => void;
}

export function SearchTab({ onSelect }: SearchTabProps) {
  const [query, setQuery] = useState('');
  const debounced = useDebounce(query, 400);
  const [requestRemote, setRequestRemote] = useState(false);
  const [local, setLocal] = useState<FoodItem[]>([]);
  const [remote, setRemote] = useState<FoodItem[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const online = useOnlineStatus();

  const recent = useLiveQuery(
    () => db.foods.orderBy('lastUsedAt').reverse().filter((f) => f.lastUsedAt > 0).limit(8).toArray(),
    [],
  );

  const q = debounced.trim();
  const queryReady = normalizeText(q).length >= MIN_QUERY_LENGTH;

  useEffect(() => {
    if (!queryReady) return;

    const ctrl = new AbortController();
    let active = true;

    void (async () => {
      // 1) Önce yerel veritabanı
      const loc = await searchLocal(q);
      if (!active) return;
      setLocal(loc);
      setRemote(null);
      setError('');

      // 2) Yerelde yoksa (veya kullanıcı isterse) Open Food Facts
      if (loc.length > 0 && !requestRemote) return;
      setLoading(true);
      try {
        const { foods } = await searchRemote(q, ctrl.signal);
        if (active) setRemote(foods.filter((f) => !loc.some((l) => l.id === f.id)));
      } catch (err) {
        if (isAbortError(err) || !active) return;
        setError(err instanceof FoodApiError ? err.message : 'Beklenmeyen bir hata oluştu.');
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
      ctrl.abort();
    };
  }, [q, queryReady, requestRemote]);

  const typingTooShort = query.trim().length > 0 && normalizeText(query).length < MIN_QUERY_LENGTH;

  const displayedLocal = queryReady ? local : [];
  const displayedRemote = queryReady ? remote : null;

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-500" />
        <input
          autoFocus
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setRequestRemote(false);
          }}
          placeholder="Besin ara… (örn. ülker protein bar, lor, yulaf)"
          className="input py-2.5 pl-9"
        />
        {loading && <Loader2 className="absolute top-1/2 right-3 size-4 -translate-y-1/2 animate-spin text-emerald-400" />}
      </div>

      {typingTooShort && <p className="text-xs text-slate-500">En az {MIN_QUERY_LENGTH} karakter yazın.</p>}

      {/* Boş sorgu → son kullanılanlar */}
      {!query.trim() && (
        <section>
          <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold tracking-wide text-slate-400 uppercase">
            <Clock className="size-3.5" /> Son kullanılanlar
          </h3>
          {recent && recent.length > 0 ? (
            <div className="space-y-2">
              {recent.map((f) => (
                <FoodRow key={f.id} food={f} onSelect={onSelect} />
              ))}
            </div>
          ) : (
            <p className="rounded-xl border border-dashed border-slate-800 p-4 text-center text-xs text-slate-500">
              Henüz besin eklemediniz. Arama yapın ya da "Kayıtlı Besinler" sekmesinden başlayın.
            </p>
          )}
        </section>
      )}

      {displayedLocal.length > 0 && (
        <section>
          <h3 className="mb-2 text-xs font-semibold tracking-wide text-slate-400 uppercase">Kayıtlı eşleşmeler</h3>
          <div className="space-y-2">
            {displayedLocal.map((f) => (
              <FoodRow key={f.id} food={f} onSelect={onSelect} />
            ))}
          </div>
          {!requestRemote && displayedRemote === null && (
            <button
              onClick={() => setRequestRemote(true)}
              disabled={!online}
              className="btn-ghost mt-2 w-full text-xs text-sky-300"
            >
              <Globe className="size-4" /> Open Food Facts'te de ara
            </button>
          )}
        </section>
      )}

      {error && (
        <div className="flex items-start gap-2 rounded-xl bg-rose-500/10 px-3 py-2.5 text-xs text-rose-300">
          <AlertCircle className="mt-0.5 size-4 shrink-0" /> {error}
        </div>
      )}

      {displayedRemote && (
        <section>
          <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold tracking-wide text-slate-400 uppercase">
            <Globe className="size-3.5" /> Open Food Facts
          </h3>
          {displayedRemote.length > 0 ? (
            <div className="space-y-2">
              {displayedRemote.map((f) => (
                <FoodRow key={f.id} food={f} onSelect={onSelect} />
              ))}
            </div>
          ) : (
            <p className="text-center text-xs text-slate-500">"{q}" için sonuç bulunamadı. Manuel giriş sekmesini deneyin.</p>
          )}
        </section>
      )}
    </div>
  );
}
