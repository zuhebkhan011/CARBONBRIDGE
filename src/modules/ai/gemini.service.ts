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

export type GeminiErrorCategory =
  | 'missing API key'
  | 'invalid API key'
  | 'model unavailable'
  | 'timeout'
  | 'request rejected'
  | 'PDF processing error'
  | 'invalid structured response'
  | 'rate limit'
  | 'other API error';

export interface GeminiResult<T = any> {
  success: boolean;
  data: T | null;
  model: string;
  latencyMs: number;
  errorCategory?: GeminiErrorCategory;
  errorMessage?: string;
}

export class GeminiService {
  /**
   * Generates structured JSON from the Google Gemini API with automatic model failover,
   * detailed error categorization, strict timeout, and compliant logging.
   */
  public static async generateJsonDetailed<T = any>(options: GeminiGenerateOptions): Promise<GeminiResult<T>> {
    const isConfigured = this.isConfigured();
    const apiKey = config.GEMINI_API_KEY;

    if (!isConfigured || !apiKey) {
      logger.info(
        {
          geminiConfigured: false,
          model: 'none',
          latencyMs: 0,
          success: false,
          errorCategory: 'missing API key',
        },
        'Gemini is not configured. Missing API key.'
      );
      return {
        success: false,
        data: null,
        model: 'none',
        latencyMs: 0,
        errorCategory: 'missing API key',
        errorMessage: 'GEMINI_API_KEY is not configured in backend environment.',
      };
    }

    const primaryModel = config.GEMINI_MODEL || 'gemini-3.5-flash';
    // List of candidate models in prioritized order to withstand rate limits or temporary outages
    const candidateModels = Array.from(
      new Set([primaryModel, 'gemini-3.5-flash', 'gemini-flash-latest', 'gemini-3.7-flash'])
    );

    let lastErrorCategory: GeminiErrorCategory = 'other API error';
    let lastErrorMessage = '';
    let totalLatencyMs = 0;

    for (const currentModel of candidateModels) {
      const timeoutMs = options.timeoutMs || 15000;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
      const startTime = Date.now();

      try {
        const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
          currentModel
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
        totalLatencyMs += latencyMs;

        if (!res.ok) {
          const errorText = await res.text().catch(() => '');
          let category: GeminiErrorCategory = 'other API error';

          if (res.status === 429) {
            category = 'rate limit';
          } else if (res.status === 404) {
            category = 'model unavailable';
          } else if (res.status === 401 || res.status === 403) {
            category = 'invalid API key';
          } else if (res.status === 400) {
            category = errorText.toLowerCase().includes('pdf') ? 'PDF processing error' : 'request rejected';
          }

          lastErrorCategory = category;
          lastErrorMessage = errorText.slice(0, 150);

          logger.warn(
            {
              geminiConfigured: true,
              modelName: currentModel,
              latency: latencyMs,
              success: false,
              errorCategory: category,
              httpStatus: res.status,
            },
            `Gemini request failed on model '${currentModel}'. Attempting fallback if available.`
          );
          continue; // Try next candidate model
        }

        const data: any = await res.json();
        const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text;

        if (!rawText) {
          lastErrorCategory = 'invalid structured response';
          lastErrorMessage = 'Gemini returned empty candidate text.';
          logger.warn(
            {
              geminiConfigured: true,
              modelName: currentModel,
              latency: latencyMs,
              success: false,
              errorCategory: 'invalid structured response',
            },
            'Gemini candidate text was empty.'
          );
          continue;
        }

        try {
          const parsed = JSON.parse(rawText);
          logger.info(
            {
              geminiConfigured: true,
              modelName: currentModel,
              latency: latencyMs,
              success: true,
            },
            'Gemini API call completed successfully.'
          );

          return {
            success: true,
            data: parsed as T,
            model: currentModel,
            latencyMs,
          };
        } catch (parseErr: any) {
          lastErrorCategory = 'invalid structured response';
          lastErrorMessage = `JSON parse failed: ${parseErr.message}`;
          logger.warn(
            {
              geminiConfigured: true,
              modelName: currentModel,
              latency: latencyMs,
              success: false,
              errorCategory: 'invalid structured response',
            },
            'Gemini output was not valid JSON.'
          );
          continue;
        }
      } catch (err: any) {
        const latencyMs = Date.now() - startTime;
        totalLatencyMs += latencyMs;
        const isTimeout = err.name === 'AbortError' || err.message?.includes('aborted');
        const category: GeminiErrorCategory = isTimeout ? 'timeout' : 'other API error';

        lastErrorCategory = category;
        lastErrorMessage = isTimeout ? 'Request timed out' : err.message;

        logger.warn(
          {
            geminiConfigured: true,
            modelName: currentModel,
            latency: latencyMs,
            success: false,
            errorCategory: category,
          },
          `Gemini request error on model '${currentModel}'.`
        );
      } finally {
        clearTimeout(timeoutId);
      }
    }

    // If all models failed:
    return {
      success: false,
      data: null,
      model: primaryModel,
      latencyMs: totalLatencyMs,
      errorCategory: lastErrorCategory,
      errorMessage: lastErrorMessage,
    };
  }

  /**
   * Convenience method matching original signature for backwards compatibility.
   */
  public static async generateJson<T = any>(options: GeminiGenerateOptions): Promise<T | null> {
    const result = await this.generateJsonDetailed<T>(options);
    return result.data;
  }

  /**
   * Quick check whether Gemini API is configured in the environment.
   */
  public static isConfigured(): boolean {
    return Boolean(config.GEMINI_API_KEY && config.GEMINI_API_KEY.trim().length > 0);
  }
}
