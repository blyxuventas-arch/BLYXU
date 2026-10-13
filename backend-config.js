// Change provider to 'supabase' only after the independent server passes live checks.
window.BLYXU_BACKEND = Object.freeze({
  provider: 'apps-script',
  appsScript: 'https://script.google.com/macros/s/AKfycbyMytX5vDXXvNxywckgVmGObGfjLLJEo5iFkJdfqOoDdomVmJ--tnPsOPcmXVSyP9BzuQ/exec',
  supabase: 'https://cufptttzflkdwizpqaot.supabase.co/functions/v1/blyxu-api'
});
window.BLYXU_API_URL = window.BLYXU_BACKEND.provider === 'supabase'
  ? window.BLYXU_BACKEND.supabase : window.BLYXU_BACKEND.appsScript;
