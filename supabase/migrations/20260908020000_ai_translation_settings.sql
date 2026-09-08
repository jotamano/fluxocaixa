-- Provider settings for translating service names through the server-side Edge Function.
alter table public.app_settings
  add column if not exists ai_translation_provider text not null default 'gemini'
    check (ai_translation_provider in ('gemini', 'openrouter')),
  add column if not exists ai_translation_model text not null default 'gemini-2.5-flash',
  add column if not exists ai_translation_api_key text;

comment on column public.app_settings.ai_translation_provider is 'AI provider used to translate service names';
comment on column public.app_settings.ai_translation_model is 'Provider model identifier used for service-name translation';
comment on column public.app_settings.ai_translation_api_key is 'API key used by the offline browser translation action';
