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
    Building2,
    CreditCard,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { temPermissao } from '../lib/permissions';

interface NavItem {
    to: string;
    icon: React.ElementType;
    label: string;
    /** Permission key for visibility check. undefined = always visible */
    permissao?: string;
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
            { to: '/servicos', icon: ExternalLink, label: 'Serviços Detran', permissao: 'servicos_detran' },
            { to: '/protocolos', icon: ClipboardList, label: 'Protocolo Diário', permissao: 'protocolo_diario' },
            { to: '/calendario-vistorias', icon: Calendar, label: 'Agendamentos', permissao: 'calendario_vistorias' },
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
            { to: '/financeiro', icon: DollarSign, label: 'Financeiro', permissao: 'financeiro' },
            { to: '/controle-pagamentos', icon: ClipboardCheck, label: 'Controle de Pagamentos', permissao: 'controle_pagamentos' },
            { to: '/painel-empresas', icon: Building2, label: 'Empresas Parceiras' },
            { to: '/controle-placas', icon: CreditCard, label: 'Controle de Placas' },
            { to: '/emails', icon: MessageSquare, label: 'E-mails', permissao: 'emails' },
        ],
    },
    {
        key: 'configuracoes',
        title: 'Configurações',
        defaultOpen: false,
        items: [
            { to: '/configuracoes', icon: Settings, label: 'Serviços', permissao: 'configuracoes' },
            { to: '/usuarios', icon: Users, label: 'Usuários', permissao: 'usuarios' },
            { to: '/backup', icon: Database, label: 'Backup', permissao: 'backup' },
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
    const [profileOpen, setProfileOpen] = React.useState(false);
    const searchInputRef = React.useRef<HTMLInputElement>(null);
    const profileRef = React.useRef<HTMLDivElement>(null);
    const location = useLocation();
    const { theme, toggleTheme } = useTheme();
    const { usuario, logout } = useAuth();

    // Close profile dropdown on outside click
    React.useEffect(() => {
        const handleClick = (e: MouseEvent) => {
            if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
                setProfileOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClick);
        return () => document.removeEventListener('mousedown', handleClick);
    }, []);

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

    // Permission-based + search filtering
    const filteredGroups = React.useMemo(() => {
        const permFiltered = navGroups.map((group) => ({
            ...group,
            items: group.items.filter((item) => {
                if (!item.permissao) return true;
                return temPermissao(usuario, 'paginas', item.permissao);
            }),
        })).filter((group) => group.items.length > 0);

        const q = searchQuery.trim().toLowerCase();
        if (!q) return permFiltered;

        return permFiltered
            .map((group) => ({
                ...group,
                items: group.items.filter((item) =>
                    item.label.toLowerCase().includes(q)
                ),
            }))
            .filter((group) => group.items.length > 0);
    }, [searchQuery, usuario]);

    const noResults = filteredGroups.length === 0;

    // Page title
    const getPageTitle = () => {
        const path = location.pathname;
        if (path.startsWith('/clientes')) return 'Clientes';
        if (path.startsWith('/veiculos')) return 'Veículos';
        if (path.startsWith('/ordens')) return 'Ordens de Serviço';
        if (path.startsWith('/calendario-vistorias')) return 'Agenda de Vistorias';
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

                    {/* Spacer para empurrar conteúdo para baixo se necessário */}
                    <div style={{ flex: 1 }} />
                </nav>
            </aside>

            {/* Main Content */}
            <div className="main-content">
                <header className="main-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
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

                    {/* Right side: Theme toggle + User profile */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        {/* Theme toggle */}
                        <button
                            onClick={toggleTheme}
                            title={theme === 'dark' ? 'Modo Claro' : 'Modo Escuro'}
                            style={{
                                background: 'rgba(255,255,255,0.06)',
                                border: '1px solid rgba(255,255,255,0.08)',
                                borderRadius: 8,
                                padding: '6px 8px',
                                cursor: 'pointer',
                                color: 'var(--color-text-secondary)',
                                display: 'flex',
                                alignItems: 'center',
                                transition: 'all 0.15s',
                            }}
                        >
                            {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
                        </button>

                        {/* User profile dropdown */}
                        {usuario && (
                            <div ref={profileRef} style={{ position: 'relative' }}>
                                <button
                                    onClick={() => setProfileOpen(!profileOpen)}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 8,
                                        background: profileOpen ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.04)',
                                        border: '1px solid rgba(255,255,255,0.08)',
                                        borderRadius: 8,
                                        padding: '4px 10px 4px 4px',
                                        cursor: 'pointer',
                                        transition: 'all 0.15s',
                                    }}
                                >
                                    {/* Avatar */}
                                    <div style={{
                                        width: 28,
                                        height: 28,
                                        borderRadius: 6,
                                        background: 'linear-gradient(135deg, var(--color-primary), var(--color-yellow-dark))',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        fontSize: 12,
                                        fontWeight: 700,
                                        color: '#000',
                                        flexShrink: 0,
                                    }}>
                                        {usuario.nome.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                                    </div>
                                    <div className="profile-text-block" style={{ textAlign: 'left', minWidth: 0 }}>
                                        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 120 }}>
                                            {usuario.nome}
                                        </div>
                                        <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', textTransform: 'capitalize' }}>
                                            {usuario.role === 'admin' ? 'Admin' : usuario.role === 'gerente' ? 'Gerente' : 'Funcionário'}
                                        </div>
                                    </div>
                                    <ChevronDown size={12} style={{ color: 'var(--color-text-tertiary)', transition: 'transform 0.15s', transform: profileOpen ? 'rotate(180deg)' : 'none' }} />
                                </button>

                                {/* Dropdown */}
                                {profileOpen && (
                                    <div style={{
                                        position: 'absolute',
                                        top: '100%',
                                        right: 0,
                                        marginTop: 6,
                                        width: 200,
                                        background: 'var(--color-gray-800)',
                                        border: '1px solid var(--color-gray-700)',
                                        borderRadius: 10,
                                        boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
                                        zIndex: 100,
                                        overflow: 'hidden',
                                    }}>
                                        {/* User info */}
                                        <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--color-gray-700)' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                <div style={{
                                                    width: 36,
                                                    height: 36,
                                                    borderRadius: 8,
                                                    background: 'linear-gradient(135deg, var(--color-primary), var(--color-yellow-dark))',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    fontSize: 14,
                                                    fontWeight: 700,
                                                    color: '#000',
                                                }}>
                                                    {usuario.nome.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                                                </div>
                                                <div>
                                                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-primary)' }}>{usuario.nome}</div>
                                                    <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', textTransform: 'capitalize' }}>
                                                        {usuario.role === 'admin' ? 'Administrador' : usuario.role === 'gerente' ? 'Gerente' : 'Funcionário'}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Menu items */}
                                        <div style={{ padding: '6px' }}>
                                            <button
                                                onClick={() => { toggleTheme(); setProfileOpen(false); }}
                                                style={{
                                                    width: '100%',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: 8,
                                                    padding: '8px 10px',
                                                    borderRadius: 6,
                                                    background: 'none',
                                                    border: 'none',
                                                    cursor: 'pointer',
                                                    fontSize: 12,
                                                    color: 'var(--color-text-secondary)',
                                                    textAlign: 'left',
                                                }}
                                                className="hover:bg-white/5"
                                            >
                                                {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
                                                {theme === 'dark' ? 'Modo Claro' : 'Modo Escuro'}
                                            </button>

                                            <div style={{ height: 1, background: 'var(--color-gray-700)', margin: '4px 0' }} />

                                            <button
                                                onClick={() => { logout(); setProfileOpen(false); }}
                                                style={{
                                                    width: '100%',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: 8,
                                                    padding: '8px 10px',
                                                    borderRadius: 6,
                                                    background: 'none',
                                                    border: 'none',
                                                    cursor: 'pointer',
                                                    fontSize: 12,
                                                    color: '#C84040',
                                                    textAlign: 'left',
                                                }}
                                                className="hover:bg-white/5"
                                            >
                                                <LogOut size={14} />
                                                Sair
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
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
