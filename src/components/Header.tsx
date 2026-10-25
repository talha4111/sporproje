import { CalendarDays, ChevronLeft, ChevronRight, Dumbbell, Smartphone, UserCog, WifiOff } from 'lucide-react';
import { useNutritionStore } from '../store/useNutritionStore';
import { addDays, formatDateLabel, isValidDateKey, todayKey } from '../utils/date';
import { useOnlineStatus } from '../hooks/useDebounce';

interface HeaderProps {
  onOpenProfile: () => void;
  onOpenMobile: () => void;
}

export function Header({ onOpenProfile, onOpenMobile }: HeaderProps) {
  const selectedDate = useNutritionStore((s) => s.selectedDate);
  const setSelectedDate = useNutritionStore((s) => s.setSelectedDate);
  const name = useNutritionStore((s) => s.profile.name);
  const online = useOnlineStatus();
  const isToday = selectedDate === todayKey();

  return (
    <header className="sticky top-0 z-40 border-b border-slate-800 bg-slate-950/85 backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3">
        <div className="flex items-center gap-2.5">
          <div className="flex size-9 items-center justify-center rounded-xl bg-emerald-600/15 text-emerald-400">
            <Dumbbell className="size-5" />
          </div>
          <div className="leading-tight">
            <h1 className="text-base font-bold text-slate-100">Makro Takip</h1>
            <p className="text-[11px] text-slate-500">{name ? `Merhaba, ${name}` : 'Günlük kalori & makro'}</p>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          {!online && (
            <span className="mr-1 hidden items-center gap-1 rounded-full bg-amber-500/10 px-2 py-1 text-[11px] text-amber-400 sm:inline-flex">
              <WifiOff className="size-3.5" /> Çevrimdışı
            </span>
          )}
          <button
            onClick={onOpenMobile}
            className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1.5 text-xs font-medium text-emerald-300 transition-colors hover:bg-emerald-500/20"
            title="Telefonda QR Kod ile Aç & Eşitle"
          >
            <Smartphone className="size-4" />
            <span className="hidden sm:inline">Telefonda Aç</span>
          </button>
          <button onClick={onOpenProfile} className="btn-icon" aria-label="Profil ve hedefler">
            <UserCog className="size-5" />
          </button>
        </div>
      </div>

      {/* Tarih seçici */}
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-2 px-4 pb-3">
        <button onClick={() => setSelectedDate(addDays(selectedDate, -1))} className="btn-icon" aria-label="Önceki gün">
          <ChevronLeft className="size-5" />
        </button>

        <div className="flex items-center gap-2">
          <label className="relative flex cursor-pointer items-center gap-2 rounded-xl px-3 py-1.5 hover:bg-slate-900">
            <CalendarDays className="size-4 text-emerald-400" />
            <span className="text-sm font-semibold capitalize text-slate-100">{formatDateLabel(selectedDate)}</span>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => isValidDateKey(e.target.value) && setSelectedDate(e.target.value)}
              className="absolute inset-0 cursor-pointer opacity-0"
              aria-label="Tarih seç"
            />
          </label>
          {!isToday && (
            <button onClick={() => setSelectedDate(todayKey())} className="chip">
              Bugün
            </button>
          )}
        </div>

        <button onClick={() => setSelectedDate(addDays(selectedDate, 1))} className="btn-icon" aria-label="Sonraki gün">
          <ChevronRight className="size-5" />
        </button>
      </div>
    </header>
  );
}
