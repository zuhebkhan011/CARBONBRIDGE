import { config } from '../../config/env.js';
import { logger } from '../../common/logging/logger.js';

export interface GeminiGenerateOptions {
  systemPrompt?: string;
  userPrompt: string;
  inlineData?: {
    mimeType: string;
    data: string; // base64 encoded
  };
  responseSchema?: any;
  temperature?: number;
  timeoutMs?: number;
}

export class GeminiService {
  /**
   * Generates content from the Google Gemini API with strict timeout, JSON structured output,
   * multimodal document input, and clean error capture. Returns null if Gemini is unconfigured or unreachable.
   */
  public static async generateJson<T = any>(options: GeminiGenerateOptions): Promise<T | null> {
    const apiKey = config.GEMINI_API_KEY;
    if (!apiKey || apiKey.trim() === '') {
      logger.debug('GEMINI_API_KEY not set; skipping Gemini request and proceeding with deterministic fallback.');
      return null;
    }

    const modelName = config.GEMINI_MODEL || 'gemini-2.5-flash';
    const timeoutMs = options.timeoutMs || 8000;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    const startTime = Date.now();

    try {
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
        modelName
      )}:generateContent?key=${encodeURIComponent(apiKey)}`;

      const contents: any[] = [];
      if (options.systemPrompt) {
        contents.push({
          role: 'user',
          parts: [{ text: `System Instructions:\n${options.systemPrompt}` }],
        });
      }

      const userParts: any[] = [];
      if (options.inlineData) {
        userParts.push({
          inlineData: {
            mimeType: options.inlineData.mimeType,
            data: options.inlineData.data,
          },
        });
      }
      userParts.push({ text: options.userPrompt });

      contents.push({
        role: 'user',
        parts: userParts,
      });

      const bodyPayload: any = {
        contents,
        generationConfig: {
          temperature: options.temperature ?? 0.1,
          responseMimeType: 'application/json',
        },
      };

      if (options.responseSchema) {
        bodyPayload.generationConfig.responseSchema = options.responseSchema;
      }

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(bodyPayload),
        signal: controller.signal,
      });

      const latencyMs = Date.now() - startTime;

      if (!res.ok) {
        const errorText = await res.text().catch(() => '');
        logger.warn(
          { status: res.status, model: modelName, latencyMs, errorSnippet: errorText.slice(0, 200) },
          'Gemini API returned non-200 status. Falling back to deterministic logic.'
        );
        return null;
      }

      const data: any = await res.json();
      const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text;

      if (!rawText) {
        logger.warn({ latencyMs }, 'Gemini API returned empty candidate text.');
        return null;
      }

      logger.info({ model: modelName, latencyMs, success: true }, 'Gemini API call completed successfully.');

      const parsed = JSON.parse(rawText);
      return parsed as T;
    } catch (err: any) {
      const latencyMs = Date.now() - startTime;
      const isTimeout = err.name === 'AbortError' || err.message?.includes('aborted');

      logger.warn(
        { latencyMs, isTimeout, error: isTimeout ? 'Request timed out' : err.message },
        'Gemini API call failed or timed out. Gracefully falling back.'
      );
      return null;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Quick check whether Gemini API is configured in the environment.
   */
  public static isConfigured(): boolean {
    return Boolean(config.GEMINI_API_KEY && config.GEMINI_API_KEY.trim().length > 0);
  }
}
