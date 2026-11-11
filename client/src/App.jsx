import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Link, NavLink, Outlet, Route, Routes, useLocation, useNavigate, useOutletContext, useParams, useSearchParams } from 'react-router-dom';
import {
  AlertCircle, ArrowDownUp, AudioLines, BadgeCheck, Check, ChevronDown, ChevronLeft, ChevronRight,
  CircleHelp, Clock3, CloudDownload, Download, FileAudio, FileVideo, Film, Folder, HardDrive, Heart, Home, Info,
  LayoutGrid, ListFilter, Loader, Menu, Moon, MoreHorizontal, Music2, Play, Plus,
  Radio, RefreshCw, Search, Settings, ShieldCheck, SlidersHorizontal, Sparkles, Sun, Trash2,
  Upload, Video, X, Zap, Crown, Bookmark, Eye, ExternalLink, Youtube, Flame
} from 'lucide-react';
import { api, formatBytes, formatDuration, timeAgo } from './api.js';

const AppContext = createContext(null);
const useApp = () => useContext(AppContext);
const navigation = [
  { label: 'Home', to: '/', icon: Home },
  { label: 'Explore', to: '/explore', icon: LayoutGrid },
  { label: 'Search videos', to: '/search', icon: Search },
  { label: 'My downloads', to: '/downloads', icon: CloudDownload, badge: 'downloads', divider: true },
  { label: 'My library', to: '/library', icon: Folder },
  { label: 'Playlists', to: '/playlists', icon: ListFilter },
  { label: 'History', to: '/history', icon: Clock3 },
  { label: 'Favorites', to: '/favorites', icon: Heart },
  { label: 'Audio tools', to: '/audio', icon: AudioLines, divider: true },
  { label: 'Supported sources', to: '/sources', icon: Radio },
  { label: 'ZeeTube Plus', to: '/plus', icon: Crown, divider: true },
];

function Shell() {
  const { health, settings, setSettings, setToast } = useApp();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [searchValue, setSearchValue] = useState('');
  const [downloads, setDownloads] = useState([]);
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    let active = true;
    const load = async () => {
      try { const data = await api('/downloads'); if (active) setDownloads(data.downloads || []); } catch {}
    };
    load(); const timer = setInterval(load, 4000);
    return () => { active = false; clearInterval(timer); };
  }, [location.pathname]);

  useEffect(() => { setSidebarOpen(false); }, [location.pathname]);

  const doSearch = (e) => {
    e?.preventDefault();
    const q = searchValue.trim();
    navigate(q ? `/search?q=${encodeURIComponent(q)}` : '/search');
  };
  const activeCount = downloads.filter((d) => ['queued', 'downloading'].includes(d.status)).length;
  const title = navigation.find((item) => item.to === location.pathname)?.label || ((location.pathname.startsWith('/watch/') || location.pathname.startsWith('/youtube/')) ? 'Now playing' : location.pathname === '/settings' ? 'Settings' : location.pathname === '/help' ? 'Help & about' : 'ZeeTube');

  return <div className={`app-shell theme-${settings.theme || 'light'}`}>
    <aside className={`sidebar ${sidebarOpen ? 'sidebar-open' : ''}`}>
      <Link to="/" className="brand" onClick={() => setSidebarOpen(false)}>
        <span className="brand-mark"><span></span><span></span><span></span></span>
        <span className="brand-copy"><b>ZEE<span>TUBE</span></b><small>WATCH · SAVE · ENJOY</small></span>
        <button className="icon-button sidebar-close" aria-label="Close navigation" onClick={(e) => { e.preventDefault(); setSidebarOpen(false); }}><X size={18}/></button>
      </Link>
      <div className="sidebar-scroll">
        <div className="nav-caption">WORKSPACE</div>
        <nav className="nav-list" aria-label="Main navigation">
          {navigation.map((item) => {
            const Icon = item.icon;
            const badgeCount = item.badge === 'downloads' ? activeCount : 0;
            return <React.Fragment key={item.to}>
              {item.divider && <div className="nav-divider"/>}
              <NavLink to={item.to} end={item.to === '/'} className={({ isActive }) => `nav-item ${isActive ? 'nav-active' : ''}`} onClick={() => setSidebarOpen(false)}>
                <Icon size={18} strokeWidth={1.85}/><span>{item.label}</span>{badgeCount > 0 && <em>{badgeCount}</em>}
              </NavLink>
            </React.Fragment>;
          })}
        </nav>
        <div className="sidebar-note">
          <div className="note-icon"><ShieldCheck size={17}/></div>
          <b>Your media, your control.</b>
          <p>Local-first storage. Downloads are limited to sources you authorize.</p>
          <Link to="/sources">Configure sources <ChevronRight size={13}/></Link>
        </div>
      </div>
      <div className="sidebar-bottom">
        <NavLink to="/settings" className={({ isActive }) => `nav-item ${isActive ? 'nav-active' : ''}`}><Settings size={18}/><span>Settings</span></NavLink>
        <NavLink to="/help" className={({ isActive }) => `nav-item ${isActive ? 'nav-active' : ''}`}><CircleHelp size={18}/><span>Help & about</span></NavLink>
        <div className="profile-row"><div className="avatar">Z</div><div className="profile-copy"><b>Local workspace</b><small>Single-user mode</small></div><span className="online-dot"/></div>
      </div>
    </aside>
    {sidebarOpen && <button aria-label="Close menu overlay" className="sidebar-scrim" onClick={() => setSidebarOpen(false)} />}
    <div className="workspace">
      <header className="topbar">
        <button className="icon-button mobile-menu" aria-label="Open navigation" onClick={() => setSidebarOpen(true)}><Menu size={20}/></button>
        <div className="mobile-brand"><span className="brand-mark"><span></span><span></span><span></span></span><b>ZEETUBE</b></div>
        <div className="topbar-title"><div className="breadcrumbs">WORKSPACE <ChevronRight size={12}/> <span>{title.toUpperCase()}</span></div><h1>{title}</h1></div>
        <form className="global-search" onSubmit={doSearch} role="search"><Search size={17}/><input value={searchValue} onChange={(e) => setSearchValue(e.target.value)} placeholder="Search videos, channels and your library..." aria-label="Search ZeeTube"/><kbd>↵</kbd><button aria-label="Search"><ChevronRight size={17}/></button></form>
        <div className="topbar-actions"><button className="icon-button theme-switch" title="Toggle theme" aria-label="Toggle theme" onClick={() => { const theme = settings.theme === 'light' ? 'dark' : 'light'; setSettings({ ...settings, theme }); api('/settings', { method: 'PATCH', body: { theme } }).catch((err) => setToast({ type: 'error', message: err.message })); }}>{settings.theme === 'light' ? <Moon size={18}/> : <Sun size={18}/>}</button><Link to="/downloads" className="top-download" title="Open downloads"><Download size={18}/>{activeCount > 0 && <i>{activeCount}</i>}</Link><span className={`api-status ${health?.ok ? 'is-online' : 'is-offline'}`} title={health?.ok ? 'Backend connected' : 'Backend not connected'}><span/>{health?.ok ? 'System ready' : 'Offline'}</span></div>
      </header>
      <main className="page-main"><Outlet context={{ health, downloads, setToast }} /></main>
      <footer className="app-footer"><span>© {new Date().getFullYear()} ZeeTube</span><span><ShieldCheck size={13}/> Official YouTube player · Authorized media only</span><Link to="/help">Help center <ChevronRight size={12}/></Link></footer>
      <nav className="mobile-bottom-nav" aria-label="Mobile navigation">{navigation.filter((x) => ['/','/search','/downloads','/library','/plus'].includes(x.to)).map((item) => { const Icon = item.icon; return <NavLink key={item.to} to={item.to} end={item.to === '/'} className={({ isActive }) => isActive ? 'mobile-nav-active' : ''}><Icon size={19}/><span>{item.to === '/' ? 'Home' : item.to === '/search' ? 'Search' : item.to === '/downloads' ? 'Downloads' : item.to === '/library' ? 'Library' : 'Plus'}</span></NavLink>; })}</nav>
    </div>
  </div>;
}

