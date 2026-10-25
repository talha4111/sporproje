import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import {
  AlertCircle,
  Camera,
  Check,
  ImagePlus,
  KeyRound,
  Loader2,
  Minus,
  Plus,
  RefreshCw,
  Sparkles,
  Utensils,
  Video,
  X,
} from 'lucide-react';
import type {
  FoodItem,
  MealCategory,
  VisionConfidence,
  VisionDetectedItem,
  VisionPlateAnalysis,
} from '../../types/nutrition';
import { MEAL_CATEGORIES } from '../../types/nutrition';
import {
  DEMO_PLATES,
  analyzeFoodImageWithAI,
  getGeminiApiKey,
  hasGeminiApiKey,
  setGeminiApiKey,
  syncGeminiKeyFromBridge,
  visionItemToFoodItem,
} from '../../services/aiVision';
import { captureVideoFrame, compressImageFile, type CompressedImage } from '../../utils/image';
import { formatAmount, scaleNutrients, sumNutrients } from '../../utils/metabolism';
import { cn, createId, toNumber } from '../../utils/common';
import { Segmented } from '../ui';

interface VisionTabProps {
  initialCategory: MealCategory;
  onAddPlate: (items: Array<{ food: FoodItem; grams: number }>, category: MealCategory, saveToDb: boolean) => void;
}

const SHORT_LABELS: Readonly<Record<MealCategory, string>> = {
  breakfast: 'Kahvaltı',
  lunch: 'Öğle',
  dinner: 'Akşam',
  snack: 'Ara Öğün',
};

const CATEGORY_OPTIONS = MEAL_CATEGORIES.map((c) => ({ value: c, label: SHORT_LABELS[c] }));

const CONFIDENCE_BADGE: Readonly<
  Record<VisionConfidence, { label: string; cls: string }>
