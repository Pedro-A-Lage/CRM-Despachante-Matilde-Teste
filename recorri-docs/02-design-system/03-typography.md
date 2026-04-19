# Tipografia e escala

> Três famílias, cada uma com papel claro. Canônico em
> [`design/tokens.md`](../../design/tokens.md).

---

## Famílias

| Variável         | Fonte            | Quando usar                            |
| ---------------- | ---------------- | -------------------------------------- |
| `--font-display` | **Fraunces**     | Hero, capas, títulos especiais         |
| `--font-body`    | **Inter**        | Toda UI padrão, h1/h2/h3, forms, tabelas |
| `--font-mono`    | **IBM Plex Mono**| Placas, IDs de OS, valores R$, RENAVAM, chassi |

Fontes carregadas no `<head>` do [`index.html`](../../index.html) via Google
Fonts.

### Classes utilitárias

```html
<!-- Fraunces -->
<h1 class="font-display">Despachante Matilde</h1>

<!-- Plex Mono -->
<span class="font-mono">OS-2615 · FAX-2K44 · R$ 1.671,20</span>

<!-- Inter (default) -->
<p>Corpo normal.</p>
```

Via Tailwind: `font-sans` (Inter), `font-display`, `font-mono`.

---

## Escala (Tailwind + recomendação de uso)

Definida em [`tailwind.config.js`](../../tailwind.config.js):

| Role         | Classe Tailwind       | Tamanho   | Peso | Família  | Uso prático                    |
| ------------ | --------------------- | --------- | ---- | -------- | ------------------------------ |
| Display hero | `text-display-hero`   | `4.00rem` | 700  | Fraunces | Hero, landing                  |
| Display 2    | `text-display-2`      | `3.38rem` | 700  | Fraunces | Capa interna, marco            |
| Section      | `text-section`        | `3.00rem` | 700  | Fraunces | Abertura de seção              |
| Sub-lg       | `text-sub-lg`         | `2.50rem` | 700  | Inter    | Título 2º nível                |
| Sub          | `text-sub`            | `1.63rem` | 700  | Inter    | Página padrão (H2)             |
| Card title   | `text-card-title`     | `1.38rem` | 700  | Inter    | Título de card                 |
| Body lg      | `text-body-lg`        | `1.25rem` | 600  | Inter    | Destaques dentro de card       |
| Nav          | `text-nav`            | `0.94rem` | 600  | Inter    | Item de sidebar/menu           |
| Caption      | `text-caption`        | `0.88rem` | 500  | Inter    | Metadados, timestamp           |
| Badge        | `text-badge-text`     | `0.75rem` | 600  | Inter    | Badges, eyebrows uppercase     |
| Body         | `text-sm`             | `0.875rem`| 400  | Inter    | Corpo padrão                   |

### Hierarquia típica de uma página

```html
<!-- Header do app -->
<h1 class="text-sub">Ordens de Serviço</h1>

<!-- Card title -->
<h3 class="text-card-title">Dados do veículo</h3>

<!-- Label dentro do card -->
<label class="text-caption text-text-secondary">Placa</label>
<span class="font-mono">FAX-2K44</span>

<!-- Body -->
<p class="text-sm text-text">Texto corrente.</p>
```

---

## Quando usar mono

Use Plex Mono para tudo que é **dado estruturado que o despachante lê e digita
de volta**:

- Placas (`FAX-2K44`)
- IDs de OS (`#2615`, `OS-2615`)
- RENAVAM, chassi
- CPF / CNPJ (opcional, discutir caso a caso)
- Valores monetários (`R$ 1.671,20`)
- Datas em formato ISO (`2026-04-19`)

Texto narrativo, nome de cliente, label de form — **não** é mono.

---

## Quando usar Fraunces (display)

Raramente. Hoje Fraunces aparece em:

- Logo e hero da home/login.
- Títulos de marco (ex: mensagem de sucesso grande após um passo importante).
- Telas vazias (`empty-state`) com mensagem acolhedora.

Se em dúvida, **não use Fraunces**. O padrão é Inter.

---

## Letterspacing e line-height

Já vêm embutidos na escala Tailwind (ver `tailwind.config.js`). **Não
sobrescreva** a menos que esteja criando um token novo.

---

## Pesos

- **400** — body.
- **500** — caption, mono.
- **600** — labels, nav, body-lg, badges.
- **700** — headers e display.

Nada de peso 300 (fino) ou 900 (preto) — não estão na escala.

---

## Mobile

- Inputs têm `font-size: 16px` forçado (iOS zoom).
- H1 no `main-header` reduz de `1.375rem` pra `1.1rem` em ≤768px (regra já em
  `index.css`).
- Não crie escalas alternativas para mobile — a escala já é responsiva.

---

## Anti-patterns

❌ `style="font-family: 'Fraunces'"` — use `.font-display`.
❌ `font-size: 13px` solto — use a escala (`text-sm`, `text-caption`, etc).
❌ Usar mono em texto narrativo (só em dados).
❌ Misturar pesos aleatórios (peso 500 em header, peso 700 em body).
