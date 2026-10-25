import { useEffect, useState } from 'react';
import {
  Check,
  Copy,
  DownloadCloud,
  QrCode,
  RefreshCw,
  Smartphone,
  UploadCloud,
  Wifi,
} from 'lucide-react';
import type { BridgeInfo } from '../services/aiVision';
import { getGeminiApiKey, setGeminiApiKey } from '../services/aiVision';
import { useNutritionStore, type PersistedData } from '../store/useNutritionStore';
import { Modal } from './ui';

interface MobileConnectModalProps {
  open: boolean;
  onClose: () => void;
}

export function MobileConnectModal({ open, onClose }: MobileConnectModalProps) {
  const [bridge, setBridge] = useState<BridgeInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [syncMsg, setSyncMsg] = useState('');

  const importData = useNutritionStore((s) => s.importData);

  const fetchBridge = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/bridge');
      if (res.ok) {
        const data = (await res.json()) as BridgeInfo;
        setBridge(data);
        if (data.geminiApiKey && !getGeminiApiKey()) {
          setGeminiApiKey(data.geminiApiKey, false);
        }
      }
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!open) return;
    let active = true;
    void fetch('/api/bridge')
      .then((res) => (res.ok ? (res.json() as Promise<BridgeInfo>) : null))
      .then((data) => {
        if (!active || !data) return;
        setBridge(data);
        if (data.geminiApiKey && !getGeminiApiKey()) {
          setGeminiApiKey(data.geminiApiKey, false);
        }
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [open]);

  const handleClose = () => {
    setSyncMsg('');
    onClose();
  };

  const primaryUrl = bridge?.urls[0] ?? window.location.origin;
  const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&margin=10&data=${encodeURIComponent(primaryUrl)}`;

  const copyUrl = async () => {
    try {
      await navigator.clipboard.writeText(primaryUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  };

  const pushStateToBridge = async () => {
    const s = useNutritionStore.getState();
    const payload: PersistedData = {
      profile: s.profile,
      onboarded: s.onboarded,
      logsByDate: s.logsByDate,
      waterByDate: s.waterByDate,
      weightLog: s.weightLog,
    };
    try {
      const res = await fetch('/api/bridge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          geminiApiKey: getGeminiApiKey(),
          sharedStoreJson: JSON.stringify(payload),
        }),
      });
      if (res.ok) {
        setSyncMsg('Bu cihazdaki öğünler, profil ve API anahtarı yerel ağ köprüsüne gönderildi!');
        await fetchBridge();
      }
    } catch {
      setSyncMsg('Gönderim başarısız oldu.');
    }
  };

  const pullStateFromBridge = async () => {
    try {
      const res = await fetch('/api/bridge');
      if (!res.ok) return;
      const data = (await res.json()) as BridgeInfo;
      if (data.geminiApiKey) {
        setGeminiApiKey(data.geminiApiKey, false);
      }
      if (data.sharedStoreJson) {
        const parsed = JSON.parse(data.sharedStoreJson) as PersistedData;
        importData(parsed);
        setSyncMsg('Diğer cihazdaki veriler bu cihaza başarıyla aktarıldı!');
      } else {
        setSyncMsg('Henüz diğer cihazdan gönderilmiş bir veri bulunamadı.');
      }
    } catch {
      setSyncMsg('Veri çekilemedi.');
    }
  };

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={
        <span className="flex items-center gap-2">
          <Smartphone className="size-5 text-emerald-400" /> Telefonda Kullan & Eşitle
        </span>
      }
    >
      <div className="space-y-4">
        {/* QR Kod ve Bağlantı Adresi */}
        <div className="flex flex-col items-center rounded-2xl border border-slate-800 bg-slate-950 p-4 text-center">
          <div className="mb-3 flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-300">
            <Wifi className="size-3.5" /> Aynı Wi-Fi Ağı Üzerinden Anında Erişim
          </div>

          <div className="relative flex size-48 items-center justify-center overflow-hidden rounded-2xl bg-white p-2 shadow-lg">
            <img
              src={qrImageUrl}
              alt="Telefon bağlantısı QR kodu"
              className="size-full object-contain"
              loading="eager"
            />
          </div>

          <p className="mt-3 text-xs text-slate-300">
            Telefonunuzun kamerasını bu <b>QR koda</b> tutun veya telefon tarayıcınızdan aşağıdaki adrese girin:
          </p>

          <div className="mt-2 flex w-full max-w-sm items-center gap-2">
            <code className="flex-1 truncate rounded-xl border border-slate-800 bg-slate-900 px-3 py-2 font-mono text-xs font-semibold text-emerald-400">
              {primaryUrl}
            </code>
            <button onClick={() => void copyUrl()} className="btn-secondary shrink-0 px-3 py-2 text-xs">
              {copied ? <Check className="size-4 text-emerald-400" /> : <Copy className="size-4" />}
              {copied ? 'Kopyalandı' : 'Kopyala'}
            </button>
          </div>

          {bridge && bridge.urls.length > 1 && (
            <div className="mt-2 text-[11px] text-slate-500">
              Alternatif ağ adresleri: {bridge.urls.slice(1).join(' · ')}
            </div>
          )}
        </div>

        {/* Telefonda Kamera Kullanım Bilgisi */}
        <div className="rounded-xl border border-amber-500/25 bg-amber-500/5 p-3 text-xs text-slate-300">
          <p className="font-semibold text-amber-300">📸 Telefonda Kamera ile Yemek & Barkod Okutma:</p>
          <ul className="mt-1.5 list-inside list-disc space-y-1 text-slate-400">
            <li>
              Telefondan girdiğinizde <b>"Yemeği Kamerayla Okut"</b> → <b>"Telefon Kamerası"</b> düğmesine basarak
              tabağınızın fotoğrafını doğrudan çekebilirsiniz.
            </li>
            <li>
              Bilgisayarda girdiğiniz <b>Gemini API Anahtarı</b> yerel ağ üzerinden telefonunuza <b>otomatik aktarılır</b>;
              telefonda tekrar anahtar yazmanıza gerek yoktur.
            </li>
          </ul>
        </div>

        {/* PC <-> Telefon Tek Tıkla Veri Eşitleme */}
        <div className="space-y-2.5 rounded-xl border border-slate-800 bg-slate-950/60 p-3">
          <div className="flex items-center justify-between">
            <p className="flex items-center gap-1.5 text-xs font-semibold tracking-wide text-slate-300 uppercase">
              <QrCode className="size-3.5 text-sky-400" /> Bilgisayar ↔ Telefon Öğün Eşitleme
            </p>
            <button
              type="button"
              onClick={() => void fetchBridge()}
              className="text-xs text-slate-400 hover:text-slate-200"
              title="Yenile"
            >
              <RefreshCw className={`size-3.5 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
          <p className="text-[11px] text-slate-500">
            Telefonda okuttuğunuz yemekleri bilgisayara (veya bilgisayardaki profilinizi telefona) tek dokunuşla
            aktarın:
          </p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => void pushStateToBridge()}
              className="btn-secondary py-2 text-xs"
            >
              <UploadCloud className="size-4 text-emerald-400" /> Bu Cihazdan Diğerine Gönder
            </button>
            <button
              type="button"
              onClick={() => void pullStateFromBridge()}
              className="btn-secondary py-2 text-xs"
            >
              <DownloadCloud className="size-4 text-sky-400" /> Diğer Cihazdan Buraya Çek
            </button>
          </div>
          {syncMsg && <p className="text-center text-xs font-medium text-emerald-400">{syncMsg}</p>}
        </div>
      </div>
    </Modal>
  );
}
