import { z } from 'zod';
import { GeminiService } from './gemini.service.js';
import { ParsedRequirementResult } from './types.js';
import { logger } from '../../common/logging/logger.js';

const parsedSchema = z.object({
  quantityTonnes: z.number().positive().nullable(),
  minimumPurity: z.number().min(50).max(100).nullable(),
  city: z.string().nullable().optional(),
  state: z.string().nullable().optional(),
  location: z.string().nullable().optional(),
  maxPricePerTonne: z.number().positive().nullable(),
  requiredDate: z.string().nullable(),
  intendedUse: z.string().nullable(),
});

export interface SupportedCity {
  city: string;
  state: string;
  aliases: string[];
}

export const SUPPORTED_CITIES: SupportedCity[] = [
  { city: 'Ahmedabad', state: 'Gujarat', aliases: ['ahmedabad', 'amdavad'] },
  { city: 'Rajkot', state: 'Gujarat', aliases: ['rajkot'] },
  { city: 'Surat', state: 'Gujarat', aliases: ['surat'] },
  { city: 'Vadodara', state: 'Gujarat', aliases: ['vadodara', 'baroda'] },
  { city: 'Dahej', state: 'Gujarat', aliases: ['dahej'] },
  { city: 'Hazira', state: 'Gujarat', aliases: ['hazira'] },
  { city: 'Ankleshwar', state: 'Gujarat', aliases: ['ankleshwar'] },
  { city: 'Jamnagar', state: 'Gujarat', aliases: ['jamnagar'] },
  { city: 'Gandhinagar', state: 'Gujarat', aliases: ['gandhinagar'] },
  { city: 'Pune', state: 'Maharashtra', aliases: ['pune', 'poona'] },
  { city: 'Mumbai', state: 'Maharashtra', aliases: ['mumbai', 'bombay'] },
  { city: 'Nagpur', state: 'Maharashtra', aliases: ['nagpur'] },
  { city: 'Delhi', state: 'Delhi', aliases: ['delhi', 'new delhi', 'ncr'] },
  { city: 'Jaipur', state: 'Rajasthan', aliases: ['jaipur'] },
  { city: 'Chennai', state: 'Tamil Nadu', aliases: ['chennai', 'madras'] },
  { city: 'Bengaluru', state: 'Karnataka', aliases: ['bengaluru', 'bangalore'] },
  { city: 'Hyderabad', state: 'Telangana', aliases: ['hyderabad', 'secunderabad'] },
  { city: 'Kolkata', state: 'West Bengal', aliases: ['kolkata', 'calcutta'] },
  { city: 'Indore', state: 'Madhya Pradesh', aliases: ['indore'] },
  { city: 'Bhopal', state: 'Madhya Pradesh', aliases: ['bhopal'] },
  { city: 'Visakhapatnam', state: 'Andhra Pradesh', aliases: ['visakhapatnam', 'vizag'] },
];

const MONTH_MAP: Record<string, number> = {
  january: 1, jan: 1,
  february: 2, feb: 2,
  march: 3, mar: 3,
  april: 4, apr: 4,
  may: 5,
  june: 6, jun: 6,
  july: 7, jul: 7,
  august: 8, aug: 8,
  september: 9, sept: 9, sep: 9,
  october: 10, oct: 10,
  november: 11, nov: 11,
  december: 12, dec: 12,
};

/**
 * Returns today's date in local YYYY-MM-DD string format (date-only semantics).
 */
