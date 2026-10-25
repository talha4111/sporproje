import { describe, expect, it } from 'vitest';
import type { UserProfile } from '../types/nutrition';
import {
  bodyweightMacros,
  calculateBMR,
  calculateTargets,
  kcalFromMacros,
  percentageMacros,
  scaleNutrients,
  sumNutrients,
} from './metabolism';

const profile: UserProfile = {
  name: 'Test',
  sex: 'male',
  age: 25,
  heightCm: 180,
  weightKg: 80,
  activityLevel: 'moderate',
  goal: 'maintain',
  macroMode: 'bodyweight',
  percentages: { protein: 30, carbs: 45, fat: 25 },
  proteinPerKg: 2,
  waterTargetMl: 3000,
};

describe('calculateBMR (Mifflin-St Jeor)', () => {
  it('erkek için doğru hesaplar', () => {
    // 10*80 + 6.25*180 - 5*25 + 5 = 1805
    expect(calculateBMR(profile)).toBe(1805);
  });
  it('kadın için doğru hesaplar', () => {
    // 10*60 + 6.25*165 - 5*30 - 161 = 1320.25
    expect(calculateBMR({ sex: 'female', weightKg: 60, heightCm: 165, age: 30 })).toBeCloseTo(1320.25);
  });
});

describe('calculateTargets', () => {
  it('TDEE ve vücut ağırlığı makrolarını hesaplar', () => {
    const t = calculateTargets(profile);
    expect(t.tdee).toBe(Math.round(1805 * 1.55)); // 2798
    expect(t.protein).toBe(160);
    expect(t.fat).toBe(Math.round((2797.75 * 0.25) / 9));
    expect(t.warnings).toHaveLength(0);
  });

  it('kilo verme hedefi kaloriyi %20 düşürür', () => {
    const t = calculateTargets({ ...profile, goal: 'lose' });
    expect(t.kcal).toBe(Math.round(1805 * 1.55 * 0.8));
  });
});

describe('bodyweightMacros', () => {
  it('negatif karbonhidratı 0a sabitler ve uyarır', () => {
    const m = bodyweightMacros(1000, 120, 2.5);
    expect(m.carbs).toBe(0);
    expect(m.warnings.length).toBeGreaterThan(0);
  });
});

describe('percentageMacros', () => {
  it('yüzdeleri grama çevirir', () => {
    const m = percentageMacros(2000, { protein: 30, carbs: 40, fat: 30 });
    expect(m.protein).toBeCloseTo(150);
    expect(m.carbs).toBeCloseTo(200);
    expect(m.fat).toBeCloseTo(66.67, 1);
    expect(m.warnings).toHaveLength(0);
  });
  it('toplamı 100 olmayan yüzdeleri normalize eder', () => {
    const m = percentageMacros(2000, { protein: 40, carbs: 40, fat: 40 });
    expect(kcalFromMacros(m.protein, m.carbs, m.fat)).toBeCloseTo(2000);
    expect(m.warnings.length).toBe(1);
  });
});

describe('porsiyon ölçekleme', () => {
  const per100g = { kcal: 200, protein: 10, carbs: 20, fat: 5, fiber: 2, sugar: 1, salt: 0.5 };
  it('gramaja göre ölçekler', () => {
    const s = scaleNutrients(per100g, 150);
    expect(s.kcal).toBe(300);
    expect(s.protein).toBe(15);
  });
  it('geçersiz gramajı 0 kabul eder', () => {
    expect(scaleNutrients(per100g, Number.NaN).kcal).toBe(0);
    expect(scaleNutrients(per100g, -50).kcal).toBe(0);
  });
  it('toplar', () => {
    expect(sumNutrients([per100g, per100g]).kcal).toBe(400);
  });
});
