import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
    Users,
    Car,
    FileText,
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
    Search,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { temPermissao } from '../lib/permissions';
import { useTheme } from '@/contexts/ThemeContext';
import { ThemeToggle } from './ThemeToggle';

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
            { to: '/controle-diario', icon: Calendar, label: 'Controle Diário', permissao: 'controle_pagamentos' },
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
                        end
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
    const { theme, toggle } = useTheme();
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
        if (path === '/' || path.startsWith('/ordens')) return 'Ordens de Serviço';
        if (path.startsWith('/clientes')) return 'Clientes';
        if (path.startsWith('/veiculos')) return 'Veículos';
        if (path.startsWith('/ordens')) return 'Ordens de Serviço';
        if (path.startsWith('/calendario-vistorias')) return 'Agenda de Vistorias';
        if (path.startsWith('/protocolos')) return 'Protocolo Diário';
        if (path.startsWith('/emails')) return 'Caixa de E-mails';
        if (path.startsWith('/financeiro')) return 'Financeiro';
        if (path.startsWith('/controle-pagamentos')) return 'Controle de Pagamentos';
        if (path.startsWith('/controle-diario')) return 'Controle Diário';
        if (path.startsWith('/painel-empresas')) return 'Empresas Parceiras';
        if (path.startsWith('/controle-placas')) return 'Controle de Placas';
        if (path.startsWith('/configuracoes')) return 'Configurações de Serviços';
        if (path.startsWith('/usuarios')) return 'Usuários';
        if (path.startsWith('/backup')) return 'Backup / Restaurar';
        if (path.startsWith('/servicos')) return 'Serviços Detran';
        return 'Despachante Matilde';
    };

    const closeSidebar = () => setSidebarOpen(false);

    return (
        <div className="app-layout">
            {/* Mobile overlay */}
            {sidebarOpen && (
                <div
                    style={{
                        position: 'fixed',
                        inset: 0,
                        background: 'rgba(0, 0, 0, 0.5)',
                        zIndex: 99,
                    }}
                    onClick={closeSidebar}
                />
            )}

            {/* Sidebar */}
            <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
                <div className="sidebar-logo">
                    <img src="/logo.png" alt="Despachante Matilde" />
                    <span className="sidebar-logo-name">Despachante Matilde</span>
                </div>

                <nav className="sidebar-nav">
                    {/* Sidebar search */}
                    <div style={{ padding: '0 8px 8px', position: 'relative' }}>
                        <Search size={13} style={{
                            position: 'absolute',
                            left: 20,
                            top: '50%',
                            transform: 'translateY(-50%)',
                            color: 'var(--notion-text-muted)',
                            pointerEvents: 'none',
                        }} />
                        <input
                            ref={searchInputRef}
                            type="text"
                            placeholder="Buscar... (/)"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            style={{
                                width: '100%',
                                padding: '6px 10px 6px 32px',
                                background: 'rgba(0,0,0,0.04)',
                                border: '1px solid var(--notion-border)',
                                borderRadius: 6,
                                fontSize: '0.78rem',
                                color: 'var(--notion-text)',
                                fontFamily: 'inherit',
                                outline: 'none',
                                boxSizing: 'border-box',
                                transition: 'border-color 150ms',
                            }}
                            onFocus={e => { e.target.style.borderColor = 'var(--notion-blue-focus)'; }}
                            onBlur={e => { e.target.style.borderColor = 'var(--notion-border)'; }}
                        />
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
                            color: 'var(--notion-text-secondary)',
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
                        <ThemeToggle />

                        {/* User profile dropdown */}
                        {usuario && (
                            <div ref={profileRef} style={{ position: 'relative' }}>
                                <button
                                    onClick={() => setProfileOpen(!profileOpen)}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 8,
                                        background: profileOpen ? 'var(--notion-surface)' : 'transparent',
                                        border: '1px solid var(--notion-border)',
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
                                        background: 'linear-gradient(135deg, var(--notion-blue), var(--notion-blue-hover))',
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
                                        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--notion-text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 120 }}>
                                            {usuario.nome}
                                        </div>
                                        <div style={{ fontSize: 10, color: 'var(--notion-text-secondary)', textTransform: 'capitalize' }}>
                                            {usuario.role === 'admin' ? 'Admin' : usuario.role === 'gerente' ? 'Gerente' : 'Funcionário'}
                                        </div>
                                    </div>
                                    <ChevronDown size={12} style={{ color: 'var(--notion-text-secondary)', transition: 'transform 0.15s', transform: profileOpen ? 'rotate(180deg)' : 'none' }} />
                                </button>

                                {/* Dropdown */}
                                {profileOpen && (
                                    <div style={{
                                        position: 'absolute',
                                        top: '100%',
                                        right: 0,
                                        marginTop: 6,
                                        width: 200,
                                        background: 'var(--notion-surface)',
                                        border: '1px solid var(--notion-border)',
                                        borderRadius: 10,
                                        boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
                                        zIndex: 100,
                                        overflow: 'hidden',
                                    }}>
                                        {/* User info */}
                                        <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--notion-border)' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                <div style={{
                                                    width: 36,
                                                    height: 36,
                                                    borderRadius: 8,
                                                    background: 'linear-gradient(135deg, var(--notion-blue), var(--notion-blue-hover))',
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
                                                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--notion-text)' }}>{usuario.nome}</div>
                                                    <div style={{ fontSize: 10, color: 'var(--notion-text-secondary)', textTransform: 'capitalize' }}>
                                                        {usuario.role === 'admin' ? 'Administrador' : usuario.role === 'gerente' ? 'Gerente' : 'Funcionário'}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Menu items */}
                                        <div style={{ padding: '6px' }}>
                                            <button
                                                onClick={() => { toggle(); setProfileOpen(false); }}
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
                                                    color: 'var(--notion-text)',
                                                    textAlign: 'left',
                                                }}
                                                className="hover:bg-surface/5"
                                            >
                                                {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
                                                {theme === 'dark' ? 'Modo Claro' : 'Modo Escuro'}
                                            </button>

                                            <div style={{ height: 1, background: 'var(--notion-border)', margin: '4px 0' }} />

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
                                                className="hover:bg-surface/5"
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
          #mobile-menu-btn { display: flex !important; }
        }
        @media (max-width: 768px) {
          #mobile-menu-btn {
            display: flex !important;
            align-items: center;
            justify-content: center;
            width: 40px;
            height: 40px;
            border: 1px solid var(--notion-border);
            background: var(--notion-surface) !important;
            border-radius: 8px;
            color: var(--notion-text);
          }
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
          color: var(--notion-text-secondary);
          transition: color 140ms ease;
          font-family: inherit;
        }

        .sidebar-group-header:hover {
          color: var(--notion-text);
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
          border-top: 1px solid var(--notion-border);
        }

      `}</style>
        </div>
    );
}
