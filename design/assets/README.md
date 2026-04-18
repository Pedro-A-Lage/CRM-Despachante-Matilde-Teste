# Assets do Designer

Coloque aqui tudo que for **referência visual estática**: logos, mockups,
brand guidelines em PNG/PDF, screenshots de inspiração, ícones customizados.

> Esta pasta é para **referência**, não para arquivos servidos pela app.
> Logos e imagens que a app realmente usa em runtime ficam em
> [`/public/`](../../public/).

---

## Convenção de nomes

Use kebab-case e seja descritivo:

| Exemplo                                     | Tipo                              |
| ------------------------------------------- | --------------------------------- |
| `logo-matilde-light.svg`                    | Logo para fundo claro             |
| `logo-matilde-dark.svg`                     | Logo para fundo escuro            |
| `logo-matilde-icon-only.svg`                | Símbolo sem texto                 |
| `mockup-dashboard-2026-04.png`              | Mockup do Figma com data          |
| `mockup-os-detail-v3.png`                   | Iteração de mockup numerada       |
| `brand-colors.png`                          | Paleta oficial                    |
| `inspiracao-notion-sidebar.png`             | Referência externa                |
| `icon-set-custom.svg`                       | Conjunto de ícones próprios       |

---

## Estrutura sugerida

```
assets/
├── logo/                  # Variações do logo
├── mockups/               # Telas projetadas pelo designer (Figma exports)
├── brand/                 # Cores oficiais, tipografia, voice & tone
├── inspiracao/            # Referências externas (Notion, Linear, Stripe)
└── icons/                 # Ícones customizados que não estão no lucide-react
```

Crie a subpasta quando precisar — não é obrigatório usar todas.

---

## Formatos preferidos

| Tipo            | Formato preferido                | Backup          |
| --------------- | -------------------------------- | --------------- |
| Logo            | SVG                              | PNG @2x         |
| Mockup          | PNG @2x                          | PDF             |
| Ícone           | SVG (1 path quando possível)     | —               |
| Foto/Screenshot | PNG ou WebP                      | JPG (qualidade ≥85) |
| Documento       | PDF                              | —               |

⚠️ **Não commitar arquivos > 5MB** sem necessidade real. Comprima antes
(SVGO, TinyPNG).

---

## O que **não** colocar aqui

- Arquivos servidos pela app em runtime → vão em `public/`.
- Componentes React/HTML → vão em `src/components/`.
- Estilos globais → vão em `src/index.css`.
- Documentação de implementação → vai nas outras pastas de `design/`.
- Arquivos `.fig` do Figma — eles são pesados; prefira link no `notes.md` da
  subpasta. Mantenha apenas exports PNG/SVG no repo.
