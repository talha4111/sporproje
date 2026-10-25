import { useEffect, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { cn } from '../utils/common';

// ─── Ortak UI parçaları ───────────────────────────────────────

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
  /** Kapatma tuşunu gizle (örn. zorunlu ilk kurulum). */
  dismissible?: boolean;
}

export function Modal({ open, onClose, title, children, footer, className, dismissible = true }: ModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && dismissible) onClose();
    };
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKey);
    };
  }, [open, onClose, dismissible]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4" role="dialog" aria-modal="true">
      <div
        className="animate-fade-in absolute inset-0 bg-slate-950/80 backdrop-blur-sm"
        onClick={dismissible ? onClose : undefined}
      />
      <div
        className={cn(
          'animate-slide-up relative flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-2xl border border-slate-800 bg-slate-900 shadow-2xl sm:max-w-lg sm:rounded-2xl',
          className,
        )}
      >
        <div className="flex items-center justify-between gap-3 border-b border-slate-800 px-5 py-4">
          <h2 className="text-lg font-semibold text-slate-100">{title}</h2>
          {dismissible && (
            <button onClick={onClose} className="btn-icon" aria-label="Kapat">
              <X className="size-5" />
            </button>
          )}
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="border-t border-slate-800 px-5 py-3">{footer}</div>}
      </div>
    </div>
  );
}

interface ProgressBarProps {
  value: number;
  max: number;
  colorClass: string;
  className?: string;
}

/** Hedef aşıldığında `bg-rose-600` olur. */
export function ProgressBar({ value, max, colorClass, className }: ProgressBarProps) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  const over = max > 0 && value > max;
  return (
    <div className={cn('h-2.5 w-full overflow-hidden rounded-full bg-slate-800', className)}>
      <div
        className={cn('h-full rounded-full transition-[width,background-color] duration-700 ease-out', over ? 'bg-rose-600' : colorClass)}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

interface FieldProps {
  label: string;
  hint?: string;
  children: ReactNode;
  className?: string;
}

export function Field({ label, hint, children, className }: FieldProps) {
  return (
    <label className={cn('flex flex-col gap-1.5', className)}>
      <span className="text-xs font-medium text-slate-400">{label}</span>
      {children}
      {hint && <span className="text-[11px] text-slate-500">{hint}</span>}
    </label>
  );
}

interface SegmentedProps<T extends string> {
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (v: T) => void;
  className?: string;
}

export function Segmented<T extends string>({ value, options, onChange, className }: SegmentedProps<T>) {
  return (
    <div className={cn('grid gap-1 rounded-xl bg-slate-950 p-1', className)} style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={cn(
            'rounded-lg px-2 py-1.5 text-xs font-medium transition-colors',
            o.value === value ? 'bg-slate-800 text-white shadow' : 'text-slate-400 hover:text-slate-200',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
