import express from 'express';
import multer from 'multer';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { tmpdir } from 'os';
import { writeFile, readFile, unlink } from 'fs/promises';
import { randomBytes } from 'crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

const upload = multer({ limits: { fileSize: 25 * 1024 * 1024 } });
const LIBREOFFICE_BIN = process.env.LIBREOFFICE_BIN || 'libreoffice';

// Converte planilha (.xlsx) para PDF usando LibreOffice headless.
app.post('/api/recibo/pdf', upload.single('file'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'Arquivo .xlsx ausente (campo "file").' });

    const id = randomBytes(8).toString('hex');
    const dir = tmpdir();
    const inPath = join(dir, `recibo-${id}.xlsx`);
    const outPath = join(dir, `recibo-${id}.pdf`);

    try {
        await writeFile(inPath, req.file.buffer);

        await new Promise((resolve, reject) => {
            const proc = spawn(LIBREOFFICE_BIN, [
                '--headless', '--norestore', '--nolockcheck',
                '--convert-to', 'pdf', '--outdir', dir, inPath,
            ]);
            let stderr = '';
            proc.stderr.on('data', (d) => { stderr += d.toString(); });
            proc.on('error', reject);
            proc.on('exit', (code) => {
                if (code === 0) resolve(undefined);
                else reject(new Error(`libreoffice exit ${code}: ${stderr}`));
            });
        });

        const pdf = await readFile(outPath);
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'attachment; filename="recibo.pdf"');
        res.send(pdf);
    } catch (err) {
        console.error('[recibo/pdf]', err);
        res.status(500).json({ error: String(err?.message || err) });
    } finally {
        unlink(inPath).catch(() => {});
        unlink(outPath).catch(() => {});
    }
});

// Serve static files from dist
app.use(express.static(join(__dirname, 'dist')));

// SPA fallback - all routes serve index.html
app.get('*', (req, res) => {
    res.sendFile(join(__dirname, 'dist', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
