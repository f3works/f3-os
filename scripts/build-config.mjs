import { writeFileSync } from 'node:fs';

const url = process.env.VITE_SUPABASE_URL || '';
const key = process.env.VITE_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY || '';
const content = `window.__F3_CONFIG__ = ${JSON.stringify({ supabaseUrl: url, supabaseKey: key })};\n`;
writeFileSync('env.js', content);
console.log('F3 OS runtime config generated.');
