// src/components/DocListEditor.tsx
import React, { useState } from 'react';
import { X } from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';

interface DocListEditorProps {
  label: string;
  docs: string[];
  onChange: (docs: string[]) => void;
}

export function DocListEditor({ label, docs, onChange }: DocListEditorProps) {
  const [input, setInput] = useState('');

  const add = () => {
    const trimmed = input.trim();
    if (!trimmed || docs.includes(trimmed)) return;
    onChange([...docs, trimmed]);
    setInput('');
  };

  const remove = (idx: number) => {
    onChange(docs.filter((_, i) => i !== idx));
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') { e.preventDefault(); add(); }
  };

  return (
    <div className="flex flex-col gap-2">
      <Label>{label}</Label>

      {docs.length > 0 && (
        <ul className="flex flex-col gap-1">
          {docs.map((doc, idx) => (
            <li key={idx} className="flex items-center justify-between rounded-md border px-3 py-1.5 text-sm">
              <span>{doc}</span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-6 shrink-0"
                onClick={() => remove(idx)}
              >
                <X className="size-3" />
              </Button>
            </li>
          ))}
        </ul>
      )}

      {docs.length === 0 && (
        <p className="text-sm text-muted-foreground">Nenhum documento cadastrado.</p>
      )}

      <div className="flex gap-2">
        <Input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Nome do documento..."
          className="flex-1"
        />
        <Button type="button" variant="outline" size="sm" onClick={add}>
          + Adicionar
        </Button>
      </div>
    </div>
  );
}
