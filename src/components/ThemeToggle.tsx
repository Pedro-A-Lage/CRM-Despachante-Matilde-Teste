import { Sun, Moon } from 'lucide-react';
import { useTheme } from '@/contexts/ThemeContext';

export function ThemeToggle() {
  const { theme, toggle } = useTheme();
  const Icon = theme === 'light' ? Moon : Sun;
  const label = theme === 'light' ? 'Ativar modo escuro' : 'Ativar modo claro';

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={label}
      title={label}
      className="inline-flex items-center justify-center h-9 w-9 rounded-micro text-text hover:bg-[rgba(0,0,0,0.05)] dark:hover:bg-[rgba(255,255,255,0.08)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-focus transition-colors"
    >
      <Icon className="h-5 w-5" />
    </button>
  );
}
