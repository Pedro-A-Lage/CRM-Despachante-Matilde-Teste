import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
    Users,
    Car,
    FileText,
    Search,
    ClipboardList,
    MessageSquare,
    Database,
    Menu,
    X,
    ExternalLink,
    Calendar,
    Sun,
    Moon,
    LogOut,
    DollarSign,
    ClipboardCheck,
    ChevronDown,
    Settings,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

interface NavItem {
    to: string;
    icon: React.ElementType;
    label: string;
    /** Optional role required. undefined = all roles can see */
    requiredRole?: 'admin' | 'gerente';
}

interface NavGroup {
    key: string;
    title: string;
    items: NavItem[];
    defaultOpen: boolean;
}

const navGroups: NavGroup[] = [
    {
        key: 'operacoes',
        title: 'Operações',
        defaultOpen: true,
        items: [
            { to: '/ordens', icon: FileText, label: 'Ordens de Serviço' },
            { to: '/servicos', icon: ExternalLink, label: 'Serviços Detran' },
            { to: '/protocolos', icon: ClipboardList, label: 'Protocolo Diário' },
            { to: '/calendario-vistorias', icon: Calendar, label: 'Agendamentos' },
        ],
    },
    {
        key: 'cadastros',
        title: 'Cadastros',
        defaultOpen: true,
        items: [
            { to: '/clientes', icon: Users, label: 'Clientes' },
            { to: '/veiculos', icon: Car, label: 'Veículos' },
        ],
    },
    {
        key: 'financeiro',
        title: 'Financeiro',
        defaultOpen: true,
        items: [
            { to: '/financeiro', icon: DollarSign, label: 'Financeiro', requiredRole: 'admin' },
            { to: '/controle-pagamentos', icon: ClipboardCheck, label: 'Controle de Pagamentos', requiredRole: 'gerente' },
            { to: '/emails', icon: MessageSquare, label: 'E-mails' },
        ],
    },
    {
        key: 'configuracoes',
        title: 'Configurações',
        defaultOpen: false,
        items: [
            { to: '/configuracoes', icon: Settings, label: 'Serviços', requiredRole: 'admin' },
            { to: '/usuarios', icon: Users, label: 'Usuários', requiredRole: 'admin' },
            { to: '/backup', icon: Database, label: 'Backup', requiredRole: 'admin' },
        ],
    },
];

function getStoredGroupState(key: string, defaultOpen: boolean): boolean {
    try {
        const stored = localStorage.getItem(`sidebar_group_${key}`);
        if (stored === null) return defaultOpen;
        return stored === 'true';
    } catch {
        return defaultOpen;
    }
}

function setStoredGroupState(key: string, open: boolean): void {
    try {
        localStorage.setItem(`sidebar_group_${key}`, String(open));
    } catch {
        // ignore storage errors
    }
}

function useTheme() {
    const [theme, setTheme] = React.useState<'dark' | 'light'>(() => {
        const saved = localStorage.getItem('theme');
        return (saved === 'light' || saved === 'dark') ? saved : 'dark';
    });

    React.useEffect(() => {
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem('theme', theme);
    }, [theme]);

    const toggleTheme = () => setTheme((t) => (t === 'dark' ? 'light' : 'dark'));

    return { theme, toggleTheme };
}

// --- Collapsible Group Component ---
interface CollapsibleGroupProps {
    group: NavGroup;
    onLinkClick: () => void;
}

function CollapsibleGroup({ group, onLinkClick }: CollapsibleGroupProps) {
    const [open, setOpen] = React.useState(() =>
        getStoredGroupState(group.key, group.defaultOpen)
    );

    const toggle = () => {
        const next = !open;
        setOpen(next);
        setStoredGroupState(group.key, next);
    };

    return (
        <div className="sidebar-group">
            <button
                className="sidebar-group-header"
                onClick={toggle}
                aria-expanded={open}
                type="button"
            >
                <span className="sidebar-group-title">{group.title}</span>
                <ChevronDown
                    size={14}
                    className={`sidebar-group-chevron ${open ? '' : 'collapsed'}`}
                />
            </button>

            <div className={`sidebar-group-items ${open ? 'open' : ''}`}>
                {group.items.map((item) => (
                    <NavLink
                        key={item.to}
                        to={item.to}
                        end={item.to === '/'}
                        title={item.label}
                        className={({ isActive }) =>
                            `sidebar-link sidebar-link--indented ${isActive ? 'active' : ''}`
                        }
                        onClick={onLinkClick}
                    >
                        <item.icon size={18} />
                        {item.label}
                    </NavLink>
                ))}
            </div>
        </div>
    );
}

