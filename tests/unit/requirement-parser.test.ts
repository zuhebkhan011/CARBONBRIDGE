import { describe, it, expect } from 'vitest';
import {
  RequirementParserService,
  extractExactDate,
  resolveCityAndState,
  getLocalDateString,
} from '../../src/modules/ai/requirement-parser.service.js';

describe('Natural Language Requirement Parser Unit Suite', () => {
  describe('1. Location & State Resolution', () => {
    const cityCases = [
      { input: 'Mujhe Ahmedabad mein 500 tonne CO2 chahiye', city: 'Ahmedabad', state: 'Gujarat' },
      { input: 'Mujhe Rajkot mein 300 tonne CO2 chahiye', city: 'Rajkot', state: 'Gujarat' },
      { input: 'Surat plant requires 200 tonnes CO2', city: 'Surat', state: 'Gujarat' },
      { input: 'Looking for 150T CO2 in Vadodara', city: 'Vadodara', state: 'Gujarat' },
      { input: 'Need 200 tonnes CO2 in Pune for concrete curing', city: 'Pune', state: 'Maharashtra' },
      { input: 'Mumbai facility procurement: 100 tonnes', city: 'Mumbai', state: 'Maharashtra' },
      { input: 'Delhi cluster delivery required: 50 tonnes', city: 'Delhi', state: 'Delhi' },
      { input: 'Jaipur textile unit needs 80 tonnes', city: 'Jaipur', state: 'Rajasthan' },
      { input: 'Chennai chemical unit needs 300 tonnes', city: 'Chennai', state: 'Tamil Nadu' },
      { input: 'Bangalore biotech lab requires 20 tonnes', city: 'Bengaluru', state: 'Karnataka' },
      { input: 'Bengaluru industrial hub 100 tonnes', city: 'Bengaluru', state: 'Karnataka' },
      { input: 'Hyderabad pharma plant needs 250 tonnes', city: 'Hyderabad', state: 'Telangana' },
      { input: 'Kolkata factory delivery of 400 tonnes', city: 'Kolkata', state: 'West Bengal' },
    ];

    for (const testCase of cityCases) {
      it(`resolves ${testCase.input} → ${testCase.city}, ${testCase.state}`, () => {
        const resolved = resolveCityAndState(testCase.input);
        expect(resolved).not.toBeNull();
        expect(resolved?.city).toBe(testCase.city);
        expect(resolved?.state).toBe(testCase.state);

        const result = RequirementParserService.parseWithDeterministicFallback(testCase.input);
        expect(result.city).toBe(testCase.city);
        expect(result.state).toBe(testCase.state);
        expect(result.location).toContain(testCase.city);
      });
    }
  });

  describe('2. Date Extraction & Timezone Invariant', () => {
    // Reference date: 2026-09-12
    const refDate = new Date(2026, 8, 12); // Month is 0-indexed: 8 = Sept

    it('extracts "30 September 2026 tak" as 2026-09-30', () => {
      const text = 'Mujhe Ahmedabad mein 500 tonne CO2 chahiye, delivery 30 September 2026 tak.';
      const date = extractExactDate(text, refDate);
      expect(date).toBe('2026-09-30');
    });

    it('extracts "15 October 2026 tak" as 2026-10-15', () => {
      const text = 'Mujhe Rajkot mein 300 tonne CO2 chahiye, delivery 15 October 2026 tak.';
      const date = extractExactDate(text, refDate);
      expect(date).toBe('2026-10-15');
    });

    it('extracts "by 20 October 2026" as 2026-10-20', () => {
      const text = 'Need 200 tonnes CO2 in Pune by 20 October 2026.';
      const date = extractExactDate(text, refDate);
      expect(date).toBe('2026-10-20');
    });

    it('returns null for "next month" without fabricating an arbitrary date', () => {
      const text = 'Need 200 tonnes CO2 in Pune next month.';
      const date = extractExactDate(text, refDate);
      expect(date).toBeNull();

      const result = RequirementParserService.parseWithDeterministicFallback(text);
      expect(result.requiredDate).toBeNull();
    });

    it('rejects past dates relative to reference date', () => {
      const text = 'Delivery required by 10 August 2026.';
      const date = extractExactDate(text, refDate);
      expect(date).toBeNull();
    });

    it('accepts today as valid delivery date', () => {
      const todayStr = getLocalDateString(refDate);
      const text = `Urgent delivery needed by 12 September 2026.`;
      const date = extractExactDate(text, refDate);
      expect(date).toBe(todayStr);
    });

    it('preserves date-only semantics with no timezone day-shifting', () => {
      const text = '30 September 2026';
      const date = extractExactDate(text, refDate);
      expect(date).toBe('2026-09-30');
      // Verify exact string format: 10 chars YYYY-MM-DD
      expect(date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(date?.split('-')[2]).toBe('30');
    });
  });

  describe('3. Combined Comprehensive Prompt', () => {
    it('correctly extracts quantity, purity, city, state, budget, and date together', () => {
      const prompt =
        'Mujhe Rajkot mein 300 tonne CO2 chahiye, minimum purity 90%, budget ₹2500 per tonne, delivery 30 September 2026 tak.';
      const parsed = RequirementParserService.parseWithDeterministicFallback(prompt);

      expect(parsed.quantityTonnes).toBe(300);
      expect(parsed.minimumPurity).toBe(90);
      expect(parsed.city).toBe('Rajkot');
      expect(parsed.state).toBe('Gujarat');
      expect(parsed.location).toBe('Rajkot, Gujarat');
      expect(parsed.maxPricePerTonne).toBe(2500);
      expect(parsed.requiredDate).toBe('2026-09-30');
    });
  });
});