function PageHeader({ eyebrow, title, description, action, icon: Icon }) {
  return <div className="page-heading"><div><div className="eyebrow">{Icon && <Icon size={13}/>} {eyebrow}</div><h2>{title}</h2>{description && <p>{description}</p>}</div>{action && <div className="page-heading-action">{action}</div>}</div>;
}
function EmptyState({ icon: Icon = Folder, title, text, action }) {
  return <div className="empty-state"><div className="empty-icon"><Icon size={24}/></div><h3>{title}</h3><p>{text}</p>{action && action}</div>;
}
function StatusBadge({ status }) {
  const normalized = status || 'queued';
  const labels = { queued: 'Queued', downloading: 'Downloading', processing: 'Converting', completed: 'Completed', failed: 'Failed', cancelled: 'Cancelled' };
  return <span className={`status-badge status-${normalized}`}><i/>{labels[normalized] || normalized}</span>;
}
function ProgressLine({ value }) { return <div className="progress-track"><div className="progress-fill" style={{ width: `${Math.min(100, Math.max(0, Number(value) || 0))}%` }}/></div>; }
function MediaArtwork({ item, large = false }) {
  const audio = item.type === 'audio';
  const shades = ['art-blue','art-violet','art-teal','art-amber','art-rose'];
  const idx = Array.from(item.id || item.title || 'a').reduce((total, char) => total + char.charCodeAt(0), 0) % shades.length;
  const Icon = audio ? FileAudio : FileVideo;
  return <div className={`media-art ${shades[idx]} ${large ? 'media-art-large' : ''}`}><div className="art-grid"/><span className="art-orbit art-orbit-one"/><span className="art-orbit art-orbit-two"/><Icon className="art-main-icon" size={large ? 42 : 32} strokeWidth={1.2}/><span className="art-type">{audio ? 'AUDIO' : (item.fileName?.split('.').pop() || 'VIDEO').toUpperCase()}</span>{item.duration && <span className="art-duration">{formatDuration(item.duration)}</span>}</div>;
}
function MediaCard({ item, onFavorite, onDelete, onAddToPlaylist, compact = false }) {
  const navigate = useNavigate();
  const { setToast } = useApp();
  const [menuOpen, setMenuOpen] = useState(false);
  const [favoriteState, setFavoriteState] = useState(Boolean(item.favorite));
  useEffect(() => setFavoriteState(Boolean(item.favorite)), [item.id, item.favorite]);
  const toggleFavorite = async () => {
    if (onFavorite) { onFavorite(item); return; }
    try {
      const result = await api(`/library/${item.id}`, { method: 'PATCH', body: { favorite: !favoriteState } });
      setFavoriteState(Boolean(result.media.favorite));
      setToast({ type: 'success', message: result.media.favorite ? 'Added to favorites.' : 'Removed from favorites.' });
    } catch (err) { setToast({ type: 'error', message: err.message }); }
  };
  return <article className={`media-card ${compact ? 'media-card-compact' : ''}`}>
    <button className="media-art-button" onClick={() => navigate(`/watch/${item.id}`)} aria-label={`Play ${item.title}`}><MediaArtwork item={item}/><span className="play-overlay"><Play size={18} fill="currentColor"/></span></button>
    <div className="media-card-body"><button className="media-title" onClick={() => navigate(`/watch/${item.id}`)} title={item.title}>{item.title}</button><div className="media-subline"><span>{item.type === 'audio' ? 'Audio file' : 'Video file'}</span><span className="dot-sep"/><span>{item.sizeLabel || formatBytes(item.bytes)}</span></div><div className="media-card-bottom"><span className="media-time">{timeAgo(item.createdAt)}</span><div className="media-actions"><button className={`mini-icon ${favoriteState ? 'is-favorite' : ''}`} title={favoriteState ? 'Remove from favorites' : 'Add to favorites'} aria-label="Toggle favorite" onClick={toggleFavorite}><Heart size={15} fill={favoriteState ? 'currentColor' : 'none'}/></button><div className="menu-wrap"><button className="mini-icon" aria-label="More media actions" onClick={() => setMenuOpen((v) => !v)}><MoreHorizontal size={17}/></button>{menuOpen && <><button className="menu-dismiss" aria-label="Close menu" onClick={() => setMenuOpen(false)}/><div className="floating-menu"><button onClick={() => { navigate(`/watch/${item.id}`); setMenuOpen(false); }}><Play size={14}/> Play media</button><a href={item.downloadUrl} onClick={() => setMenuOpen(false)}><Download size={14}/> Download file</a>{onAddToPlaylist && <button onClick={() => { setMenuOpen(false); onAddToPlaylist(item); }}><Plus size={14}/> Add to playlist</button>}{onDelete && <button className="menu-danger" onClick={() => { setMenuOpen(false); onDelete(item); }}><Trash2 size={14}/> Delete media</button>}</div></>}</div></div></div></div>
  </article>;
}
function MediaGrid({ items, onFavorite, onDelete, onAddToPlaylist, compact = false }) {
  if (!items?.length) return <EmptyState icon={Film} title="Your media collection is empty" text="Import a video or audio file you own, or add media through a configured authorized source." action={<Link className="button button-primary" to="/library"><Upload size={16}/> Open media library</Link>}/>;
  return <div className={`media-grid ${compact ? 'media-grid-compact' : ''}`}>{items.map((item) => <MediaCard key={item.id} item={item} onFavorite={onFavorite} onDelete={onDelete} onAddToPlaylist={onAddToPlaylist} compact={compact}/>)}</div>;
}
function StatCard({ label, value, detail, icon: Icon, tone = 'blue' }) { return <div className="stat-card"><div className={`stat-icon stat-${tone}`}><Icon size={19}/></div><div className="stat-copy"><span>{label}</span><b>{value}</b><small>{detail}</small></div></div>; }
function SectionTitle({ title, subtitle, action }) { return <div className="section-title"><div><h3>{title}</h3>{subtitle && <p>{subtitle}</p>}</div>{action}</div>; }
function URLImport() {
  const [url, setUrl] = useState('');
  const [inspecting, setInspecting] = useState(false);
  const [found, setFound] = useState(null);
  const [downloading, setDownloading] = useState(false);
  const { setToast, health } = useApp();
  const inspect = async (e) => {
    e?.preventDefault();
    if (!url.trim()) { setToast({ type: 'error', message: 'Paste a direct media-file URL first.' }); return; }
    setInspecting(true); setFound(null);
    try { const result = await api('/media/inspect', { method: 'POST', body: { url: url.trim() } }); setFound(result.media); }
    catch (err) { setToast({ type: 'error', message: err.message }); }
    finally { setInspecting(false); }
  };
  const startDownload = async () => {
    if (!found) return;
    setDownloading(true);
    try { await api('/downloads', { method: 'POST', body: { url: found.url, title: found.title, extension: found.extension } }); setToast({ type: 'success', message: 'Download added to the queue.' }); setFound(null); setUrl(''); }
    catch (err) { setToast({ type: 'error', message: err.message }); }
    finally { setDownloading(false); }
  };
  return <div className="url-import-panel"><div className="url-import-heading"><div className="url-import-icon"><CloudDownload size={20}/></div><div><b>Download an authorized media file</b><p>Paste a direct file URL from a host you've authorized. For YouTube, use <Link to="/search">video search</Link> and the official player.</p></div><span className={`source-state ${health?.downloadsEnabled ? 'source-enabled' : ''}`}><i/>{health?.downloadsEnabled ? 'Source enabled' : 'Needs setup'}</span></div><form className="url-import-form" onSubmit={inspect}><div className="url-input-wrap"><LinkIcon/><input type="url" value={url} onChange={(e) => { setUrl(e.target.value); setFound(null); }} placeholder="https://your-authorized-host.example/video.mp4" aria-label="Direct media file URL"/><button type="button" className="paste-button" onClick={async () => { try { setUrl(await navigator.clipboard.readText()); } catch { setToast({ type: 'error', message: 'Clipboard access is unavailable. Paste with Ctrl+V instead.' }); } }}>Paste</button></div><button className="button button-primary" disabled={inspecting || !health?.downloadsEnabled} type="submit">{inspecting ? <Loader size={16} className="spin"/> : <Search size={16}/>} Inspect URL</button></form>
    {!health?.downloadsEnabled && <div className="inline-hint"><Info size={14}/> Remote downloads are disabled until you add authorized hostnames to <code>MEDIA_ALLOWED_HOSTS</code> in your server environment. YouTube watch links are not direct media files and cannot be downloaded here.</div>}
    {found && <div className="inspected-result"><div className="inspected-art"><MediaArtwork item={found}/></div><div className="inspected-copy"><b>{found.title}</b><div>{found.sourceHost} · {found.extension.toUpperCase()} · {found.sizeLabel || 'Size unknown'}</div><small>{found.note}</small></div><button className="button button-primary" disabled={downloading} onClick={startDownload}>{downloading ? <Loader size={15} className="spin"/> : <Download size={15}/>} Start download</button></div>}
  </div>;
}
function LinkIcon() { return <span className="link-glyph">↗</span>; }
function ImportFilesButton({ label = 'Import media', compact = false }) {
  const inputRef = useRef(null); const [busy, setBusy] = useState(false); const { setToast } = useApp(); const navigate = useNavigate();
  const pick = () => inputRef.current?.click();
  const changed = async (e) => {
    const files = Array.from(e.target.files || []); e.target.value = '';
    if (!files.length) return;
    setBusy(true);
    let success = 0; const failures = [];
    for (const file of files) {
      const form = new FormData(); form.append('media', file);
      try { await api('/library/upload', { method: 'POST', body: form }); success++; }
      catch (err) { failures.push(`${file.name}: ${err.message}`); }
    }
    setBusy(false);
    if (success) { setToast({ type: failures.length ? 'info' : 'success', message: `${success} file${success === 1 ? '' : 's'} added to your library${failures.length ? `; ${failures.length} failed` : ''}.` }); navigate('/library'); }
    if (failures.length) setToast({ type: 'error', message: failures[0] });
  };
  return <><input ref={inputRef} type="file" multiple accept="video/*,audio/*,.mkv,.flac,.m4a,.webm,.mov,.mp4,.mp3,.wav,.ogg" className="visually-hidden" onChange={changed}/><button className={`button ${compact ? 'button-secondary button-small' : 'button-primary'}`} onClick={pick} disabled={busy}>{busy ? <Loader className="spin" size={16}/> : <Upload size={16}/>} {busy ? 'Importing…' : label}</button></>;
}

function formatViews(value) {
  const count = Number(value || 0);
  if (count >= 1_000_000_000) return `${(count / 1_000_000_000).toFixed(1)}B views`;
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M views`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}K views`;
  return `${count.toLocaleString()} views`;
}