interface LayoutProps {
    children: React.ReactNode;
}

export default function Layout({ children }: LayoutProps) {
    const [sidebarOpen, setSidebarOpen] = React.useState(false);
    const [searchQuery, setSearchQuery] = React.useState('');
    const searchInputRef = React.useRef<HTMLInputElement>(null);
    const location = useLocation();
    const { theme, toggleTheme } = useTheme();
    const { usuario, logout } = useAuth();

    // Keyboard shortcut "/" to focus global search
    React.useEffect(() => {
        function handleKeyDown(e: KeyboardEvent) {
            const tag = (e.target as HTMLElement).tagName;
            const isEditableTarget =
                tag === 'INPUT' ||
                tag === 'TEXTAREA' ||
                tag === 'SELECT' ||
                (e.target as HTMLElement).isContentEditable;

            if (e.key === '/' && !isEditableTarget) {
                e.preventDefault();
                searchInputRef.current?.focus();
            }

            if (e.key === 'Escape' && document.activeElement === searchInputRef.current) {
                setSearchQuery('');
                searchInputRef.current?.blur();
            }
        }

        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, []);

    // Role-based + search filtering
    const filteredGroups = React.useMemo(() => {
        const roleFiltered = navGroups.map((group) => ({
            ...group,
            items: group.items.filter((item) => {
                if (item.requiredRole === 'admin' && usuario?.role !== 'admin') return false;
                if (item.requiredRole === 'gerente' && usuario?.role !== 'admin' && usuario?.role !== 'gerente') return false;
                return true;
            }),
        })).filter((group) => group.items.length > 0);

        const q = searchQuery.trim().toLowerCase();
        if (!q) return roleFiltered;

        return roleFiltered
            .map((group) => ({
                ...group,
                items: group.items.filter((item) =>
                    item.label.toLowerCase().includes(q)
                ),
            }))
            .filter((group) => group.items.length > 0);
    }, [searchQuery, usuario?.role]);

    const noResults = filteredGroups.length === 0;

    // Page title
    const getPageTitle = () => {
        const path = location.pathname;
        if (path.startsWith('/clientes')) return 'Clientes';
        if (path.startsWith('/veiculos')) return 'Veículos';
        if (path.startsWith('/ordens')) return 'Ordens de Serviço';
        if (path.startsWith('/calendario-vistorias')) return 'Agenda de Vistorias';
        if (path.startsWith('/consulta')) return 'Consulta de Processos';
        if (path.startsWith('/protocolos')) return 'Protocolo Diário';
        if (path.startsWith('/emails')) return 'Caixa de E-mails';
        if (path.startsWith('/financeiro')) return 'Financeiro';
        if (path.startsWith('/configuracoes')) return 'Configurações de Serviços';
        if (path.startsWith('/usuarios')) return 'Usuários';
        if (path.startsWith('/backup')) return 'Backup / Restaurar';
        return 'Despachante Matilde';
    };

    const closeSidebar = () => setSidebarOpen(false);

    return (
        <div className="app-layout">
            {/* Mobile overlay */}
            {sidebarOpen && (
                <div
                    className="modal-overlay"
                    style={{ zIndex: 99 }}
                    onClick={closeSidebar}
                />
            )}

            {/* Sidebar */}
            <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
                <div className="sidebar-logo">
                    <img src="/logo.png" alt="Despachante Matilde" />
                </div>

                <nav className="sidebar-nav">
                    {/* Global search */}
                    <div style={{ padding: '0 12px 8px' }}>
                        <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                            <Search
                                size={13}
                                style={{
                                    position: 'absolute',
                                    left: 9,
                                    color: 'var(--color-text-tertiary)',
                                    pointerEvents: 'none',
                                    flexShrink: 0,
                                }}
                            />
                            <input
                                ref={searchInputRef}
                                type="text"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                placeholder="Buscar... (/)"
                                aria-label="Busca de menu"
                                style={{
                                    width: '100%',
                                    background: 'var(--bg-body)',
                                    border: '1px solid var(--border-color)',
                                    borderRadius: 8,
                                    padding: '6px 8px 6px 28px',
                                    fontSize: 12,
                                    color: 'var(--color-text-primary)',
                                    outline: 'none',
                                    fontFamily: 'inherit',
                                    transition: 'border-color 0.15s',
                                }}
                                onFocus={(e) => {
                                    e.currentTarget.style.borderColor = 'var(--color-primary)';
                                }}
                                onBlur={(e) => {
                                    e.currentTarget.style.borderColor = 'var(--border-color)';
                                }}
                            />
                        </div>
                    </div>

                    {/* Collapsible groups */}
                    {filteredGroups.map((group) => (
                        <CollapsibleGroup
                            key={group.key}
                            group={group}
                            onLinkClick={closeSidebar}
                        />
                    ))}

                    {/* No results */}
                    {noResults && (
                        <div style={{
                            padding: '24px 16px',
                            textAlign: 'center',
                            fontSize: 12,
                            color: 'var(--color-text-tertiary)',
                        }}>
                            Nenhum item encontrado
                        </div>
                    )}

                    {/* Theme Toggle */}
                    <button
                        className="theme-toggle"
                        onClick={toggleTheme}
                        title={theme === 'dark' ? 'Modo Claro' : 'Modo Escuro'}
                    >
                        {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
                        {theme === 'dark' ? 'Modo Claro' : 'Modo Escuro'}
                    </button>

                    {/* User Info & Logout */}
                    {usuario && (
                        <div style={{
                            marginTop: 'auto',
                            padding: '16px 20px',
                            borderTop: '1px solid var(--border-color)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: 10,
                        }}>
                            <div style={{ minWidth: 0 }}>
                                <div style={{
                                    fontSize: '0.85rem',
                                    fontWeight: 700,
                                    color: 'var(--sidebar-text)',
                                    whiteSpace: 'nowrap',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                }}>
                                    {usuario.nome}
                                </div>
                                <div style={{
                                    fontSize: '0.7rem',
                                    color: 'var(--sidebar-text-muted)',
                                    textTransform: 'capitalize',
                                }}>
                                    {usuario.role === 'admin' ? 'Administrador' : usuario.role === 'gerente' ? 'Gerente' : 'Funcionário'}
                                </div>
                            </div>
                            <button
                                onClick={logout}
                                title="Sair"
                                aria-label="Sair do sistema"
                                style={{
                                    background: 'none',
                                    border: 'none',
                                    cursor: 'pointer',
                                    color: 'var(--sidebar-text-muted)',
                                    padding: 6,
                                    borderRadius: 8,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    transition: 'color 0.15s',
                                }}
                                onMouseEnter={e => (e.currentTarget.style.color = 'var(--color-danger)')}
                                onMouseLeave={e => (e.currentTarget.style.color = 'var(--sidebar-text-muted)')}
                            >
                                <LogOut size={18} />
                            </button>
                        </div>
                    )}
                </nav>
            </aside>

            {/* Main Content */}
            <div className="main-content">
                <header className="main-header">
                    <div className="flex items-center gap-3">
                        <button
                            className="btn-ghost"
                            style={{
                                display: 'none',
                                padding: '8px',
                                border: 'none',
                                background: 'none',
                                cursor: 'pointer',
                            }}
                            onClick={() => setSidebarOpen(!sidebarOpen)}
                            id="mobile-menu-btn"
                        >
                            {sidebarOpen ? <X size={24} /> : <Menu size={24} />}
                        </button>
                        <h1>{getPageTitle()}</h1>
                    </div>
                </header>

                <main className="main-body">{children}</main>
            </div>

            <style>{`
        @media (max-width: 1024px) {
          #mobile-menu-btn { display: block !important; }
        }

        /* Collapsible group header */
        .sidebar-group-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          width: 100%;
          padding: 14px var(--space-4) 4px var(--space-4);
          background: none;
          border: none;
          cursor: pointer;
          font-size: 9px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.10em;
          color: var(--color-text-tertiary);
          transition: color 140ms ease;
          font-family: inherit;
        }

        .sidebar-group-header:hover {
          color: var(--color-text-secondary);
        }

        .sidebar-group-title {
          flex: 1;
          text-align: left;
        }

        .sidebar-group-chevron {
          transition: transform 220ms cubic-bezier(.4,0,.2,1);
          opacity: 0.6;
          flex-shrink: 0;
        }

        .sidebar-group-chevron.collapsed {
          transform: rotate(-90deg);
        }

        /* Collapsible group items */
        .sidebar-group-items {
          overflow: hidden;
          max-height: 0;
          transition: max-height 280ms cubic-bezier(.4,0,.2,1);
        }

        .sidebar-group-items.open {
          max-height: 600px;
        }

        /* Indented items inside groups */
        .sidebar-link--indented {
          padding-left: var(--space-6) !important;
        }

        /* Thin horizontal divider between dashboard and groups */
        .sidebar-divider {
          margin: 6px var(--space-4);
          border: none;
          border-top: 1px solid rgba(255,255,255,0.06);
        }

        [data-theme="light"] .sidebar-divider {
          border-top-color: rgba(0,0,0,0.08);
        }

        [data-theme="light"] .sidebar-group-header:hover {
          color: var(--color-text-primary);
        }
      `}</style>
        </div>
    );
}
