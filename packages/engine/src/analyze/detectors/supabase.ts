import fs from 'node:fs';
import path from 'node:path';

export const detectSupabase = (repoRoot: string, pkg: Record<string, string>): boolean =>
  fs.existsSync(path.join(repoRoot, 'supabase')) || Boolean(pkg['@supabase/supabase-js']);