export function getLocalDateString(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Resolves a city name or alias to canonical city and state.
 */
export function resolveCityAndState(cityNameOrText: string): { city: string; state: string } | null {
  if (!cityNameOrText) return null;
  const lower = cityNameOrText.trim().toLowerCase();

  for (const item of SUPPORTED_CITIES) {
    if (item.city.toLowerCase() === lower || item.aliases.some(a => a.toLowerCase() === lower)) {
      return { city: item.city, state: item.state };
    }
  }

  // Check word boundary in longer text
  for (const item of SUPPORTED_CITIES) {
    for (const alias of [item.city, ...item.aliases]) {
      const regex = new RegExp(`\\b${alias}\\b`, 'i');
      if (regex.test(cityNameOrText)) {
        return { city: item.city, state: item.state };
      }
    }
  }

  return null;
}

/**
 * Extracts exact delivery date (YYYY-MM-DD) from natural language text.
 * Rejects past dates, accepts today and future dates.
 * Returns null if exact date cannot safely be determined (e.g. "next month").
 */
export function extractExactDate(text: string, referenceDate = new Date()): string | null {
  if (!text) return null;
  const todayStr = getLocalDateString(referenceDate);
  const refYear = referenceDate.getFullYear();

  // Explicit non-exact or relative phrases: DO NOT invent a date!
  if (/next\s*month|next\s*week|asap|urgent|soon|kisi\s*bhi\s*din/i.test(text)) {
    // Note: if text contains BOTH an exact date AND "next month" (rare), exact date regex below can still match
    // but if it only contains relative wording without a day number, it falls through to null.
  }

  let matchedDay: number | null = null;
  let matchedMonth: number | null = null;
  let matchedYear: number = refYear;

  // Pattern A: Day + Month name + optional Year
  // e.g. "30 September 2026", "15 October 2026 tak", "20th Oct 2026", "20 October"
  const dayMonthMatch = text.match(
    /\b(\d{1,2})(?:st|nd|rd|th)?\s+(january|jan|february|feb|march|mar|april|apr|may|june|jun|july|jul|august|aug|september|sept|sep|october|oct|november|nov|december|dec)(?:\s+(\d{4}))?\b/i
  );

  if (dayMonthMatch) {
    matchedDay = parseInt(dayMonthMatch[1], 10);
    matchedMonth = MONTH_MAP[dayMonthMatch[2].toLowerCase()];
    if (dayMonthMatch[3]) {
      matchedYear = parseInt(dayMonthMatch[3], 10);
    }
  }

  // Pattern B: Month name + Day + optional Year
  // e.g. "September 30, 2026", "Oct 15 2026"
  if (!matchedDay) {
    const monthDayMatch = text.match(
      /\b(january|jan|february|feb|march|mar|april|apr|may|june|jun|july|jul|august|aug|september|sept|sep|october|oct|november|nov|december|dec)\s+(\d{1,2})(?:st|nd|rd|th)?(?:\s*,?\s*(\d{4}))?\b/i
    );
    if (monthDayMatch) {
      matchedMonth = MONTH_MAP[monthDayMatch[1].toLowerCase()];
      matchedDay = parseInt(monthDayMatch[2], 10);
      if (monthDayMatch[3]) {
        matchedYear = parseInt(monthDayMatch[3], 10);
      }
    }
  }

  // Pattern C: ISO YYYY-MM-DD
  if (!matchedDay) {
    const isoMatch = text.match(/\b(\d{4})[/-](\d{1,2})[/-](\d{1,2})\b/);
    if (isoMatch) {
      matchedYear = parseInt(isoMatch[1], 10);
      matchedMonth = parseInt(isoMatch[2], 10);
      matchedDay = parseInt(isoMatch[3], 10);
    }
  }

  // Pattern D: DD-MM-YYYY or DD/MM/YYYY
  if (!matchedDay) {
    const dmyMatch = text.match(/\b(\d{1,2})[/-](\d{1,2})[/-](\d{4})\b/);
    if (dmyMatch) {
      matchedDay = parseInt(dmyMatch[1], 10);
      matchedMonth = parseInt(dmyMatch[2], 10);
      matchedYear = parseInt(dmyMatch[3], 10);
    }
  }

  if (!matchedDay || !matchedMonth || isNaN(matchedDay) || isNaN(matchedMonth)) {
    return null;
  }

  // Calendar validity check
  if (matchedMonth < 1 || matchedMonth > 12 || matchedDay < 1 || matchedDay > 31) {
    return null;
  }

  const checkDate = new Date(matchedYear, matchedMonth - 1, matchedDay);
  if (
    checkDate.getFullYear() !== matchedYear ||
    checkDate.getMonth() !== matchedMonth - 1 ||
    checkDate.getDate() !== matchedDay
  ) {
    return null;
  }

  // Format as date-only YYYY-MM-DD without any timezone offset transformation
  const candidateDateStr = `${matchedYear}-${String(matchedMonth).padStart(2, '0')}-${String(matchedDay).padStart(2, '0')}`;

  // Past dates must be rejected
  if (candidateDateStr < todayStr) {
    return null;
  }

  return candidateDateStr;
}

export class RequirementParserService {
  /**
   * Parses natural language procurement requirements (English, Hindi, Hinglish)
   * into structured fields. Uses Gemini when available, falling back to deterministic extraction.
   */
  public static async parseRequirement(text: string): Promise<ParsedRequirementResult> {
    if (!text || text.trim().length === 0) {
      return {
        quantityTonnes: null,
        minimumPurity: null,
        city: null,
        state: null,
        location: null,
        maxPricePerTonne: null,
        requiredDate: null,
        intendedUse: null,
        parserMode: 'DETERMINISTIC_NLP_FALLBACK',
        summaryMessage: 'Empty input received. Please enter procurement requirement details.',
      };
    }

    // Try Gemini if configured
    if (GeminiService.isConfigured()) {
      const geminiResult = await this.parseWithGemini(text);
      if (geminiResult) {
        return geminiResult;
      }
    }

    // Fallback: Deterministic Parser
    return this.parseWithDeterministicFallback(text);
  }

  private static async parseWithGemini(text: string): Promise<ParsedRequirementResult | null> {
    const todayStr = getLocalDateString();

    const systemPrompt = `You are an expert procurement assistant for CarbonBridge, an industrial B2B CO2 marketplace.
Parse natural language procurement requests written in English, Hindi, or Hinglish into strict JSON.
Reference date (today): ${todayStr}.

Rules:
1. Do NOT invent missing values. If a parameter cannot be safely determined, return null.
2. quantityTonnes: float or null (extract from "300 tonne", "500T", "100 ton", "200 metric tonnes").
3. minimumPurity: float between 50 and 100 or null (extract from "90%", "99.5% purity", "food grade 99.8%").
4. city: string or null (extract Indian city, e.g. "Ahmedabad", "Rajkot", "Surat", "Vadodara", "Pune", "Mumbai", "Delhi", "Jaipur", "Chennai", "Bengaluru", "Hyderabad", "Kolkata").
5. state: string or null (identify Indian state, e.g. Gujarat for Rajkot/Ahmedabad/Surat/Vadodara, Maharashtra for Pune/Mumbai, Karnataka for Bengaluru/Bangalore, Delhi for Delhi, Rajasthan for Jaipur, Tamil Nadu for Chennai, Telangana for Hyderabad, West Bengal for Kolkata).
6. location: string or null (e.g. "Rajkot, Gujarat" or "Rajkot").
7. maxPricePerTonne: float or null (extract budget ceiling from "₹2500", "2500/T", "Rs 2400 ke andar", "under 2600 per ton").
8. requiredDate: string YYYY-MM-DD or null.
   CRITICAL DATE INSTRUCTIONS:
   - Extract exact delivery dates (e.g. "30 September 2026" -> "2026-09-30", "15 October 2026" -> "2026-10-15", "by 20 October 2026" -> "2026-10-20").
   - If the user says vague timelines like "next month", "next week", "as soon as possible", "urgent", or "soon", you MUST return null. Never invent or guess an exact day.
   - Any date before ${todayStr} must return null.
9. intendedUse: string or null (e.g. "CHEMICAL_FEEDSTOCK", "FOOD_BEVERAGE", "CONSTRUCTION", "SYNFUEL", "GREENHOUSE", or null).

Output JSON schema:
{"quantityTonnes": number|null, "minimumPurity": number|null, "city": string|null, "state": string|null, "location": string|null, "maxPricePerTonne": number|null, "requiredDate": string|null, "intendedUse": string|null}`;

    const userPrompt = `Parse this buyer requirement: "${text}"`;

    try {
      const parsed = await GeminiService.generateJson({
        systemPrompt,
        userPrompt,
        temperature: 0.0,
      });

      if (!parsed) return null;

      const validated = parsedSchema.safeParse(parsed);
      if (!validated.success) {
        logger.warn({ errors: validated.error.format() }, 'Gemini returned JSON that failed requirement schema validation.');
        return null;
      }

      const data = validated.data;

      // Post-process city and state resolution
      let finalCity: string | null = data.city || null;
      let finalState: string | null = data.state || null;
      let finalLocation: string | null = data.location || null;

      // If city or location is given, cross-reference with supported cities
      const lookup = resolveCityAndState(finalCity || finalLocation || text);
      if (lookup) {
        finalCity = lookup.city;
        finalState = lookup.state;
        finalLocation = `${lookup.city}, ${lookup.state}`;
      } else if (finalCity && !finalState) {
        finalLocation = finalCity;
      }

      // Validate date safely
      let finalDate: string | null = null;
      if (data.requiredDate && /^\d{4}-\d{2}-\d{2}$/.test(data.requiredDate)) {
        if (data.requiredDate >= todayStr) {
          finalDate = data.requiredDate;
        }
      }

      return {
        quantityTonnes: data.quantityTonnes ?? null,
        minimumPurity: data.minimumPurity ?? null,
        city: finalCity,
        state: finalState,
        location: finalLocation,
        maxPricePerTonne: data.maxPricePerTonne ?? null,
        requiredDate: finalDate,
        intendedUse: data.intendedUse ?? null,
        parserMode: 'GEMINI_AI',
        summaryMessage: 'Successfully parsed requirement parameters using Google Gemini AI.',
      };
    } catch (err: any) {
      logger.warn({ error: err.message }, 'Gemini requirement parsing failed.');
      return null;
    }
  }

  /**
   * Deterministic regex & heuristic keyword parser for failover autonomy.
   */
  public static parseWithDeterministicFallback(text: string): ParsedRequirementResult {
    let quantityTonnes: number | null = null;
    let minimumPurity: number | null = null;
    let city: string | null = null;
    let state: string | null = null;
    let location: string | null = null;
    let maxPricePerTonne: number | null = null;
    let requiredDate: string | null = null;
    let intendedUse: string | null = null;

    // 1. Quantity: e.g. "300 tonne", "500T", "100 ton", "200 t"
    const qtyMatch = text.match(/(\d+(?:\.\d+)?)\s*(?:tonne|t|ton|tons|tonnes|metric\s*tonnes?)\b/i);
    if (qtyMatch) {
      const q = parseFloat(qtyMatch[1]);
      if (!isNaN(q) && q > 0) quantityTonnes = q;
    }

    // 2. Purity: e.g. "90%", "99.5%", "90%+ CO2", "99.9 purity"
    const purityMatch =
      text.match(/(\d+(?:\.\d+)?)\s*%\s*(?:\+|plus)?/i) ||
      text.match(/(?:purity|co2\s*purity)\s*(?:of|at|minimum|min)?\s*(\d+(?:\.\d+)?)/i);
    if (purityMatch) {
      const p = parseFloat(purityMatch[1]);
      if (!isNaN(p) && p >= 50 && p <= 100) minimumPurity = p;
    }

    // 3. Price ceiling: e.g. "₹2500", "Rs. 2500", "2500/T", "2500 per ton", "under 2500"
    const priceMatch =
      text.match(/(?:₹|rs\.?|inr)\s*(\d+(?:\.\d+)?)/i) ||
      text.match(/(\d+(?:\.\d+)?)\s*(?:\/t|\/ton|per\s*ton|per\s*tonne)\b/i) ||
      text.match(/(?:under|below|max|budget)\s*(?:₹|rs\.?)?\s*(\d{3,5})\b/i);
    if (priceMatch) {
      const pr = parseFloat(priceMatch[1]);
      if (!isNaN(pr) && pr >= 500 && pr <= 20000) maxPricePerTonne = pr;
    }

    // 4. Location: dynamically resolve city and state across all supported cities
    const resolved = resolveCityAndState(text);
    if (resolved) {
      city = resolved.city;
      state = resolved.state;
      location = `${resolved.city}, ${resolved.state}`;
    }

    // 5. Exact Delivery Date (date-only semantics, rejecting past dates and never fabricating)
    requiredDate = extractExactDate(text);

    // 6. Intended Application / Use
    if (/beverage|food|drink|carbonation|brewery/i.test(text)) {
      intendedUse = 'FOOD_BEVERAGE';
    } else if (/concrete|cement|construction|curing/i.test(text)) {
      intendedUse = 'CONSTRUCTION';
    } else if (/chemical|feedstock|methanol|urea/i.test(text)) {
      intendedUse = 'CHEMICAL_FEEDSTOCK';
    } else if (/synfuel|fuel|e-fuel|aviation/i.test(text)) {
      intendedUse = 'SYNFUEL';
    } else if (/greenhouse|agri|agriculture/i.test(text)) {
      intendedUse = 'GREENHOUSE';
    }

    return {
      quantityTonnes,
      minimumPurity,
      city,
      state,
      location,
      maxPricePerTonne,
      requiredDate,
      intendedUse,
      parserMode: 'DETERMINISTIC_NLP_FALLBACK',
      summaryMessage: 'Parsed requirement parameters using deterministic pattern extractor.',
    };
  }
}
