import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://mrcclxbzdwarfhgygikc.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1yY2NseGJ6ZHdhcmZoZ3lnaWtjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI1MzQ1NTAsImV4cCI6MjA4ODExMDU1MH0.J4bYHtJRT6AEhThY1RvovpTPUC_kjakH6U7S-NXVeno';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function clearTable(tableName) {
    console.log(`Clearing table: ${tableName}...`);
    const { error } = await supabase.from(tableName).delete().neq('id', '00000000-0000-0000-0000-000000000000');
    if (error) {
        console.error(`Error clearing ${tableName}:`, error.message);
    } else {
        console.log(`Successfully cleared ${tableName}.`);
    }
}

async function emptyBucket(bucketName, path = '') {
    console.log(`Emptying bucket ${bucketName} (path: '${path}')...`);
    const { data: files, error } = await supabase.storage.from(bucketName).list(path, { limit: 100, offset: 0 });

    if (error) {
        console.error(`Error listing bucket ${bucketName}:`, error.message);
        return;
    }

    if (!files || files.length === 0) {
        console.log(`Nothing to delete in ${bucketName} (path: '${path}').`);
        return;
    }

    const filesToRemove = [];
    for (const file of files) {
        const filePath = path ? `${path}/${file.name}` : file.name;
        // If it doesn't have an ID, it's likely a folder. Supabase storage represents empty folders this way.
        if (file.id === null) {
            // It's a folder, recurse
            console.log(`Found folder: ${filePath}, recursing...`);
            await emptyBucket(bucketName, filePath);
            // The empty folder should also be removed if it's explicitly tracked, but supabase 
            // empty folders are just prefix markers sometimes. We can try to delete them anyway.
            filesToRemove.push(filePath);
        } else {
            filesToRemove.push(filePath);
        }
    }

    if (filesToRemove.length > 0) {
        console.log(`Removing ${filesToRemove.length} objects from ${bucketName}...`);
        const { error: removeError, data } = await supabase.storage.from(bucketName).remove(filesToRemove);
        if (removeError) {
            console.error(`Error removing objects from bucket ${bucketName}`, removeError);
        } else {
            console.log(`Removed objects.`);
        }
    }
}

async function main() {
    console.log("Starting database reset...");

    // Deletion order is important due to foreign keys: 
    // 1. ordens_de_servico (refers to clientes, veiculos)
    // 2. veiculos (refers to clientes)
    // 3. clientes
    // 4. protocolos_diarios

    await clearTable('ordens_de_servico');
    await clearTable('veiculos');
    await clearTable('clientes');
    await clearTable('protocolos_diarios');

    // empty buckets
    await emptyBucket('documentos');

    console.log("Database reset complete.");
}

main().catch(console.error);
