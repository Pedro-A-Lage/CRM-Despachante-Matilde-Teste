# Sistema de ícones

> Usamos **lucide-react** como única biblioteca de ícones. Sem SVG inline
> ad-hoc, sem Font Awesome, sem emoji em UI séria.

---

## Biblioteca

**[lucide-react](https://lucide.dev/)** — instalada (ver
[`package.json`](../../package.json): `"lucide-react": "^0.460.0"`).

Por que lucide?

- Tree-shakable (só o que você importa vai pro bundle).
- Open source, estilo Feather moderno.
- 1200+ ícones cobrindo todo o domínio do CRM.
- Stroke-based → combina com o minimalismo warm do design system.

---

## Uso

```tsx
import { User, Car, FileText, Check, X } from 'lucide-react';

<User size={16} className="text-text-muted" />
<Car size={20} />
<FileText size={18} className="text-amber" />
```

### Tamanhos padrão

| Contexto                       | `size`      |
| ------------------------------ | ----------- |
| Ícone em botão                 | `16`        |
| Ícone em sidebar link          | `16`        |
| Ícone em item de lista         | `18`        |
| Ícone dentro de `.stat-card`   | `20`        |
| Ícone destaque (hero, header)  | `24` ou `32`|

**Não use tamanhos aleatórios** (17, 19, 23). Se precisar de outro, discuta
antes.

### Cor

Herdada via `currentColor` ou classe Tailwind:

```tsx
<Check className="text-status-success" />
<X className="text-status-danger" />
<FileText className="text-text-muted" />
```

⚠️ Não use `color="#xxx"` — use classe.

### Stroke

Default do lucide é `strokeWidth={2}`. Para ícones em contextos mais sutis
(empty state, background decorativo), use `strokeWidth={1.5}`.

---

## Convenções

### 1. Sempre do lucide

❌ Não importe SVG inline aleatório, não copie-cole de repositórios.
✅ Se falta um ícone no lucide, **discuta antes de adicionar** (ver "quando
criar ícone custom" abaixo).

### 2. Com texto, sempre à esquerda

```tsx
<button className="btn btn-primary">
  <Plus size={16} />
  Nova OS
</button>
```

Ícone `size=16`, gap herdado do `.btn`.

### 3. Só-ícone → `aria-label`

```tsx
<button className="btn btn-ghost" aria-label="Fechar">
  <X size={18} />
</button>
```

Sem `aria-label`, leitor de tela não tem como ler. Isso é parte do
[checklist de acessibilidade](./08-accessibility.md).

### 4. Estado via cor, não via ícone diferente

Se uma linha pode estar OK ou com erro, use o **mesmo** ícone mudando a cor
(`text-status-success` vs `text-status-danger`), ou adicione um ícone de
estado em adição — não troque o ícone base.

---

## Catálogo — mapeamento de domínio

Ícones usados no CRM e seu significado:

| Conceito                | Ícone                        |
| ----------------------- | ---------------------------- |
| Cliente (PF)            | `User`                       |
| Cliente (PJ)            | `Building2`                  |
| Veículo (carro)         | `Car`                        |
| Veículo (moto)          | `Bike` ou `Motorcycle`       |
| OS / Ordem              | `ClipboardList` / `FileText` |
| Dashboard               | `LayoutDashboard`            |
| Kanban                  | `Columns3`                   |
| Busca                   | `Search`                     |
| Novo / adicionar        | `Plus`                       |
| Editar                  | `Pencil`                     |
| Excluir                 | `Trash2`                     |
| Confirmar / aprovado    | `Check` / `CheckCircle2`     |
| Reprovado / erro        | `X` / `XCircle`              |
| Aviso / pendente        | `AlertTriangle`              |
| Info                    | `Info`                       |
| Upload                  | `Upload` / `UploadCloud`     |
| Download                | `Download`                   |
| Anexo                   | `Paperclip`                  |
| Impressão               | `Printer`                    |
| Telefone                | `Phone`                      |
| Email                   | `Mail`                       |
| WhatsApp                | `MessageCircle`              |
| Data / calendário       | `Calendar`                   |
| Hora                    | `Clock`                      |
| Localização             | `MapPin`                     |
| Usuários / permissões   | `Users` / `Shield`           |
| Configuração            | `Settings` / `Cog`           |
| Olhos (senha)           | `Eye` / `EyeOff`             |
| Dinheiro                | `DollarSign` / `CircleDollarSign` |
| Documento pronto        | `FileCheck`                  |
| Documento pendente      | `FileClock`                  |
| Vistoria                | `ClipboardCheck`             |
| Delegacia               | `Landmark`                   |

Se o conceito não está aqui, procure em https://lucide.dev/icons e **adicione
ao catálogo** neste doc quando usar (mantém a referência viva).

---

## Quando criar ícone custom

Quase nunca. Casos possíveis:

1. **Logo da marca** — vive em `public/` como SVG exportado do designer.
2. **Ícone de empresa parceira** — logo externo, caso a caso.

Passos:

1. SVG único com `viewBox="0 0 24 24"` e `stroke="currentColor"`.
2. Coloque em `src/components/icons/NomeIcon.tsx` como React component.
3. Documente aqui.

---

## Emoji em UI

Restrito a:

- `.stat-card-icon` legado (a migrar para lucide).
- Componentes de celebração específicos (ex: "🎉 Processo concluído").
- **Não** em botões, labels, status de OS, menus.

Em dúvida, **prefira lucide**.
