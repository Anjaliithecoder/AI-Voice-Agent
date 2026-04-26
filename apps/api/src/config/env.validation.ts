import * as Joi from 'joi';

export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'production', 'test')
    .default('development'),
  PORT: Joi.number().default(3001),
  CORS_ORIGIN: Joi.string().uri().default('http://localhost:5173'),
  LOG_LEVEL: Joi.string()
    .valid('error', 'warn', 'log', 'debug', 'verbose')
    .default('log'),

  GROQ_API_KEY: Joi.string().required().messages({
    'any.required':
      'GROQ_API_KEY is required. Get one free at https://console.groq.com/keys',
  }),

  ELEVENLABS_API_KEY: Joi.string().when('TTS_PROVIDER', {
    is: 'elevenlabs',
    then: Joi.required().messages({
      'any.required':
        'ELEVENLABS_API_KEY required when TTS_PROVIDER=elevenlabs. Get one at https://elevenlabs.io/app/settings/api-keys',
    }),
    otherwise: Joi.optional(),
  }),
  ELEVENLABS_VOICE_ID: Joi.string().default('21m00Tcm4TlvDq8ikWAM'),
  TTS_PROVIDER: Joi.string().valid('elevenlabs', 'edge').default('elevenlabs'),

  // Externally-reachable host (no scheme) used to build the wss:// URL Twilio
  // dials into. In dev set this to your ngrok host. If absent, the TwiML
  // controller falls back to the request's Host header.
  PUBLIC_HOST: Joi.string().optional(),
});