function CatalogVideoCard({ video }) {
  return <article className="catalog-card">
    <Link to={`/youtube/${video.id}`} state={{ video }} className="catalog-thumb-link" aria-label={`Play ${video.title}`}>
      <div className="catalog-thumb">
        {video.thumbnail ? <img src={video.thumbnail} alt="" loading="lazy" referrerPolicy="no-referrer"/> : <div className="catalog-thumb-fallback"><Youtube size={34}/></div>}
        {video.durationSeconds != null && <span className="catalog-duration">{formatDuration(video.durationSeconds)}</span>}
        <span className="catalog-play"><Play size={19} fill="currentColor"/></span>
      </div>
    </Link>
    <div className="catalog-card-copy">
      <Link to={`/youtube/${video.id}`} state={{ video }} className="catalog-card-title">{video.title}</Link>
      <div className="catalog-channel">{video.channelTitle}</div>
      <div className="catalog-meta"><span>{formatViews(video.viewCount)}</span>{video.publishedAt && <><i/> <span>{timeAgo(video.publishedAt)}</span></>}</div>
    </div>
  </article>;
}

function CatalogGrid({ items, loading = false }) {
  if (loading) return <div className="catalog-grid">{[1,2,3,4,5,6,7,8].map((n) => <div className="catalog-skeleton" key={n}><div/><i/><i/></div>)}</div>;
  if (!items?.length) return <div className="catalog-empty"><div className="catalog-empty-icon"><Youtube size={25}/></div><b>No videos to show yet</b><p>Try another category or search for a topic.</p></div>;
  return <div className="catalog-grid">{items.map((video) => <CatalogVideoCard key={video.id} video={video}/>)}</div>;
}

function HomePage() {
  const [catalog, setCatalog] = useState({ configured: false, items: [], message: '' });
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [categoryId, setCategoryId] = useState('all');
  const [media, setMedia] = useState([]);
  const [downloads, setDownloads] = useState([]);
  const [playlists, setPlaylists] = useState([]);
  const [localBusy, setLocalBusy] = useState(true);
  const { setToast, health } = useApp();
  const categories = [
    { id: 'all', label: 'For you' }, { id: '10', label: 'Music' }, { id: '20', label: 'Gaming' },
    { id: '17', label: 'Sports' }, { id: '28', label: 'Technology' }, { id: '27', label: 'Education' },
    { id: '24', label: 'Entertainment' }, { id: '1', label: 'Film & animation' },
  ];

  useEffect(() => {
    let active = true;
    setCatalogLoading(true);
    api(`/catalog/trending?categoryId=${encodeURIComponent(categoryId)}`)
      .then((result) => { if (active) setCatalog(result); })
      .catch((error) => { if (active) setCatalog({ configured: false, items: [], message: error.message }); })
      .finally(() => { if (active) setCatalogLoading(false); });
    return () => { active = false; };
  }, [categoryId]);

  useEffect(() => {
    let active = true;
    Promise.all([api('/library'), api('/downloads'), api('/playlists')])
      .then(([m, d, p]) => { if (!active) return; setMedia(m.items || []); setDownloads(d.downloads || []); setPlaylists(p.playlists || []); })
      .catch((error) => { if (active) setToast({ type: 'error', message: error.message }); })
      .finally(() => { if (active) setLocalBusy(false); });
    return () => { active = false; };
  }, [setToast]);

  const activeJobs = downloads.filter((item) => ['queued','downloading'].includes(item.status)).length;
  const totalBytes = media.reduce((sum, item) => sum + (Number(item.bytes) || 0), 0);
  return <div className="page-stack zeetube-home">
    <section className="welcome-strip">
      <div><div className="welcome-eyebrow"><Flame size={14}/> YOUR DAILY WATCHLIST</div><h2>Find something <span>good to watch.</span></h2><p>Fresh videos, topics you love, and your personal media library — together in one place.</p></div>
      <div className="welcome-side"><span className="region-pill"><span/> Pakistan discovery</span><Link to="/plus" className="plus-mini"><Crown size={15}/> ZeeTube Plus <ChevronRight size={14}/></Link></div>
    </section>

    <div className="category-rail" aria-label="Video categories">
      {categories.map((category) => <button key={category.id} className={`category-pill ${categoryId === category.id ? 'category-pill-active' : ''}`} onClick={() => setCategoryId(category.id)}>{category.label}</button>)}
    </div>

    <section className="catalog-section">
      <div className="catalog-section-heading"><div><div className="eyebrow"><Flame size={13}/> POPULAR IN PAKISTAN</div><h3>{categoryId === 'all' ? 'Trending videos' : `${categories.find((x) => x.id === categoryId)?.label || 'Popular'} videos`}</h3><p>Discover public videos through the official YouTube catalog.</p></div><Link to="/search" className="text-link">Search videos <ChevronRight size={14}/></Link></div>
      {!catalog.configured && !catalogLoading ? <div className="catalog-setup"><div className="catalog-setup-icon"><Youtube size={24}/></div><div><b>Connect YouTube discovery</b><p>{catalog.message || 'Add a YouTube Data API key to load live videos, search, and regional trends.'}</p><small>Your API key stays on the server and is never sent to visitors’ browsers.</small></div><Link to="/sources" className="button button-secondary">Setup guide <ChevronRight size={14}/></Link></div> : null}
      <CatalogGrid items={catalog.items} loading={catalogLoading}/>
    </section>

    <section className="personal-workspace">
      <div className="personal-head"><div><div className="eyebrow"><Folder size={13}/> YOUR PERSONAL SPACE</div><h3>Your library, always close.</h3><p>Imported files and media you are authorized to keep.</p></div><ImportFilesButton label="Import media"/></div>
      <div className="personal-stats"><div><span>Library</span><b>{localBusy ? '—' : media.length}</b></div><div><span>Active jobs</span><b>{localBusy ? '—' : activeJobs}</b></div><div><span>Playlists</span><b>{localBusy ? '—' : playlists.length}</b></div><div><span>Storage</span><b>{localBusy ? '—' : formatBytes(totalBytes)}</b></div></div>
      <div className="personal-bottom"><div><b>Recently added</b><span>{media.length ? `${media.length} item${media.length === 1 ? '' : 's'} in your library` : 'Your library is ready for your files.'}</span></div><Link to="/library" className="text-link">Open library <ChevronRight size={14}/></Link></div>
      {media.length > 0 && <MediaGrid items={media.slice(0, 4)} compact/>}
      <div className="personal-tools"><Link to="/downloads"><CloudDownload size={16}/> Download manager <ChevronRight size={14}/></Link><Link to="/audio"><AudioLines size={16}/> Audio extractor <ChevronRight size={14}/></Link><Link to="/history"><Clock3 size={16}/> Watch history <ChevronRight size={14}/></Link></div>
    </section>
    <URLImport/>
    {!health?.ok && <div className="info-banner"><Info size={16}/> Local library tools need the backend server to be running.</div>}
  </div>;
}