> = {
  high: { label: 'Yüksek güven', cls: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' },
  medium: { label: 'Orta güven', cls: 'bg-amber-500/15 text-amber-300 border-amber-500/30' },
  low: { label: 'Tahmini', cls: 'bg-slate-700/60 text-slate-300 border-slate-600' },
};

export function VisionTab({ initialCategory, onAddPlate }: VisionTabProps) {
  const [image, setImage] = useState<CompressedImage | null>(null);
  const [userHint, setUserHint] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState('');
  const [analysis, setAnalysis] = useState<VisionPlateAnalysis | null>(null);
  const [category, setCategory] = useState<MealCategory>(initialCategory);
  const [saveToDb, setSaveToDb] = useState(true);

  // Canlı kamera (WebRTC) durumu
  const [cameraOpen, setCameraOpen] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Gemini API Anahtarı yönetimi
  const [keyConfigured, setKeyConfigured] = useState(() => hasGeminiApiKey());
  const [showKeyForm, setShowKeyForm] = useState(false);
  const [keyDraft, setKeyDraft] = useState(() => getGeminiApiKey());

  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const galleryInputRef = useRef<HTMLInputElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const stopCamera = () => {
    if (streamRef.current) {
      for (const track of streamRef.current.getTracks()) track.stop();
      streamRef.current = null;
    }
    setCameraOpen(false);
  };

  useEffect(() => {
    let active = true;
    void syncGeminiKeyFromBridge().then((key) => {
      if (active && key.length > 10) {
        setKeyConfigured(true);
        setKeyDraft(key);
      }
    });
    return () => {
      active = false;
      abortRef.current?.abort();
      if (streamRef.current) {
        for (const track of streamRef.current.getTracks()) track.stop();
      }
    };
  }, []);

  const startLiveCamera = async () => {
    setError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 960 } },
        audio: false,
      });
      streamRef.current = stream;
      setCameraOpen(true);
      requestAnimationFrame(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          void videoRef.current.play();
        }
      });
    } catch {
      setError('Canlı kamera açılamadı. Lütfen kamera izni verin veya "Fotoğraf Çek / Yükle" düğmesini kullanın.');
    }
  };

  const runAnalysis = async (compressed: CompressedImage, hintText = userHint) => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    setAnalyzing(true);
    setError('');
    setAnalysis(null);

    try {
      const res = await analyzeFoodImageWithAI(compressed.base64, compressed.mimeType, hintText, ctrl.signal);
      setAnalysis(res);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      const msg = err instanceof Error ? err.message : 'Görsel analiz edilirken hata oluştu.';
      if (msg === 'GEMINI_KEY_MISSING') {
        setShowKeyForm(true);
        setError(
          'Gerçek fotoğraf analizi için ücretsiz Gemini API anahtarı gerekiyor. Anahtarınızı aşağıya girebilir veya "Demo Tahmin Çalıştır" ile arayüzü hemen deneyebilirsiniz.',
        );
      } else {
        setError(msg);
      }
    } finally {
      setAnalyzing(false);
    }
  };

  const handleSnapLiveVideo = () => {
    if (!videoRef.current) return;
    try {
      const captured = captureVideoFrame(videoRef.current);
      stopCamera();
      setImage(captured);
      void runAnalysis(captured);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kare yakalanamadı.');
    }
  };

  const handleFileChange = async (file: File | undefined) => {
    if (!file) return;
    stopCamera();
    setError('');
    try {
      const compressed = await compressImageFile(file);
      setImage(compressed);
      await runAnalysis(compressed);
    } catch {
      setError('Görsel dosyası okunamadı. Lütfen geçerli bir fotoğraf seçin.');
    }
  };

  const loadDemoPlate = (presetId: string) => {
    stopCamera();
    const preset = DEMO_PLATES.find((p) => p.id === presetId) ?? DEMO_PLATES[0];
    setError('');
    // Derin kopya oluştur ki kullanıcı gramajları değiştirdiğinde sabit bozulmasın
    setAnalysis({
      ...preset.analysis,
      items: preset.analysis.items.map((i) => ({
        ...i,
        id: createId('vis'),
        per100g: { ...i.per100g },
      })),
    });
  };

  const saveApiKey = (e: FormEvent) => {
    e.preventDefault();
    setGeminiApiKey(keyDraft);
    const has = hasGeminiApiKey();
    setKeyConfigured(has);
    setShowKeyForm(false);
    if (has && image) {
      void runAnalysis(image);
    }
  };

  const updateItemGrams = (id: string, grams: number) => {
    setAnalysis((prev) =>
      prev
        ? {
            ...prev,
            items: prev.items.map((item) =>
              item.id === id ? { ...item, estimatedGrams: Math.max(0, Math.round(grams)) } : item,
            ),
          }
        : prev,
    );
  };

  const toggleItemSelected = (id: string) => {
    setAnalysis((prev) =>
      prev
        ? {
            ...prev,
            items: prev.items.map((item) =>
              item.id === id ? { ...item, selected: !item.selected } : item,
            ),
          }
        : prev,
    );
  };

  const selectedItems = useMemo(
    () => (analysis?.items ?? []).filter((i) => i.selected && i.estimatedGrams > 0),
    [analysis],
  );

  const plateTotal = useMemo(
    () => sumNutrients(selectedItems.map((i) => scaleNutrients(i.per100g, i.estimatedGrams))),
    [selectedItems],
  );

  const handleConfirmPlate = () => {
    if (selectedItems.length === 0) return;
    const payload = selectedItems.map((item: VisionDetectedItem) => ({
      food: visionItemToFoodItem(item),
      grams: item.estimatedGrams,
    }));
    onAddPlate(payload, category, saveToDb);
  };

  const resetAll = () => {
    stopCamera();
    setImage(null);
    setAnalysis(null);
    setError('');
  };

  return (
    <div className="space-y-4">
      {/* Üst durum çubuğu: AI Anahtarı & Mod bilgisi */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-800 bg-slate-950/70 px-3 py-2 text-xs">
        <div className="flex items-center gap-2">
          <Sparkles className="size-4 text-amber-400" />
          <span className="font-medium text-slate-200">AI Tabak & Yemek Tanıma</span>
          <span
            className={cn(
              'rounded-full px-2 py-0.5 text-[10px] font-medium',
              keyConfigured ? 'bg-emerald-500/15 text-emerald-300' : 'bg-amber-500/15 text-amber-300',
            )}
          >
            {keyConfigured ? 'Gemini Vision Hazır' : 'Demo / Anahtar Bekleniyor'}
          </span>
        </div>
        <button
          type="button"
          onClick={() => setShowKeyForm((s) => !s)}
          className="inline-flex items-center gap-1 text-xs text-sky-400 hover:text-sky-300"
        >
          <KeyRound className="size-3.5" />
          {keyConfigured ? 'API Anahtarını Değiştir' : 'Ücretsiz API Anahtarı Ekle'}
        </button>
      </div>

      {/* Katlanabilir Gemini API Anahtarı Kutusu */}
      {showKeyForm && (
        <form
          onSubmit={saveApiKey}
          className="space-y-2.5 rounded-xl border border-sky-500/30 bg-sky-950/20 p-3 text-xs"
        >
          <div className="flex items-start justify-between gap-2">
            <p className="text-slate-300">
              Gerçek zamanlı fotoğraf analizi için{' '}
              <a
                href="https://aistudio.google.com/apikey"
                target="_blank"
                rel="noreferrer"
                className="font-semibold text-sky-400 underline hover:text-sky-300"
              >
                Google AI Studio
              </a>{' '}
              üzerinden ücretsiz alacağınız Gemini API anahtarını girin (yalnızca telefonunuzda/tarayıcınızda saklanır):
            </p>
            <button type="button" onClick={() => setShowKeyForm(false)} className="text-slate-400 hover:text-slate-200">
              <X className="size-4" />
            </button>
          </div>
          <div className="flex gap-2">
            <input
              type="password"
              value={keyDraft}
              onChange={(e) => setKeyDraft(e.target.value)}
              placeholder="AIzaSy..."
              className="input flex-1 py-1.5 font-mono text-xs"
            />
            <button type="submit" className="btn-primary py-1.5 text-xs">
              Kaydet
            </button>
          </div>
        </form>
      )}

      {/* Gizli dosya seçiciler (Mobil kamera + Galeri) */}
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          void handleFileChange(e.target.files?.[0]);
          e.target.value = '';
        }}
      />
      <input
        ref={galleryInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          void handleFileChange(e.target.files?.[0]);
          e.target.value = '';
        }}
      />

      {/* Canlı Kamera Vizörü */}
      {cameraOpen && (
        <div className="relative overflow-hidden rounded-2xl border border-emerald-500/40 bg-black">
          <video ref={videoRef} playsInline muted className="aspect-[4/3] w-full object-cover" />
          {/* Kılavuz Çerçeve */}
          <div className="pointer-events-none absolute inset-6 rounded-2xl border-2 border-dashed border-emerald-400/50" />
          <div className="absolute inset-x-0 bottom-3 flex items-center justify-center gap-3 px-4">
            <button type="button" onClick={stopCamera} className="btn-secondary py-2 text-xs">
              <X className="size-4" /> İptal
            </button>
            <button type="button" onClick={handleSnapLiveVideo} className="btn-primary py-2 text-xs shadow-lg">
              <Camera className="size-4" /> Fotoğrafı Çek & Analiz Et
            </button>
          </div>
        </div>
      )}

      {/* Henüz analiz yoksa veya fotoğraf seçilmediyse Çekim Alanı */}
      {!cameraOpen && !analysis && !analyzing && (
        <div className="space-y-4">
          <div className="rounded-2xl border border-dashed border-slate-700 bg-slate-950/50 p-5 text-center">
            <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-2xl bg-emerald-500/15 text-emerald-400">
              <Camera className="size-6" />
            </div>
            <h3 className="text-sm font-semibold text-slate-100">Tabağını veya Yiyeceğini Okut</h3>
            <p className="mx-auto mt-1 max-w-md text-xs text-slate-400">
              Telefon kameranla tabağının fotoğrafını çek; yapay zeka tabaktaki tüm yemekleri, tahmini gramajları ve
              makroları saniyeler içinde çıkarsın.
            </p>

            {/* Opsiyonel İpucu */}
            <div className="mx-auto mt-3 max-w-md">
              <input
                value={userHint}
                onChange={(e) => setUserHint(e.target.value)}
                placeholder="İpucu ekle (opsiyonel: örn. 200g tavuk, pilav tereyağsız)"
                className="input text-xs"
              />
            </div>

            <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
              <button
                type="button"
                onClick={() => cameraInputRef.current?.click()}
                className="btn-primary py-2.5 text-xs"
              >
                <Camera className="size-4" /> Telefon Kamerası
              </button>
              <button
                type="button"
                onClick={() => void startLiveCamera()}
                className="btn-secondary py-2.5 text-xs"
              >
                <Video className="size-4" /> Canlı Kamera Aç
              </button>
              <button
                type="button"
                onClick={() => galleryInputRef.current?.click()}
                className="btn-secondary py-2.5 text-xs"
              >
                <ImagePlus className="size-4" /> Galeriden Seç
              </button>
            </div>
          </div>

          {/* Hızlı Örnek Tabaklar */}
          <div>
            <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold tracking-wide text-slate-400 uppercase">
              <Utensils className="size-3.5 text-amber-400" /> Hızlı Test: Örnek Sporcu Tabakları
            </p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              {DEMO_PLATES.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => loadDemoPlate(preset.id)}
                  className="flex items-center gap-2.5 rounded-xl border border-slate-800 bg-slate-950/60 p-2.5 text-left transition-colors hover:border-emerald-500/50 hover:bg-slate-800/50"
                >
                  <span className="text-xl">{preset.emoji}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-semibold text-slate-200">{preset.label}</p>
                    <p className="truncate text-[10px] text-slate-500">
                      {preset.analysis.items.length} kalem · örnek analiz
                    </p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Analiz Ediliyor Animasyonu */}
      {analyzing && (
        <div className="space-y-3 rounded-2xl border border-slate-800 bg-slate-950 p-5 text-center">
          {image && (
            <div className="relative mx-auto max-w-xs overflow-hidden rounded-xl border border-slate-800">
              <img src={image.dataUrl} alt="Taranan yemek" className="max-h-48 w-full object-cover opacity-60" />
              <div className="absolute inset-0 flex items-center justify-center bg-slate-950/40">
                <Loader2 className="size-8 animate-spin text-emerald-400" />
              </div>
            </div>
          )}
          <p className="text-sm font-medium text-emerald-300">Yapay zeka tabağı analiz ediyor…</p>
          <p className="text-xs text-slate-500">Besin bileşenleri, pişirme yöntemi ve porsiyon gramajları hesaplanıyor</p>
        </div>
      )}

      {/* Hata Mesajı */}
      {error && (
        <div className="space-y-2.5 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-300">
          <div className="flex items-start gap-2">
            <AlertCircle className="mt-0.5 size-4 shrink-0" />
            <span>{error}</span>
          </div>
          {image && (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void runAnalysis(image)}
                className="btn-secondary py-1.5 text-xs"
              >
                <RefreshCw className="size-3.5" /> Tekrar Dene
              </button>
              <button
                type="button"
                onClick={() => loadDemoPlate('chicken-rice')}
                className="btn-secondary py-1.5 text-xs text-amber-300"
              >
                <Sparkles className="size-3.5" /> Fotoğraf Üzerinde Demo Tahmin Çalıştır
              </button>
            </div>
          )}
        </div>
      )}

      {/* Analiz Sonucu ve Etkileşimli Tabak Listesi */}
      {analysis && !analyzing && (
        <div className="space-y-4">
          {/* Başlık + Fotoğraf Önizlemesi */}
          <div className="flex items-start gap-3 rounded-xl border border-slate-800 bg-slate-950 p-3">
            {image && (
              <img
                src={image.dataUrl}
                alt="Analiz edilen tabak"
                className="size-16 shrink-0 rounded-lg border border-slate-800 object-cover"
              />
            )}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h3 className="truncate text-sm font-bold text-slate-100">{analysis.mealTitle}</h3>
                {analysis.isDemo && (
                  <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-300">
                    Örnek Tabak
                  </span>
                )}
              </div>
              <p className="mt-0.5 text-xs text-slate-400">{analysis.summaryNote}</p>
            </div>
            <button
              type="button"
              onClick={resetAll}
              className="btn-ghost shrink-0 px-2 py-1 text-xs text-slate-400"
              title="Yeni fotoğraf çek"
            >
              <RefreshCw className="size-3.5" /> Yeni
            </button>
          </div>

          {/* Tespit Edilen Besin Kalemleri */}
          <div className="space-y-2.5">
            <p className="text-xs font-semibold tracking-wide text-slate-400 uppercase">
              Tespit Edilen Kalemler ({selectedItems.length}/{analysis.items.length} seçili)
            </p>
            {analysis.items.map((item) => {
              const scaled = scaleNutrients(item.per100g, item.estimatedGrams);
              const badge = CONFIDENCE_BADGE[item.confidence];
              return (
                <div
                  key={item.id}
                  className={cn(
                    'rounded-xl border p-3 transition-colors',
                    item.selected
                      ? 'border-slate-700 bg-slate-950/90'
                      : 'border-slate-800/60 bg-slate-950/30 opacity-50',
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <label className="flex min-w-0 flex-1 cursor-pointer items-start gap-2.5">
                      <input
                        type="checkbox"
                        checked={item.selected}
                        onChange={() => toggleItemSelected(item.id)}
                        className="mt-1 size-4 accent-emerald-500"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="text-sm font-semibold text-slate-100">{item.name}</span>
                          <span className={cn('rounded-full border px-2 py-0.5 text-[10px]', badge.cls)}>
                            {badge.label}
                          </span>
                        </div>
                        {item.note && <p className="text-[11px] text-slate-500">{item.note}</p>}
                      </div>
                    </label>
                    <div className="text-right">
                      <p className="text-sm font-bold tabular-nums text-emerald-400">
                        {formatAmount(scaled.kcal, 0)} kcal
                      </p>
                      <p className="text-[11px] tabular-nums text-slate-400">
                        P {formatAmount(scaled.protein)}g · K {formatAmount(scaled.carbs)}g · Y {formatAmount(scaled.fat)}g
                      </p>
                    </div>
                  </div>

                  {/* Gramaj ayarlayıcı */}
                  {item.selected && (
                    <div className="mt-2.5 flex items-center justify-between gap-2 border-t border-slate-800/80 pt-2">
                      <span className="text-[11px] text-slate-500">
                        100g: {item.per100g.kcal} kcal (P {item.per100g.protein}g, K {item.per100g.carbs}g, Y{' '}
                        {item.per100g.fat}g)
                      </span>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => updateItemGrams(item.id, item.estimatedGrams - 10)}
                          className="btn-secondary size-7 p-0"
                          aria-label="10g azalt"
                        >
                          <Minus className="size-3.5" />
                        </button>
                        <div className="relative w-20">
                          <input
                            inputMode="numeric"
                            value={item.estimatedGrams}
                            onChange={(e) => updateItemGrams(item.id, toNumber(e.target.value, 0))}
                            className="input py-1 pr-5 text-center text-xs font-semibold tabular-nums"
                          />
                          <span className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 text-[10px] text-slate-500">
                            g
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => updateItemGrams(item.id, item.estimatedGrams + 10)}
                          className="btn-secondary size-7 p-0"
                          aria-label="10g artır"
                        >
                          <Plus className="size-3.5" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Toplam Tabak Özeti */}
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-950/15 p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-semibold text-emerald-300">Toplam Tabak Değerleri</span>
              <span className="text-xs text-slate-400">
                Lif {formatAmount(plateTotal.fiber)}g · Şeker {formatAmount(plateTotal.sugar)}g
              </span>
            </div>
            <div className="grid grid-cols-4 gap-2 text-center">
              {[
                { label: 'Kalori', value: formatAmount(plateTotal.kcal, 0), unit: 'kcal', cls: 'text-emerald-400' },
                { label: 'Protein', value: formatAmount(plateTotal.protein), unit: 'g', cls: 'text-sky-400' },
                { label: 'Karb.', value: formatAmount(plateTotal.carbs), unit: 'g', cls: 'text-amber-400' },
                { label: 'Yağ', value: formatAmount(plateTotal.fat), unit: 'g', cls: 'text-violet-400' },
              ].map((m) => (
                <div key={m.label} className="rounded-lg bg-slate-950/80 py-1.5">
                  <p className={cn('text-sm font-bold tabular-nums', m.cls)}>{m.value}</p>
                  <p className="text-[10px] text-slate-500">
                    {m.label} ({m.unit})
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Öğün Seçimi & Kaydetme */}
          <div className="space-y-3">
            <div>
              <p className="mb-1.5 text-xs font-medium text-slate-400">Eklenecek Öğün</p>
              <Segmented value={category} options={CATEGORY_OPTIONS} onChange={setCategory} />
            </div>

            <label className="flex cursor-pointer items-center gap-2 text-xs text-slate-300">
              <input
                type="checkbox"
                checked={saveToDb}
                onChange={(e) => setSaveToDb(e.target.checked)}
                className="size-4 accent-emerald-500"
              />
              Tespit edilen bu besinleri daha sonra çevrimdışı kullanmak için Kayıtlı Besinlerime de ekle
            </label>

            <button
              type="button"
              disabled={selectedItems.length === 0}
              onClick={handleConfirmPlate}
              className="btn-primary w-full py-2.5"
            >
              <Check className="size-4" /> Tabağı Öğüne Ekle ({selectedItems.length} besin ·{' '}
              {formatAmount(plateTotal.kcal, 0)} kcal)
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
