const { z } = require('zod');

const textPart = z.object({ type: z.literal('text'), text: z.string() }).strict();

const message = z
  .object({
    role: z.enum(['system', 'developer', 'user', 'assistant']),
    content: z.union([z.string(), z.array(textPart).min(1)]),
    name: z.string().max(64).optional(),
  })
  .strict();

/**
 * The subset of the OpenAI Chat Completions request TokenGate accepts. It is strict:
 * an unknown field is a 400 rather than something silently dropped, so a client
 * never believes a parameter took effect when it did not.
 */
const chatCompletionBody = z
  .object({
    model: z.string().min(1).max(128),
    messages: z.array(message).min(1).max(256),
    temperature: z.number().min(0).max(2).optional(),
    top_p: z.number().gt(0).max(1).optional(),
    max_tokens: z.number().int().min(1).max(65_536).optional(),
    stop: z.union([z.string(), z.array(z.string()).min(1).max(4)]).optional(),
    presence_penalty: z.number().min(-2).max(2).optional(),
    frequency_penalty: z.number().min(-2).max(2).optional(),
    seed: z.number().int().optional(),
    user: z.string().max(256).optional(),
    stream: z.boolean().default(false),
    stream_options: z.object({ include_usage: z.boolean().optional() }).strict().optional(),
    // Model-specific knobs for the configured NVIDIA models.
    reasoning_effort: z.enum(['low', 'medium', 'high']).optional(),
    chat_template_kwargs: z
      .record(z.string(), z.union([z.boolean(), z.string(), z.number()]))
      .optional(),
  })
  .strict()
  .refine((body) => body.stream || body.stream_options === undefined, {
    path: ['stream_options'],
    message: 'stream_options is only allowed when stream is true',
  });

module.exports = { chatCompletionBody };
