import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// Parse .env manually without dotenv
const envText = readFileSync(resolve(__dirname, '../.env'), 'utf-8');
const env: Record<string, string> = {};
envText.split('\n').forEach(line => {
    const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
    if (match) {
        env[match[1]] = match[2];
    }
});

const supabaseUrl = env['VITE_SUPABASE_URL']!;
const supabaseKey = env['VITE_SUPABASE_ANON_KEY']!;

const supabase = createClient(supabaseUrl, supabaseKey);

async function fixOS() {
    console.log('Fetching OS 34 and 35...');
    const { data: ordens, error } = await supabase
        .from('ordens_de_servico')
        .select('*')
        .in('numero', [34, 35]);

    if (error) {
        console.error('Error fetching OS:', error);
        return;
    }

    for (const os of ordens) {
        if (os.delegacia && os.delegacia.entradas && os.delegacia.entradas.length > 0) {
            const entradas = [...os.delegacia.entradas];
            const lastEntry = entradas[entradas.length - 1];
            
            if (lastEntry.tipo === 'entrada') {
                lastEntry.tipo = 'sifap';
                
                const { error: updateError } = await supabase
                    .from('ordens_de_servico')
                    .update({ delegacia: { entradas } })
                    .eq('id', os.id);

                if (updateError) {
                    console.error(`Error updating OS ${os.numero}:`, updateError);
                } else {
                    console.log(`Successfully updated OS ${os.numero} to SIFAP.`);
                }
            } else {
                console.log(`OS ${os.numero} already has type ${lastEntry.tipo}, skipping.`);
            }
        }
    }
}

fixOS();
