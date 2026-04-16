import express from 'express';
import multer from 'multer';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { tmpdir } from 'os';
import { writeFile, readFile, unlink, access } from 'fs/promises';
import { randomBytes } from 'crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

const upload = multer({ limits: { fileSize: 25 * 1024 * 1024 } });
const LIBREOFFICE_BIN = process.env.LIBREOFFICE_BIN || 'libreoffice';
const LIBREOFFICE_PROFILE = process.env.LIBREOFFICE_PROFILE_DIR || join(tmpdir(), 'lo-profile');

// Converte planilha (.xlsx) para PDF usando LibreOffice headless.
app.post('/api/recibo/pdf', upload.single('file'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'Arquivo .xlsx ausente (campo "file").' });

    const id = randomBytes(8).toString('hex');
    const dir = tmpdir();
    const inPath = join(dir, `recibo-${id}.xlsx`);
    const outPath = join(dir, `recibo-${id}.pdf`);

    try {
        await writeFile(inPath, req.file.buffer);

        const { stdout, stderr, code } = await new Promise((resolve, reject) => {
            const proc = spawn(LIBREOFFICE_BIN, [
                '--headless', '--norestore', '--nolockcheck', '--nofirststartwizard',
                `-env:UserInstallation=file://${LIBREOFFICE_PROFILE}`,
                '--convert-to', 'pdf', '--outdir', dir, inPath,
            ]);
            let out = '', err = '';
            proc.stdout.on('data', (d) => { out += d.toString(); });
            proc.stderr.on('data', (d) => { err += d.toString(); });
            proc.on('error', reject);
            proc.on('exit', (c) => resolve({ stdout: out, stderr: err, code: c }));
        });

        // LibreOffice às vezes sai com código 0 e mesmo assim não gera o PDF.
        // Checa explicitamente se o arquivo existe.
        try {
            await access(outPath);
        } catch {
            const msg = `LibreOffice não produziu o PDF (exit ${code}). stdout=${stdout.trim()} stderr=${stderr.trim()}`;
            throw new Error(msg);
        }

        const pdf = await readFile(outPath);
        if (pdf.length < 100 || !pdf.slice(0, 4).equals(Buffer.from('%PDF'))) {
            throw new Error(`Arquivo de saída não é um PDF válido (${pdf.length} bytes).`);
        }

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

// SPA fallback - all routes serve index.html.
// Usa regex porque Express 5 não aceita mais 'app.get("*", ...)'.
app.get(/.*/, (req, res) => {
    res.sendFile(join(__dirname, 'dist', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
