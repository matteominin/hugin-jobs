import { createDeepSeek } from '@ai-sdk/deepseek';
import { config } from '../config.js';

const deepseek = createDeepSeek({ apiKey: config.deepseekApiKey });

/** The configured DeepSeek model, shared across judging and extraction. */
export const model = deepseek(config.deepseekModel);
export const modelId = config.deepseekModel;

export function assertLlmConfigured(): void {
  if (!config.deepseekApiKey) {
    throw new Error('DEEPSEEK_API_KEY is not set');
  }
}
