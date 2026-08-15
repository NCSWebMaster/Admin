// NCS OnePlace — supabase-client.js
// Single shared Supabase client. Every page loads this after the Supabase CDN script.

const SUPABASE_URL = 'https://eqgzfrzokhowpedderrb.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVxZ3pmcnpva2hvd3BlZGRlcnJiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE2MjU4ODIsImV4cCI6MjA5NzIwMTg4Mn0.r94X0ZGSdAO_vtd4dXQKmjdVFtPZ7wSpYeUVzPAkjJo';

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