function ExplorePage() {
  const [categoryId, setCategoryId] = useState('all');
  const [catalog, setCatalog] = useState({ configured: false, items: [], message: '' });
  const [loading, setLoading] = useState(true);
  const categories = [{id:'all',label:'For you'},{id:'10',label:'Music'},{id:'20',label:'Gaming'},{id:'17',label:'Sports'},{id:'28',label:'Technology'},{id:'27',label:'Education'},{id:'24',label:'Entertainment'},{id:'1',label:'Film & animation'}];
  useEffect(() => {
    let active = true;
    setLoading(true);
    api(`/catalog/trending?categoryId=${encodeURIComponent(categoryId)}`)
      .then((result) => { if (active) setCatalog(result); })
      .catch((error) => { if (active) setCatalog({ configured: false, items: [], message: error.message }); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [categoryId]);
  return <div className="page-stack"><PageHeader eyebrow="EXPLORE THE WORLD OF VIDEO" title="Explore" description="Browse popular public videos by category and discover a new favorite." icon={Sparkles}/><div className="category-rail">{categories.map((item)=><button key={item.id} className={`category-pill ${categoryId===item.id?'category-pill-active':''}`} onClick={()=>setCategoryId(item.id)}>{item.label}</button>)}</div>{!catalog.configured&&!loading&&<div className="catalog-setup"><div className="catalog-setup-icon"><Youtube size={24}/></div><div><b>Live discovery is not configured</b><p>{catalog.message || 'Add YOUTUBE_API_KEY to the server environment to browse videos.'}</p></div><Link to="/sources" className="button button-secondary">Setup guide <ChevronRight size={14}/></Link></div>}<CatalogGrid items={catalog.items} loading={loading}/></div>;
}

function SearchPage() {
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState(params.get('q') || '');
  const [videos, setVideos] = useState([]);
  const [localItems, setLocalItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [catalogMessage, setCatalogMessage] = useState('');
  const [nextPageToken, setNextPageToken] = useState('');
  const [loadingMore, setLoadingMore] = useState(false);
  const query = params.get('q') || '';
  useEffect(() => { setQ(query); }, [query]);
  useEffect(() => {
    if (!query.trim()) { setVideos([]); setLocalItems([]); setNextPageToken(''); setCatalogMessage('Search public YouTube videos and your own imported library.'); return; }
    let active = true;
    setLoading(true);
    Promise.allSettled([
      api(`/catalog/search?q=${encodeURIComponent(query)}`),
      api(`/search?q=${encodeURIComponent(query)}`),
    ]).then(([remote, local]) => {
      if (!active) return;
      if (remote.status === 'fulfilled') { setVideos(remote.value.items || []); setNextPageToken(remote.value.nextPageToken || ''); setCatalogMessage('Official YouTube search results. Playback opens in the YouTube embedded player.'); }
      else { setVideos([]); setNextPageToken(''); setCatalogMessage(remote.reason?.message || 'YouTube search is not configured.'); }
      setLocalItems(local.status === 'fulfilled' ? (local.value.items || []) : []);
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [query]);
  const submit = (event) => { event.preventDefault(); const next = q.trim(); setParams(next ? { q: next } : {}); };
  const loadMore = async () => { if (!nextPageToken || loadingMore) return; setLoadingMore(true); try { const result = await api(`/catalog/search?q=${encodeURIComponent(query)}&pageToken=${encodeURIComponent(nextPageToken)}`); setVideos((current) => [...current, ...(result.items || [])]); setNextPageToken(result.nextPageToken || ''); } catch (error) { setCatalogMessage(error.message); } finally { setLoadingMore(false); } };
  return <div className="page-stack search-page">
    <PageHeader eyebrow="DISCOVER SOMETHING NEW" title="Search videos" description="Search public YouTube videos and your own personal library." icon={Search}/>
    <form className="large-search-form" onSubmit={submit}><Search size={19}/><input value={q} onChange={(event) => setQ(event.target.value)} placeholder="Search music, tutorials, creators, gaming…" autoFocus/><button className="button button-primary" disabled={loading}>{loading ? <Loader size={16} className="spin"/> : 'Search videos'}</button></form>
    {query && <div className="search-result-summary"><div><b>Results for “{query}”</b><span>{videos.length} YouTube videos · {localItems.length} local files</span></div></div>}
    {catalogMessage && <div className="info-banner"><Info size={16}/><span>{catalogMessage}</span></div>}
    {query && <section className="catalog-section"><div className="catalog-section-heading"><div><div className="eyebrow"><Youtube size={13}/> YOUTUBE</div><h3>Video results</h3></div></div><CatalogGrid items={videos} loading={loading}/>{!loading && nextPageToken && <button className="button button-secondary catalog-load-more" onClick={loadMore} disabled={loadingMore}>{loadingMore ? <Loader size={15} className="spin"/> : <ChevronDown size={15}/>} Load more videos</button>}</section>}
    {query && <section className="content-panel"><SectionTitle title="Your library" subtitle={`${localItems.length} matching saved file${localItems.length === 1 ? '' : 's'}`}/>{loading ? <LoadingRows/> : localItems.length ? <MediaGrid items={localItems}/> : <p className="muted-copy">No matching files in your personal library.</p>}</section>}
  </div>;
}

function SourcesPage() {
  const { health, setToast } = useApp(); const [sources, setSources] = useState([]);
  useEffect(() => { api('/sources').then((d) => setSources(d.sources || [])).catch((e) => setToast({ type:'error', message:e.message })); }, [setToast]);
  return <div className="page-stack"><PageHeader eyebrow="CONNECT WITH CARE" title="Supported sources" description="See what this build can process and configure hosts you have permission to use." icon={Radio}/><div className="security-banner"><div className="security-banner-icon"><ShieldCheck size={22}/></div><div><b>Safe by default</b><p>Remote file downloads start disabled. You must explicitly allow a trusted hostname in the server environment. This app does not scrape every website or bypass DRM and access controls.</p></div></div><div className="source-grid">{sources.map((source) => <div className="source-card" key={source.id}><div className={`source-card-icon ${source.enabled?'source-ok':''}`}>{source.kind==='upload'?<Upload size={20}/>:source.kind==='url'?<CloudDownload size={20}/>:<Radio size={20}/>}</div><div className="source-card-title"><h3>{source.name}</h3><span className={`source-pill ${source.enabled?'source-pill-on':'source-pill-off'}`}>{source.enabled?'Enabled':'Not configured'}</span></div><p>{source.details}</p>{source.hosts?.length > 0 && <div className="host-tags">{source.hosts.map((host) => <code key={host}>{host}</code>)}</div>}{source.id==='direct-media' && <div className="source-steps"><b>Enable an authorized host</b><ol><li>Stop the development server.</li><li>Open the project’s <code>.env</code> file.</li><li>Set <code>MEDIA_ALLOWED_HOSTS=cdn.example.com</code> using your real, authorized hostname.</li><li>Restart the server and try a direct media-file URL.</li></ol></div>}{source.id==='local-files' && <Link to="/library" className="text-link">Import a local file <ChevronRight size={14}/></Link>}{source.id==='official-api' && <div className="source-steps"><b>Enable live YouTube discovery</b><ol><li>In Google Cloud Console, enable YouTube Data API v3 for a project.</li><li>Create an API key and restrict it to YouTube Data API v3.</li><li>Add <code>YOUTUBE_API_KEY=your_key</code> to the Codespace secret or the server-side <code>.env</code> file.</li><li>Set <code>YOUTUBE_REGION=PK</code> and restart the app.</li></ol><p>The key stays server-side. Search uses strict SafeSearch; playback uses the official YouTube embedded player.</p></div>}</div>)}</div><div className="warning-panel"><AlertCircle size={17}/><div><b>Direct files only</b><p>Page URLs, livestream manifests, and arbitrary site URLs are not supported by the direct-download workflow. Use only media you own or are authorized to download, and confirm the platform permits it.</p></div></div></div>;
}
function LoadingRows() { return <div className="loading-stack">{[1,2,3].map((i) => <div className="loading-row" key={i}><span/><div><i/><i/></div></div>)}</div>; }

function DownloadsPage() {
  const [downloads, setDownloads] = useState([]); const [filter, setFilter] = useState('all'); const [busy, setBusy] = useState(false); const { setToast } = useApp();
  const load = useCallback(async () => { try { const d = await api('/downloads'); setDownloads(d.downloads || []); } catch (err) { setToast({ type:'error', message:err.message }); } }, [setToast]);
  useEffect(() => { load(); const timer=setInterval(load, 1800); return () => clearInterval(timer); }, [load]);
  const action = async (item, type) => { setBusy(true); try { await api(`/downloads/${item.id}/${type}`, { method:'POST' }); setToast({ type:'success', message: type==='cancel'?'Download cancelled.':'Retry added to queue.' }); await load(); } catch (err) { setToast({ type:'error', message:err.message }); } finally { setBusy(false); } };
  const erase = async (item) => { if (!window.confirm(`Delete this download record${item.mediaId ? ' and remove its saved file from the library' : ''}?`)) return; setBusy(true); try { await api(`/downloads/${item.id}`, { method:'DELETE' }); setToast({ type:'success', message:'Download record deleted.' }); await load(); } catch(err) { setToast({ type:'error', message:err.message }); } finally { setBusy(false); } };
  const filters = ['all','queued','downloading','completed','failed','cancelled']; const visible = filter === 'all' ? downloads : downloads.filter((d) => d.status === filter);
  const running = downloads.filter((d) => ['queued','downloading'].includes(d.status));
  return <div className="page-stack"><PageHeader eyebrow="TRANSFER CONTROL" title="Download manager" description="Follow authorized file transfers, review failures, and manage completed downloads." icon={CloudDownload} action={<Link to="/sources" className="button button-secondary"><Settings size={16}/> Source settings</Link>}/><div className="downloads-summary"><div><span>In progress</span><b>{running.length}</b></div><div><span>Completed</span><b>{downloads.filter((d)=>d.status==='completed').length}</b></div><div><span>Failed</span><b>{downloads.filter((d)=>d.status==='failed').length}</b></div><div className="summary-action"><Link to="/" className="button button-primary"><Plus size={16}/> New download</Link></div></div><div className="status-tabs">{filters.map((f) => <button key={f} className={filter===f?'status-tab-active':''} onClick={() => setFilter(f)}>{f==='all'?'All':f[0].toUpperCase()+f.slice(1)}<span>{f==='all'?downloads.length:downloads.filter((d)=>d.status===f).length}</span></button>)}</div>{visible.length ? <div className="download-list">{visible.map((item) => <div className="download-row" key={item.id}><div className="download-file-icon"><FileVideo size={22}/></div><div className="download-file-main"><div className="download-title-row"><b title={item.title}>{item.title}</b><StatusBadge status={item.status}/></div><div className="download-meta"><span>{item.extension?.toUpperCase() || 'MEDIA'}</span><span>{item.sizeLabel || (item.totalBytes ? formatBytes(item.totalBytes) : 'Size unknown')}</span><span>{item.sourceHost || 'Authorized source'}</span>{item.status==='downloading' && item.speedBytesPerSecond>0 && <span>{formatBytes(item.speedBytesPerSecond)}/s</span>}</div>{['queued','downloading'].includes(item.status) && <div className="download-progress"><ProgressLine value={item.progress}/><span>{item.totalBytes ? `${item.progress||0}%` : 'Receiving data'}</span></div>}{item.status==='failed' && <div className="download-error"><AlertCircle size={14}/>{item.error || 'Download failed.'}</div>}{item.status==='completed' && <small className="download-complete"><Check size={13}/> Saved to your library · {timeAgo(item.completedAt)}</small>}</div><div className="download-row-actions">{item.status==='completed' && <Link to={`/watch/${item.mediaId}`} className="mini-action" title="Play media"><Play size={16}/></Link>}{['queued','downloading'].includes(item.status) && <button className="mini-action danger" disabled={busy} onClick={() => action(item,'cancel')} title="Cancel download"><X size={16}/></button>}{['failed','cancelled'].includes(item.status) && <button className="mini-action" disabled={busy} onClick={() => action(item,'retry')} title="Retry download"><RefreshCw size={16}/></button>}{['completed','failed','cancelled'].includes(item.status) && <button className="mini-action danger" disabled={busy} onClick={() => erase(item)} title="Delete download record"><Trash2 size={15}/></button>}</div></div>)}</div> : <EmptyState icon={CloudDownload} title={`No ${filter==='all'?'downloads':filter+' downloads'}`} text="Start a new download from an explicitly enabled, authorized direct media-file host." action={<Link to="/" className="button button-primary"><Plus size={16}/> Add a URL</Link>}/> }<div className="subtle-note"><Info size={14}/> Pause/resume is not displayed because the current direct-file transport doesn't promise safe resume support. A retry starts a new transfer.</div></div>;
}

function AudioPage() {
  const [file, setFile] = useState(null); const [format, setFormat] = useState('mp3'); const [bitrate, setBitrate] = useState('192k'); const [jobs, setJobs] = useState([]); const [busy, setBusy] = useState(false); const [uploadProgress, setUploadProgress] = useState(false); const { setToast, health } = useApp(); const inputRef = useRef(null);
  const load = useCallback(async () => { try { const d = await api('/convert'); setJobs(d.conversions || []); } catch (err) { setToast({ type:'error', message:err.message }); } }, [setToast]);
  useEffect(() => { load(); const timer=setInterval(load, 1800); return () => clearInterval(timer); }, [load]);
  const submit = async (e) => { e.preventDefault(); if (!file) { setToast({ type:'error', message:'Choose a file first.' }); return; } if (!health?.ffmpeg || !health?.ffprobe) { setToast({ type:'error', message:'FFmpeg and FFprobe are required. Install FFmpeg, then restart the server.' }); return; } setBusy(true); setUploadProgress(true); try { const form = new FormData(); form.append('media',file); form.append('format',format); form.append('bitrate',bitrate); await api('/convert',{method:'POST',body:form}); setFile(null); if(inputRef.current) inputRef.current.value=''; setToast({type:'success',message:'Audio extraction job queued.'}); await load(); } catch(err) { setToast({type:'error',message:err.message}); } finally { setBusy(false); setUploadProgress(false); } };
  const cancel = async (job) => { try { await api(`/convert/${job.id}/cancel`,{method:'POST'}); setToast({type:'success',message:'Conversion cancellation requested.'}); await load(); } catch(err) { setToast({type:'error',message:err.message}); } };
  return <div className="page-stack"><PageHeader eyebrow="MEDIA TOOLKIT" title="Audio extractor" description="Extract audio from files you own or are authorized to process. FFmpeg runs locally on your server." icon={AudioLines}/><div className="audio-layout"><section className="audio-convert-card"><div className="card-top-icon"><AudioLines size={22}/></div><h3>Convert media to audio</h3><p>Upload a supported audio or video file and choose a useful output format.</p><form onSubmit={submit} className="convert-form"><input ref={inputRef} type="file" className="visually-hidden" accept="video/*,audio/*,.mkv,.flac,.m4a,.webm,.mov,.mp4,.mp3,.wav,.ogg" onChange={(e)=>setFile(e.target.files?.[0]||null)}/><button className={`file-dropzone ${file?'file-selected':''}`} type="button" onClick={()=>inputRef.current?.click()}><span className="upload-round"><Upload size={19}/></span><b>{file ? file.name : 'Choose media file'}</b><span>{file ? `${formatBytes(file.size)} · Click to change` : `Video or audio · Up to ${Math.round((health?.maxUploadBytes || 1073741824)/1024/1024)} MB`}</span><em>Browse files</em></button><div className="field-pair"><label>Output format<select value={format} onChange={(e)=>setFormat(e.target.value)}><option value="mp3">MP3 · widely compatible</option><option value="m4a">M4A · AAC audio</option><option value="wav">WAV · uncompressed PCM</option></select></label><label>Audio bitrate<select value={bitrate} onChange={(e)=>setBitrate(e.target.value)} disabled={format==='wav'}><option value="96k">96 kbps</option><option value="128k">128 kbps</option><option value="192k">192 kbps</option><option value="256k">256 kbps</option><option value="320k">320 kbps</option></select></label></div><div className="conversion-info"><Info size={14}/><span>Conversion cannot improve the source audio quality. WAV is uncompressed; its bitrate selector is not applicable.</span></div><button className="button button-primary button-full" disabled={busy || !file}>{busy ? <Loader size={16} className="spin"/> : <Zap size={16}/>} {busy?'Processing upload…':'Extract audio'}</button></form><div className={`dependency-status ${health?.ffmpeg&&health?.ffprobe?'dep-ready':'dep-missing'}`}><span/><div><b>{health?.ffmpeg&&health?.ffprobe?'FFmpeg ready':'FFmpeg required'}</b><small>{health?.ffmpeg&&health?.ffprobe?'Audio conversion engine detected on server.':'Install FFmpeg and FFprobe on the server, then restart the app.'}</small></div></div></section><section className="conversion-side"><SectionTitle title="Recent conversions" subtitle="Processing status and completed audio files" action={<button className="icon-button" onClick={load} title="Refresh jobs"><RefreshCw size={16}/></button>}/>{jobs.length ? <div className="conversion-list">{jobs.map((job)=> <div className="conversion-job" key={job.id}><div className="conversion-icon"><FileAudio size={19}/></div><div className="conversion-copy"><b title={job.title}>{job.title}</b><div className="conversion-meta"><span>{job.outputFormat?.toUpperCase()}</span><StatusBadge status={job.status==='processing'?'processing':job.status}/></div>{['queued','processing'].includes(job.status)&&<ProgressLine value={job.progress}/>}{job.error&&<small className="download-error">{job.error}</small>}{job.status==='completed'&&<small className="download-complete"><Check size={13}/> Added to media library</small>}</div><div className="conversion-actions">{job.status==='completed'&&<a className="mini-action" href={job.downloadUrl} title="Download output"><Download size={15}/></a>}{['queued','processing'].includes(job.status)&&<button className="mini-action danger" onClick={()=>cancel(job)} title="Cancel"><X size={15}/></button>}</div></div>)}</div>:<EmptyState icon={FileAudio} title="No conversions yet" text="Your audio extraction jobs will appear here after you upload a file."/>}</section></div><div className="warning-panel"><ShieldCheck size={17}/><div><b>File privacy</b><p>Uploads are saved in this app's managed storage while being processed. Use only media you have permission to convert, and remove temporary or unwanted files from your library when finished.</p></div></div></div>;
}

function LibraryPage({ favoritesOnly = false }) {
  const [items, setItems] = useState([]); const [q, setQ] = useState(''); const [type, setType] = useState('all'); const [sort, setSort] = useState('newest'); const { setToast } = useApp();
  const load = useCallback(async () => { try { const p = new URLSearchParams(); if(type!=='all')p.set('type',type);if(favoritesOnly)p.set('favorite','true');if(q.trim())p.set('q',q.trim());p.set('sort',sort); const d=await api(`/library?${p}`);setItems(d.items||[]); } catch(err){setToast({type:'error',message:err.message});} },[type,q,sort,favoritesOnly,setToast]);
  useEffect(()=>{load();},[load]);
  const favorite = async(item) => { try { const d=await api(`/library/${item.id}`,{method:'PATCH',body:{favorite:!item.favorite}});setItems((prev)=>prev.map((m)=>m.id===item.id?d.media:m).filter((m)=>!favoritesOnly||m.favorite)); } catch(err){setToast({type:'error',message:err.message});} };
  const erase = async(item) => { if(!window.confirm(`Delete “${item.title}” from your library and managed storage?`))return;try{await api(`/library/${item.id}`,{method:'DELETE'});setItems((prev)=>prev.filter((m)=>m.id!==item.id));setToast({type:'success',message:'Media deleted from storage.'});}catch(err){setToast({type:'error',message:err.message});} };
  const context = useApp();
  const addToPlaylist = async(item) => { try { const response=await api('/playlists');const lists=response.playlists||[]; if(!lists.length){ const title=window.prompt('Create a playlist name first:'); if(!title?.trim())return;const made=await api('/playlists',{method:'POST',body:{title:title.trim()}});await api(`/playlists/${made.playlist.id}/items`,{method:'POST',body:{mediaId:item.id}});context.setToast({type:'success',message:'Playlist created and media added.'});return;} const choices=lists.map((p,i)=>`${i+1}. ${p.title}`).join('\n');const answer=window.prompt(`Choose a playlist number for “${item.title}”:\n${choices}`);const n=Number(answer);if(!Number.isInteger(n)||n<1||n>lists.length)return;await api(`/playlists/${lists[n-1].id}/items`,{method:'POST',body:{mediaId:item.id}});context.setToast({type:'success',message:`Added to ${lists[n-1].title}.`}); } catch(err){context.setToast({type:'error',message:err.message});} };
  return <div className="page-stack"><PageHeader eyebrow={favoritesOnly?'YOUR SAVED PICKS':'LOCAL COLLECTION'} title={favoritesOnly?'Favorites':'My library'} description={favoritesOnly?'Media you have marked as a favorite.':'Manage videos and audio files stored in the app’s managed library.'} icon={favoritesOnly?Heart:Folder} action={<ImportFilesButton label="Import media"/>}/><div className="library-toolbar"><div className="toolbar-search"><Search size={16}/><input value={q} onChange={(e)=>setQ(e.target.value)} placeholder="Filter your media…"/></div><div className="toolbar-controls"><label><SlidersHorizontal size={15}/><select value={type} onChange={(e)=>setType(e.target.value)}><option value="all">All types</option><option value="video">Video</option><option value="audio">Audio</option></select></label><label><ArrowDownUp size={15}/><select value={sort} onChange={(e)=>setSort(e.target.value)}><option value="newest">Newest first</option><option value="oldest">Oldest first</option><option value="title">Title A–Z</option><option value="size">Largest first</option></select></label></div></div><div className="collection-count"><span>{items.length} item{items.length===1?'':'s'}{favoritesOnly?' in favorites':''}</span><span><HardDrive size={13}/> Files are stored under your configured storage directory</span></div><MediaGrid items={items} onFavorite={favorite} onDelete={erase} onAddToPlaylist={addToPlaylist}/></div>;
}
function PlaylistsPage() {
  const [playlists,setPlaylists]=useState([]); const [media,setMedia]=useState([]); const [title,setTitle]=useState(''); const [description,setDescription]=useState(''); const [openId,setOpenId]=useState(null); const {setToast}=useApp();
  const load=useCallback(async()=>{try{const [p,m]=await Promise.all([api('/playlists'),api('/library')]);setPlaylists(p.playlists||[]);setMedia(m.items||[]);}catch(err){setToast({type:'error',message:err.message});}},[setToast]);
  useEffect(()=>{load();},[load]);
  const create=async(e)=>{e.preventDefault();if(!title.trim())return;try{await api('/playlists',{method:'POST',body:{title:title.trim(),description}});setTitle('');setDescription('');setToast({type:'success',message:'Playlist created.'});await load();}catch(err){setToast({type:'error',message:err.message});}};
  const add=async(p,item)=>{try{await api(`/playlists/${p.id}/items`,{method:'POST',body:{mediaId:item.id}});setToast({type:'success',message:`Added to ${p.title}.`});await load();}catch(err){setToast({type:'error',message:err.message});}};
  const remove=async(p,item)=>{try{await api(`/playlists/${p.id}/items/${item.id}`,{method:'DELETE'});await load();}catch(err){setToast({type:'error',message:err.message});}};
  const erase=async(p)=>{if(!window.confirm(`Delete playlist “${p.title}”? Media files will not be deleted.`))return;try{await api(`/playlists/${p.id}`,{method:'DELETE'});setToast({type:'success',message:'Playlist deleted.'});await load();}catch(err){setToast({type:'error',message:err.message});}};
  return <div className="page-stack"><PageHeader eyebrow="MAKE IT YOURS" title="Playlists" description="Collect related videos and audio in personal playlists." icon={ListFilter}/><div className="playlist-create-card"><div className="playlist-create-copy"><div className="tool-icon tool-blue"><Plus size={20}/></div><div><h3>Create a playlist</h3><p>Give your collection a name and, optionally, a short description.</p></div></div><form onSubmit={create} className="playlist-create-form"><input value={title} onChange={(e)=>setTitle(e.target.value)} maxLength={80} placeholder="Playlist name" aria-label="Playlist name" required/><input value={description} onChange={(e)=>setDescription(e.target.value)} maxLength={300} placeholder="Description (optional)" aria-label="Playlist description"/><button className="button button-primary" disabled={!title.trim()}><Plus size={15}/> Create</button></form></div>{playlists.length?<div className="playlist-list">{playlists.map((p)=> <article className="playlist-card" key={p.id}><div className="playlist-card-head"><div className="playlist-art"><Music2 size={24}/><span>{String(p.items?.length||0).padStart(2,'0')}</span></div><div className="playlist-main"><h3>{p.title}</h3><p>{p.description||'A personal media collection.'}</p><span>{p.items?.length||0} item{p.items?.length===1?'':'s'} · Created {timeAgo(p.createdAt)}</span></div><button className="mini-icon" onClick={()=>erase(p)} title="Delete playlist"><Trash2 size={16}/></button><button className="button button-secondary button-small" onClick={()=>setOpenId(openId===p.id?null:p.id)}>{openId===p.id?'Done':'Manage items'} <ChevronDown size={14}/></button></div>{p.items?.length>0&&<div className="playlist-items">{p.items.map((item)=><div className="playlist-item" key={item.id}><div className="playlist-item-icon">{item.type==='audio'?<Music2 size={16}/>:<Film size={16}/>}</div><Link to={`/watch/${item.id}`}>{item.title}</Link><span>{item.sizeLabel}</span><button className="mini-icon" onClick={()=>remove(p,item)} title="Remove from playlist"><X size={14}/></button></div>)}</div>}{openId===p.id&&<div className="playlist-add-panel"><b>Add from your library</b>{media.filter((m)=>!(p.mediaIds||[]).includes(m.id)).map((m)=><div className="playlist-add-row" key={m.id}><span className="playlist-add-type">{m.type==='audio'?<Music2 size={14}/>:<Film size={14}/>}</span><span>{m.title}</span><button className="button button-secondary button-small" onClick={()=>add(p,m)}><Plus size={13}/> Add</button></div>)}{!media.length&&<p className="muted-copy">Import media into your library first.</p>}</div>}</article>)}</div>:<EmptyState icon={ListFilter} title="No playlists yet" text="Create a playlist to organize your imported and downloaded media."/>}</div>;
}
function HistoryPage() {
  const [entries,setEntries]=useState([]); const [media,setMedia]=useState([]); const {setToast}=useApp();
  const load=useCallback(async()=>{try{const [h,m]=await Promise.all([api('/history'),api('/library')]);setEntries(h.history||[]);setMedia(m.items||[]);}catch(err){setToast({type:'error',message:err.message});}},[setToast]);
  useEffect(()=>{load();},[load]);
  const clear=async()=>{if(!window.confirm('Clear playback history? Your media files will not be deleted.'))return;try{await api('/history',{method:'DELETE'});setEntries([]);setToast({type:'success',message:'Playback history cleared.'});}catch(err){setToast({type:'error',message:err.message});}};
  return <div className="page-stack"><PageHeader eyebrow="PICK UP WHERE YOU LEFT OFF" title="Playback history" description="Recently played media and saved playback positions." icon={Clock3} action={entries.length>0&&<button className="button button-secondary" onClick={clear}><Trash2 size={15}/> Clear history</button>}/>{entries.length?<div className="history-list">{entries.map((entry)=>{const item=media.find((m)=>m.id===entry.mediaId);return <div className="history-row" key={entry.id}><div className="history-art">{item?<MediaArtwork item={item}/>:<Film size={20}/>}</div><div className="history-copy"><Link to={item?`/watch/${item.id}`:'/library'}>{entry.title||item?.title||'Unavailable media'}</Link><p>Last played {timeAgo(entry.watchedAt)} · {entry.positionSeconds?`Resume at ${formatDuration(entry.positionSeconds)}`:'Playback started'}</p>{entry.durationSeconds>0&&<ProgressLine value={entry.positionSeconds/entry.durationSeconds*100}/>}</div><Link to={item?`/watch/${item.id}`:'/library'} className="mini-action" title="Resume playback"><Play size={16}/></Link></div>;})}</div>:<EmptyState icon={Clock3} title="No playback history" text="When you play a file from your library, saved progress and recent activity will appear here." action={<Link to="/library" className="button button-primary">Open library <ChevronRight size={15}/></Link>}/>}</div>;
}
function SettingsPage() {
  const {settings,setSettings,setToast,health}=useApp(); const [draft,setDraft]=useState(settings); const [saving,setSaving]=useState(false);
  useEffect(()=>setDraft(settings),[settings]);
  const update=(k,v)=>setDraft((p)=>({...p,[k]:v}));
  const save=async()=>{setSaving(true);try{const d=await api('/settings',{method:'PATCH',body:draft});setSettings(d.settings);setToast({type:'success',message:'Settings saved.'});}catch(err){setToast({type:'error',message:err.message});}finally{setSaving(false);}};
  return <div className="page-stack"><PageHeader eyebrow="MAKE THIS SPACE YOURS" title="Settings" description="Control appearance and default media preferences." icon={Settings}/><div className="settings-layout"><section className="settings-card"><div className="settings-card-heading"><div className="tool-icon tool-violet"><Sun size={19}/></div><div><h3>Appearance</h3><p>Choose how ZeeTube looks on this device.</p></div></div><div className="settings-field-row"><div><b>Theme</b><small>Choose the calm light appearance or a darker workspace.</small></div><div className="theme-options"><button className={draft.theme==='dark'?'theme-option-selected':''} onClick={()=>update('theme','dark')}><Moon size={15}/> Dark</button><button className={draft.theme==='light'?'theme-option-selected':''} onClick={()=>update('theme','light')}><Sun size={15}/> Light</button></div></div></section><section className="settings-card"><div className="settings-card-heading"><div className="tool-icon tool-blue"><SlidersHorizontal size={19}/></div><div><h3>Media preferences</h3><p>Defaults used by tools when the source supports them.</p></div></div><div className="settings-form-grid"><label>Preferred format<select value={draft.defaultFormat} onChange={(e)=>update('defaultFormat',e.target.value)}><option value="mp4">MP4</option><option value="webm">WebM</option><option value="mp3">MP3</option><option value="m4a">M4A</option><option value="wav">WAV</option></select></label><label>Preferred quality<select value={draft.defaultQuality} onChange={(e)=>update('defaultQuality',e.target.value)}><option value="source">Original source quality</option><option value="1080p">1080p (when available)</option><option value="720p">720p (when available)</option><option value="480p">480p (when available)</option><option value="360p">360p (when available)</option></select></label><label>Concurrent downloads<select value={draft.concurrency} onChange={(e)=>update('concurrency',Number(e.target.value))}><option value={1}>1 download</option><option value={2}>2 downloads</option><option value={3}>3 downloads</option><option value={4}>4 downloads</option></select><small>Server limit must also be configured in .env. This preference is saved for reference.</small></label></div></section><section className="settings-card"><div className="settings-card-heading"><div className="tool-icon tool-teal"><HardDrive size={19}/></div><div><h3>System status</h3><p>Current local server capabilities.</p></div></div><div className="system-status-list"><div><span>Backend API</span><b className={health?.ok?'status-text-ok':'status-text-bad'}>{health?.ok?'Connected':'Unavailable'}</b></div><div><span>Storage driver</span><b>{health?.storageDriver||'Checking…'}</b></div><div><span>FFmpeg / FFprobe</span><b className={health?.ffmpeg&&health?.ffprobe?'status-text-ok':'status-text-bad'}>{health?.ffmpeg&&health?.ffprobe?'Available':'Not detected'}</b></div><div><span>Remote direct downloads</span><b className={health?.downloadsEnabled?'status-text-ok':'status-text-bad'}>{health?.downloadsEnabled?'Configured':'Disabled'}</b></div><div><span>Maximum upload size</span><b>{health?.maxUploadBytes?formatBytes(health.maxUploadBytes):'—'}</b></div><div><span>Maximum direct download size</span><b>{health?.maxDownloadBytes?formatBytes(health.maxDownloadBytes):'—'}</b></div></div><Link to="/sources" className="text-link">Manage supported sources <ChevronRight size={14}/></Link></section><div className="settings-save-row"><span><ShieldCheck size={15}/> Changes are saved to local app settings.</span><button className="button button-primary" disabled={saving} onClick={save}>{saving?<Loader size={16} className="spin"/>:<Check size={16}/>} Save settings</button></div></div></div>;
}
function HelpPage() {
  return <div className="page-stack"><PageHeader eyebrow="GUIDES & LIMITATIONS" title="Help & about" description="Quick setup notes for running the app safely on your own computer." icon={CircleHelp}/><div className="help-hero"><div className="help-logo"><span className="brand-mark"><span/><span/><span/></span></div><div><h3>ZeeTube</h3><p>Local-first media management · Version 1.1.0</p><span className="help-tag"><Check size={13}/> Single-user local mode</span></div></div><div className="faq-list"><details open><summary>How do I start the app? <ChevronDown size={16}/></summary><div><p>Install Node.js 20 or later and FFmpeg, extract the ZIP, copy <code>.env.example</code> to <code>.env</code>, run <code>npm install</code>, then <code>npm run dev</code>. Open <code>http://127.0.0.1:5173</code>.</p></div></details><details><summary>How do I discover YouTube videos? <ChevronDown size={16}/></summary><div><p>Add a server-side <code>YOUTUBE_API_KEY</code> after enabling YouTube Data API v3 in Google Cloud Console. The Home feed and video search use that API; playback uses YouTube’s official iframe player. Use <b>Import media</b> for your own local audio and video files.</p></div></details><details><summary>Can I download a YouTube video from its watch link? <ChevronDown size={16}/></summary><div><p>No. ZeeTube uses YouTube’s official embedded player and does not offer YouTube video or audio downloads. For other media, direct downloads remain disabled until a hostname is added to <code>MEDIA_ALLOWED_HOSTS</code> in <code>.env</code>; only enable hosts you own or are authorized to use.</p></div></details><details><summary>Why does audio conversion fail? <ChevronDown size={16}/></summary><div><p>Install both <code>ffmpeg</code> and <code>ffprobe</code> on the server computer, then restart the app. The uploaded file must contain an audio stream. Conversion output is placed in the library.</p></div></details><details><summary>Can I deploy this publicly? <ChevronDown size={16}/></summary><div><p>This build is configured for local single-user use and binds to <code>127.0.0.1</code> by default. It does not include multi-user authentication. Do not expose it to the public internet without adding authentication, per-user storage isolation, operational monitoring, and a production security review.</p></div></details><details><summary>Can I download any YouTube video or website? <ChevronDown size={16}/></summary><div><p>No. This app does not promise universal site support and does not bypass DRM, logins, paywalls, or access controls. Use official APIs, platform-approved downloads, authorized direct media URLs, or files you have permission to process.</p></div></details></div><div className="help-links"><div><ShieldCheck size={17}/><div><b>Privacy and security</b><p>Files are managed locally by default. Remote URL fetches require a strict host allowlist and block private/reserved network destinations.</p></div></div><div><Info size={17}/><div><b>Honest feature status</b><p>No false trending results, invented formats, or simulated download progress. If a capability needs an external API, host configuration, or codec support, the app says so.</p></div></div></div></div>;
}

function WatchPage() {
  const navigate = useNavigate();
  const { id }=useParams(); const [item,setItem]=useState(null); const [related,setRelated]=useState([]); const [playlists,setPlaylists]=useState([]); const [historyEntry,setHistoryEntry]=useState(null); const [notFound,setNotFound]=useState(false); const [playerError,setPlayerError]=useState(''); const {setToast}=useApp(); const videoRef=useRef(null); const lastSent=useRef(0);
  useEffect(()=>{let active=true;Promise.all([api('/library'),api('/playlists'),api('/history')]).then(([m,p,h])=>{if(!active)return;const found=(m.items||[]).find((x)=>x.id===id);setItem(found||null);setRelated((m.items||[]).filter((x)=>x.id!==id).slice(0,6));setPlaylists(p.playlists||[]);setHistoryEntry((h.history||[]).find((x)=>x.mediaId===id)||null);if(!found)setNotFound(true);}).catch((e)=>setToast({type:'error',message:e.message}));return()=>{active=false;};},[id,setToast]);
  useEffect(()=>{if(item&&historyEntry?.positionSeconds>3){const player=videoRef.current;if(player){player.currentTime=historyEntry.positionSeconds;}}},[item?.id,historyEntry?.id]);
  const saved=async(pos,duration)=>{if(!item)return;try{await api('/history',{method:'POST',body:{mediaId:item.id,positionSeconds:Math.floor(pos||0),durationSeconds:Math.floor(duration||0)}});}catch{}};
  const toggleFavorite=async()=>{try{const d=await api(`/library/${item.id}`,{method:'PATCH',body:{favorite:!item.favorite}});setItem(d.media);setToast({type:'success',message:d.media.favorite?'Added to favorites.':'Removed from favorites.'});}catch(e){setToast({type:'error',message:e.message});}};
  const addPlaylist=async(e)=>{const id=e.target.value;if(!id)return;try{await api(`/playlists/${id}/items`,{method:'POST',body:{mediaId:item.id}});setToast({type:'success',message:'Added to playlist.'});}catch(err){setToast({type:'error',message:err.message});}e.target.value='';};
  if(!item)return <div className="page-stack">{notFound?<EmptyState icon={Film} title="Media not found" text="This file may have been removed from managed storage." action={<Link to="/library" className="button button-primary">Return to library</Link>}/>:<div className="player-loading"><Loader className="spin" size={24}/> Loading media…</div>}</div>;
  return <div className="page-stack watch-page"><div className="watch-back"><button className="text-link" onClick={()=>navigate(-1)}><ChevronLeft size={15}/> Back</button><span>MEDIA PLAYER <i/> LOCAL LIBRARY</span></div><div className="watch-layout"><section className="watch-main"><div className="player-frame">{item.type==='audio'?<div className="audio-player-art"><MediaArtwork item={item} large/><div className="audio-player-title"><span>NOW PLAYING</span><h2>{item.title}</h2><p>Audio file · {item.sizeLabel||formatBytes(item.bytes)}</p></div><audio ref={videoRef} src={item.streamUrl} controls autoPlay={false} onTimeUpdate={(e)=>{const p=e.currentTarget;if(Math.abs(p.currentTime-lastSent.current)>10){lastSent.current=p.currentTime;saved(p.currentTime,p.duration);}}} onError={()=>setPlayerError('The browser could not decode this audio file. Try converting it to MP3 or M4A.')}/></div>:<video ref={videoRef} src={item.streamUrl} controls playsInline preload="metadata" onTimeUpdate={(e)=>{const p=e.currentTarget;if(Math.abs(p.currentTime-lastSent.current)>10){lastSent.current=p.currentTime;saved(p.currentTime,p.duration);}}} onLoadedMetadata={(e)=>{if(historyEntry?.positionSeconds>3)e.currentTarget.currentTime=historyEntry.positionSeconds;}} onError={()=>setPlayerError('This browser may not support the media codec. Try another format or convert a file you are authorized to process.')}/>}{playerError&&<div className="player-error"><AlertCircle size={15}/>{playerError}</div>}</div><div className="watch-title-row"><div><div className="eyebrow"><span className="eyebrow-dot"/> {item.type==='audio'?'AUDIO FILE':'VIDEO FILE'} · {item.origin==='download'?'DOWNLOADED':item.origin==='conversion'?'CONVERTED':'IN YOUR LIBRARY'}</div><h2>{item.title}</h2><p>{item.sizeLabel||formatBytes(item.bytes)}{item.sourceHost?` · ${item.sourceHost}`:''} · Added {timeAgo(item.createdAt)}</p></div><button className={`favorite-big ${item.favorite?'favorite-active':''}`} onClick={toggleFavorite}><Heart size={17} fill={item.favorite?'currentColor':'none'}/>{item.favorite?'Saved':'Favorite'}</button></div><div className="watch-action-row"><a href={item.downloadUrl} className="button button-primary"><Download size={16}/> Download file</a><label className="playlist-select"><ListFilter size={15}/><select defaultValue="" onChange={addPlaylist}><option value="">Add to playlist…</option>{playlists.map((p)=><option key={p.id} value={p.id}>{p.title}</option>)}</select></label><Link to="/audio" className="button button-secondary"><AudioLines size={15}/> Audio tools</Link></div><div className="watch-description"><div className="description-icon"><Info size={16}/></div><div><b>About this media</b><p>This file is stored in your ZeeTube library. Playback, download, and conversion depend on browser codec support and the file's permissions. Always keep a backup of important files.</p></div></div></section><aside className="related-panel"><SectionTitle title="Up next" subtitle="More from your media library" action={<Link to="/library" className="text-link">See all</Link>}/>{related.length?related.map((m)=><Link to={`/watch/${m.id}`} className="related-media" key={m.id}><div className="related-art"><MediaArtwork item={m}/></div><div><b>{m.title}</b><span>{m.type==='audio'?'Audio':'Video'} · {m.sizeLabel||formatBytes(m.bytes)}</span><small>{timeAgo(m.createdAt)}</small></div></Link>):<div className="related-empty"><Film size={19}/><p>Import more media to see related files here.</p></div>}</aside></div></div>;
}

function YouTubeWatchPage() {
  const { id } = useParams();
  const location = useLocation();
  const [video, setVideo] = useState(location.state?.video || null);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    api(`/catalog/videos/${encodeURIComponent(id)}`)
      .then((result) => { if (active) { setVideo(result.video); setError(''); } })
      .catch((err) => { if (active) setError(err.message); });
    return () => { active = false; };
  }, [id]);
  return <div className="page-stack youtube-watch-page">
    <div className="watch-back"><Link to="/" className="text-link"><ChevronLeft size={15}/> Back to ZeeTube</Link><span>YOUTUBE PLAYER <i/> OFFICIAL EMBED</span></div>
    <div className="youtube-watch-layout">
      <section className="youtube-watch-main">
        <div className="youtube-embed-wrap"><iframe title={video?.title || 'YouTube video player'} src={`https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}?rel=0&playsinline=1`} allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowFullScreen referrerPolicy="strict-origin-when-cross-origin"/></div>
        <div className="youtube-watch-copy">
          <div className="eyebrow"><Youtube size={13}/> WATCHING ON YOUTUBE</div>
          <h2>{video?.title || 'YouTube video'}</h2>
          <div className="youtube-watch-meta"><span>{video?.channelTitle || 'Video creator'}</span>{video?.viewCount != null && <><i/>{formatViews(video.viewCount)}</>}{video?.publishedAt && <><i/>{timeAgo(video.publishedAt)}</>}</div>
          <p>{video?.description || 'This video is streamed from YouTube using its official embedded player. Viewing and playback controls are provided by YouTube.'}</p>
          <div className="youtube-watch-actions"><a className="button button-primary" href={`https://www.youtube.com/watch?v=${encodeURIComponent(id)}`} target="_blank" rel="noreferrer"><ExternalLink size={15}/> Open on YouTube</a><Link to="/search" className="button button-secondary"><Search size={15}/> Find more videos</Link></div>
          {error && <div className="info-banner"><Info size={15}/><span>{error} The embedded player may still work if this video allows embedding.</span></div>}
          <div className="youtube-policy-note"><ShieldCheck size={16}/><span>ZeeTube uses YouTube’s official player. It does not download or extract audio from YouTube videos.</span></div>
        </div>
      </section>
      <aside className="youtube-side-panel"><div className="youtube-side-icon"><Youtube size={23}/></div><h3>Keep watching</h3><p>Discover more public videos from the ZeeTube home feed or search by topic, title, or creator.</p><Link to="/" className="button button-secondary">Explore videos <ChevronRight size={14}/></Link></aside>
    </div>
  </div>;
}

function PlusPage() {
  return <div className="page-stack plus-page">
    <section className="plus-hero"><div className="plus-glow"/><div className="plus-mark"><Crown size={25}/></div><div className="eyebrow">A MORE FOCUSED WAY TO WATCH</div><h2>Meet <span>ZeeTube Plus.</span></h2><p>A future membership concept for a cleaner, more personal video experience.</p><span className="plus-preview-label">MEMBERSHIP PREVIEW · NOT FOR SALE YET</span></section>
    <section className="plus-plan-grid">
      <article className="plus-plan"><div className="plus-plan-top"><div><span className="plan-label">CURRENT EXPERIENCE</span><h3>Free</h3></div><span className="plan-price">Rs 0 <small>/ forever</small></span></div><p className="plan-description">Everything available in this self-hosted ZeeTube build.</p><ul><li><Check size={16}/> Browse public YouTube videos</li><li><Check size={16}/> Official YouTube embedded playback</li><li><Check size={16}/> Personal local media library</li><li><Check size={16}/> Authorized direct-media downloads</li><li><Check size={16}/> No ZeeTube-inserted ads in this build</li></ul><span className="plan-current">Your current plan</span></article>
      <article className="plus-plan plus-plan-featured"><div className="plus-plan-top"><div><span className="plan-label">FUTURE MEMBERSHIP</span><h3><Crown size={20}/> ZeeTube Plus</h3></div><span className="plan-price">Coming <small>soon</small></span></div><p className="plan-description">A planned upgrade for people who want more control and convenience.</p><ul><li><Check size={16}/> Ad-free experience if ads are introduced</li><li><Check size={16}/> Expanded personalization and themes</li><li><Check size={16}/> Optional cloud sync when accounts are added</li><li><Check size={16}/> Membership support and early feature access</li></ul><button className="button button-primary button-full" disabled><Crown size={16}/> Payments not connected yet</button><small className="plan-footnote">No payment is collected. Pricing, account services, and billing will be announced only after they are implemented.</small></article>
    </section>
    <div className="plus-honesty"><ShieldCheck size={18}/><div><b>Clear membership status</b><p>This page is a product preview, not a live subscription. The app currently has no ad network, user accounts, or payment processor. We will not claim a paid plan is active or collect payments until those systems are built and tested.</p></div></div>
  </div>;
}

function ToastHost({ toast, close }) {
  useEffect(() => { if (!toast) return; const timer=setTimeout(close,4600); return ()=>clearTimeout(timer); },[toast,close]);
  if(!toast)return null;const Icon=toast.type==='error'?AlertCircle:toast.type==='success'?Check:Info;
  return <div className={`toast toast-${toast.type||'info'}`} role="status"><Icon size={18}/><span>{toast.message}</span><button onClick={close} aria-label="Dismiss notification"><X size={15}/></button></div>;
}

export default function App() {
  const [health,setHealth]=useState(null); const [settings,setSettingsState]=useState({theme:'light',defaultFormat:'mp4',defaultQuality:'source',concurrency:2}); const [toast,setToastState]=useState(null);
  const setToast=useCallback((value)=>setToastState(value),[]);
  const setSettings=useCallback((value)=>{setSettingsState(value);document.documentElement.dataset.theme=value.theme||'light';},[]);
  useEffect(()=>{api('/health').then(setHealth).catch(()=>setHealth({ok:false,downloadsEnabled:false}));api('/settings').then((r)=>setSettings(r.settings)).catch(()=>{});},[setSettings]);
  const context=useMemo(()=>({health,settings,setSettings,setToast}),[health,settings,setSettings,setToast]);
  return <AppContext.Provider value={context}><Routes><Route element={<Shell/>}><Route index element={<HomePage/>}/><Route path="explore" element={<ExplorePage/>}/><Route path="search" element={<SearchPage/>}/><Route path="sources" element={<SourcesPage/>}/><Route path="downloads" element={<DownloadsPage/>}/><Route path="audio" element={<AudioPage/>}/><Route path="library" element={<LibraryPage/>}/><Route path="playlists" element={<PlaylistsPage/>}/><Route path="history" element={<HistoryPage/>}/><Route path="favorites" element={<LibraryPage favoritesOnly/>}/><Route path="settings" element={<SettingsPage/>}/><Route path="help" element={<HelpPage/>}/><Route path="watch/:id" element={<WatchPage/>}/><Route path="youtube/:id" element={<YouTubeWatchPage/>}/><Route path="plus" element={<PlusPage/>}/><Route path="*" element={<div className="page-stack"><EmptyState icon={CircleHelp} title="Page not found" text="The page you were looking for does not exist." action={<Link className="button button-primary" to="/">Go home</Link>}/></div>}/></Route></Routes><ToastHost toast={toast} close={()=>setToastState(null)}/></AppContext.Provider>;
}
