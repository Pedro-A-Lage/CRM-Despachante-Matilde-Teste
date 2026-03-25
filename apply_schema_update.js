import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://mrcclxbzdwarfhgygikc.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1yY2NseGJ6ZHdhcmZoZ3lnaWtjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI1MzQ1NTAsImV4cCI6MjA4ODExMDU1MH0.J4bYHtJRT6AEhThY1RvovpTPUC_kjakH6U7S-NXVeno';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function main() {
    console.log("Applying schema updates...");

    // Note: The js client does not have a direct way to execute raw DDL queries using anon key by default
    // We will simulate it here by trying to do an insert to see if the columns exist, or doing simple select 
    // Since we only added columns, we can just log a message asking the user to run it in the SQL Editor.

    console.log("-----------------------------------------------------------------------------------------");
    console.log("ATENÇÃO: Para atualizar o schema, por favor execute o seguinte código no SQL Editor do Supabase:");
    console.log("");
    console.log("ALTER TABLE clientes ADD COLUMN IF NOT EXISTS pasta_supabase_path TEXT;");
    console.log("ALTER TABLE veiculos ADD COLUMN IF NOT EXISTS pasta_supabase_path TEXT;");
    console.log("ALTER TABLE ordens_de_servico ADD COLUMN IF NOT EXISTS pasta_supabase TEXT;");
    console.log("-----------------------------------------------------------------------------------------");
}

main().catch(console.error);
