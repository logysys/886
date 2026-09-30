import React, { useState, useEffect, useCallback } from 'react';
import { 
  LayoutGrid, 
  Eye, 
  ShieldCheck, 
  Copy, 
  ExternalLink, 
  RefreshCw, 
  Layers, 
  Plus, 
  Check, 
  Sparkles,
  Globe,
  Mail,
  KeyRound,
  LogOut,
  X
} from 'lucide-react';

interface AuthUser {
  email: string;
  token?: string;
  ownerKey?: string;
}

// Extract Wall ID from base domain pathname (e.g. /W0000004 or /886.wiki/W0000004) or query parameter (?wall=W0000004)
const extractWallFromLocation = (): string => {
  if (typeof window === 'undefined') return 'main';
  const pathname = window.location.pathname;
  const match = pathname.match(/\b(W\d+)\b/i);
  if (match) {
    return match[1].toUpperCase();
  }
  const params = new URLSearchParams(window.location.search);
  const wallParam = params.get('wall');
  if (wallParam && wallParam.trim()) {
    const qMatch = wallParam.match(/\b(W\d+)\b/i);
    return qMatch ? qMatch[1].toUpperCase() : wallParam.trim();
  }
  return 'main';
};

// Helper to safely fetch JSON without throwing when non-JSON is received
const safeFetchJson = async (url: string, options?: RequestInit) => {
  try {
    const res = await fetch(url, options);
    const contentType = res.headers.get('content-type') || '';
    if (!res.ok || !contentType.toLowerCase().includes('application/json')) {
      return null;
    }
    return await res.json();
  } catch {
    return null;
  }
};

// Helper to mask email in format: l*******@gmail.com
export const maskEmail = (email?: string): string => {
  if (!email || typeof email !== 'string' || !email.includes('@')) return '';
  const [local, domain] = email.split('@');
  if (!local) return `@${domain}`;
  const first = local[0].toLowerCase();
  const starCount = Math.max(local.length - 1, 7);
  return `${first}${'*'.repeat(starCount)}@${domain}`;
};

export default function App() {
  const [activeTab, setActiveTab] = useState<'editor' | 'viewer'>('editor');
  const [wallId, setWallId] = useState<string>(() => extractWallFromLocation());
  const [ownerKey, setOwnerKey] = useState<string>('wiki-owner-secret-key-v618');
  const [isOwnerAuth, setIsOwnerAuth] = useState<boolean>(true);
  const [copiedLink, setCopiedLink] = useState<string | null>(null);
  const [serverStats, setServerStats] = useState<any>(null);
  const [wallsList, setWallsList] = useState<any[]>([]);
  const [activeWallOwnerEmail, setActiveWallOwnerEmail] = useState<string>('');

  // Creator Auth & 4-Digit OTP State
  const [showAuthModal, setShowAuthModal] = useState<boolean>(false);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [authStep, setAuthStep] = useState<'email' | 'otp' | 'generate'>('email');
  const [emailInput, setEmailInput] = useState<string>('');
  const [otpInput, setOtpInput] = useState<string>('');
  const [newWallTitle, setNewWallTitle] = useState<string>('');
  const [authLoading, setAuthLoading] = useState<boolean>(false);
  const [authMessage, setAuthMessage] = useState<{ text: string; isError?: boolean } | null>(null);

  // Navigate to wall keeping clean base domain URL format: domain/Wxxxxxxx
  const navigateToWall = (targetWallId: string, targetOwnerKey?: string) => {
    const match = targetWallId.match(/\b(W\d+)\b/i);
    const cleanId = match ? match[1].toUpperCase() : targetWallId.toUpperCase();
    setWallId(cleanId);

    // If current logged-in user owns this wall, enable owner mode immediately
    const wallObj = wallsList.find(w => w.id === cleanId);
    if (wallObj?.userEmail) {
      setActiveWallOwnerEmail(wallObj.userEmail);
    } else if (cleanId === 'main') {
      setActiveWallOwnerEmail('');
    }
    const isUserWallOwner = !!(user && wallObj && wallObj.userEmail && wallObj.userEmail.toLowerCase() === user.email.toLowerCase());
    
    // For main home wall, keep clean root domain `/` without any suffix
    const targetPath = cleanId === 'main' ? '/' : `/${cleanId}`;

    if (isUserWallOwner) {
      const keyToUse = targetOwnerKey !== undefined ? targetOwnerKey : (wallObj?.ownerKey || user?.ownerKey || ownerKey);
      if (keyToUse) {
        setOwnerKey(keyToUse);
        localStorage.setItem('wall_owner', keyToUse);
        setIsOwnerAuth(true);
      }
      const ownerQuery = keyToUse ? `?owner=${encodeURIComponent(keyToUse)}` : '';
      window.history.pushState({}, '', `${targetPath}${ownerQuery}`);
    } else {
      setIsOwnerAuth(false);
      localStorage.removeItem('wall_owner');
      window.history.pushState({}, '', targetPath);
    }
  };

  // Check URL path and query parameters on load
  useEffect(() => {
    const initialWall = extractWallFromLocation();
    setWallId(initialWall);

    const params = new URLSearchParams(window.location.search);
    const ownerParam = params.get('owner');

    if (ownerParam) {
      setOwnerKey(ownerParam);
      localStorage.setItem('wall_owner', ownerParam);
      setIsOwnerAuth(true);
    }

    // DO NOT rewrite root path '/'! Keep pure domain when user opens the site.
    // Only normalize if someone visited legacy /886.wiki/Wxxxxxxx
    const pathname = window.location.pathname;
    if (pathname.toLowerCase().includes('/886.wiki/')) {
      const ownerQuery = ownerParam ? `?owner=${encodeURIComponent(ownerParam)}` : '';
      const targetPath = initialWall === 'main' ? '/' : `/${initialWall}`;
      window.history.replaceState({}, '', `${targetPath}${ownerQuery}`);
    }

    const storedUser = localStorage.getItem('wiki_user');
    if (storedUser) {
      try {
        const parsed = JSON.parse(storedUser);
        if (parsed.email) {
          setUser(parsed);
          if (parsed.ownerKey) {
            setOwnerKey(parsed.ownerKey);
            localStorage.setItem('wall_owner', parsed.ownerKey);
            setIsOwnerAuth(true);
          }
        }
      } catch (e) {}
    }

    // Listen to browser forward/back buttons
    const onPopState = () => {
      const wallFromLocation = extractWallFromLocation();
      setWallId(wallFromLocation);
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  // Immediately fetch active wall data whenever wallId changes so owner email displays instantly
  useEffect(() => {
    if (wallId && wallId.trim() && wallId !== 'main') {
      safeFetchJson(`/api/wall/${encodeURIComponent(wallId.trim())}`)
        .then((data) => {
          if (data && data.userEmail) {
            setActiveWallOwnerEmail(data.userEmail);
          }
        })
        .catch(() => {});
    } else {
      setActiveWallOwnerEmail('');
    }
  }, [wallId]);

  // Fetch walls list (filtered to user's walls if user is logged in) and server health
  const fetchData = useCallback(async (customEmail?: string) => {
    try {
      const activeEmail = customEmail !== undefined ? customEmail : user?.email;
      const wallsUrl = activeEmail ? `/api/walls?email=${encodeURIComponent(activeEmail)}` : '/api/walls';
      const [resHealth, resWalls] = await Promise.all([
        safeFetchJson('/api/healthz'),
        safeFetchJson(wallsUrl)
      ]);
      if (resHealth) {
        setServerStats(resHealth);
      }
      if (resWalls && resWalls.walls) {
        setWallsList(resWalls.walls);
        const activeWallObj = resWalls.walls.find((w: any) => w.id === wallId);
        if (activeWallObj?.userEmail) {
          setActiveWallOwnerEmail(activeWallObj.userEmail);
        }
        // If active wall is in the user's walls, automatically grant owner access
        if (activeWallObj && activeEmail && activeWallObj.userEmail?.toLowerCase() === activeEmail.toLowerCase()) {
          const key = activeWallObj.ownerKey || user?.ownerKey || ownerKey;
          if (key) {
            setOwnerKey(key);
            localStorage.setItem('wall_owner', key);
          }
          setIsOwnerAuth(true);
        } else if (!window.location.search.includes('owner=')) {
          // Not user's wall and no owner URL parameter -> visitor mode
          setIsOwnerAuth(false);
          localStorage.removeItem('wall_owner');
        }
      }

      if (wallId && wallId.trim() && wallId !== 'main') {
        const currentData = await safeFetchJson(`/api/wall/${encodeURIComponent(wallId.trim())}`);
        if (currentData && currentData.userEmail) {
          setActiveWallOwnerEmail(currentData.userEmail);
        }
      } else {
        setActiveWallOwnerEmail('');
      }
    } catch (e) {
      console.error('Error fetching data:', e);
    }
  }, [user?.email, wallId]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 8000);
    return () => clearInterval(interval);
  }, [fetchData]);

  // Listen to postMessage from iframe
  useEffect(() => {
    const handleMsg = (e: MessageEvent) => {
      if (e.data?.type === 'WIKI_WALL_GENERATED' && e.data.wall) {
        const w = e.data.wall;
        navigateToWall(w.id, w.ownerKey);
        setOwnerKey(w.ownerKey);
        setIsOwnerAuth(true);
        fetchData();
      }
      if (e.data?.type === 'WIKI_WALL_OWNER_EMAIL' && e.data.userEmail) {
        setActiveWallOwnerEmail(e.data.userEmail);
      }
      if (e.data?.type === 'WIKI_AUTH_SUCCESS' && e.data.user) {
        setUser(e.data.user);
      }
      if (e.data?.type === 'WIKI_SIGNOUT') {
        setUser(null);
      }
    };
    window.addEventListener('message', handleMsg);
    return () => window.removeEventListener('message', handleMsg);
  }, [fetchData]);

  const handleCopy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedLink(label);
    setTimeout(() => setCopiedLink(null), 2000);
  };

  const baseDomainUrl = typeof window !== 'undefined' 
    ? (wallId === 'main' ? `${window.location.origin}/` : `${window.location.origin}/${wallId}`) 
    : (wallId === 'main' ? '/' : `/${wallId}`);
  const getViewerUrl = () => (wallId === 'main' ? `${window.location.origin}/` : `${window.location.origin}/${wallId}`);
  const getOwnerUrl = () => {
    const basePath = wallId === 'main' ? `${window.location.origin}/` : `${window.location.origin}/${wallId}`;
    return `${basePath}${ownerKey ? `?owner=${encodeURIComponent(ownerKey)}` : ''}`;
  };

  // Send 4-digit OTP
  const handleSendOtp = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const cleanEmail = emailInput.trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes('@')) {
      setAuthMessage({ text: 'Please enter a valid email address.', isError: true });
      return;
    }

    setAuthLoading(true);
    setAuthMessage(null);
    try {
      const res = await fetch('/api/auth/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: cleanEmail }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setAuthStep('otp');
        setAuthMessage({ text: `4-digit verification code sent to ${cleanEmail}. Please check your inbox.` });
      } else {
        setAuthMessage({ text: data.error || 'Failed to send OTP.', isError: true });
      }
    } catch (err: any) {
      setAuthMessage({ text: 'Network error. Please try again.', isError: true });
    } finally {
      setAuthLoading(false);
    }
  };

  // Verify 4-digit OTP
  const handleVerifyOtp = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const cleanOtp = otpInput.trim();
    if (!/^\d{4}$/.test(cleanOtp)) {
      setAuthMessage({ text: 'Please enter a valid 4-digit numeric code.', isError: true });
      return;
    }

    setAuthLoading(true);
    setAuthMessage(null);
    try {
      const res = await fetch('/api/auth/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: emailInput.trim().toLowerCase(), otp: cleanOtp }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        const authedUser: AuthUser = { email: data.email, token: data.token, ownerKey: data.ownerKey };
        setUser(authedUser);
        if (data.ownerKey) {
          setOwnerKey(data.ownerKey);
          localStorage.setItem('wall_owner', data.ownerKey);
          setIsOwnerAuth(true);
        }
        localStorage.setItem('wiki_user', JSON.stringify(authedUser));
        setAuthStep('generate');
        setAuthMessage({ text: `Verified as ${data.email}!` });
        fetchData(data.email);
      } else {
        setAuthMessage({ text: data.error || 'Verification failed. Incorrect OTP.', isError: true });
      }
    } catch (err: any) {
      setAuthMessage({ text: 'Network error verifying code.', isError: true });
    } finally {
      setAuthLoading(false);
    }
  };

  // Generate new wall (886.wiki/Wxxxxxxx)
  const handleGenerateWall = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!user || !user.email) {
      setAuthStep('email');
      return;
    }

    setAuthLoading(true);
    setAuthMessage(null);
    try {
      const res = await fetch('/api/walls/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: user.email, title: newWallTitle.trim() }),
      });
      const data = await res.json();
      if (res.ok && data.success && data.wall) {
        const createdWall = data.wall;
        navigateToWall(createdWall.id, createdWall.ownerKey);
        setOwnerKey(createdWall.ownerKey);
        setIsOwnerAuth(true);
        localStorage.setItem('wall_owner', createdWall.ownerKey);
        setShowAuthModal(false);
        fetchData(user.email);
        setActiveTab('editor');

        const baseLink = `${window.location.origin}/${createdWall.id}`;
        handleCopy(baseLink, 'new-wall-slug');
      } else {
        setAuthMessage({ text: data.error || 'Failed to generate wall.', isError: true });
      }
    } catch (err: any) {
      setAuthMessage({ text: 'Network error generating wall.', isError: true });
    } finally {
      setAuthLoading(false);
    }
  };

  const handleSignOut = () => {
    setUser(null);
    localStorage.removeItem('wiki_user');
    localStorage.removeItem('wall_owner');
    setIsOwnerAuth(false);
    setAuthStep('email');
    setAuthMessage({ text: 'Signed out successfully.' });
    try {
      const iframes = document.querySelectorAll('iframe');
      iframes.forEach(f => f.contentWindow?.postMessage({ type: 'WIKI_SIGNOUT' }, '*'));
    } catch (e) {}
    fetchData('');
  };

  const openCreatorModal = () => {
    if (user) {
      setAuthStep('generate');
    } else {
      setAuthStep('email');
    }
    setAuthMessage(null);
    setShowAuthModal(true);
  };

  return (
    <div className="flex flex-col h-screen w-screen bg-[#F7F5F1] text-[#111] overflow-hidden font-sans">
      {/* Top Application Navigation Bar */}
      <header className="bg-white border-b-2 border-[#111] px-4 py-2 flex flex-wrap items-center justify-between gap-3 shrink-0 shadow-sm z-50">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="w-8 h-8 rounded-full bg-[#FFE27A] border-2 border-[#111] flex items-center justify-center font-black text-sm shadow-[2px_2px_0px_#111]">
              W
            </span>
            <span className="font-black text-base tracking-tight hidden sm:inline">
              WiKi <span className="text-[#0E7C7B]">Wall</span>
            </span>
            <span className="text-xs bg-[#111] text-white px-2 py-0.5 rounded-full font-bold">
              V620.01
            </span>
          </div>

          {/* 🌍 Earth Icon Creator Login & Generate Button */}
          <button
            onClick={openCreatorModal}
            className="flex items-center gap-1.5 px-3 py-1 rounded-full border-2 border-[#111] bg-[#FFE27A] hover:bg-[#FFD54F] text-xs font-black shadow-[2px_2px_0px_#111] transition-transform active:translate-y-0.5 cursor-pointer"
            title="Click Earth icon to log in with 4-digit OTP and generate your customized wall"
          >
            <Globe className="w-3.5 h-3.5 text-[#0E7C7B]" />
            <span>{user ? `🌍 Creator (${user.email.split('@')[0]})` : '🌍 Open Editor / Login'}</span>
          </button>

          {/* Wall Selector */}
          <div className="flex items-center bg-[#F7F5F1] border-2 border-[#111] rounded-full px-2.5 py-1 text-xs font-bold gap-1.5 shadow-[1px_1px_0px_#111]">
            <Layers className="w-3.5 h-3.5 text-[#0E7C7B]" />
            <span>Wall:</span>
            <select
              value={wallsList.some(w => w.id === wallId) ? wallId : 'custom'}
              onChange={(e) => {
                const val = e.target.value;
                if (val === 'new') {
                  openCreatorModal();
                } else if (val === 'custom') {
                  const custom = prompt('Enter custom Wall ID (e.g. W0000004):', wallId);
                  if (custom && custom.trim()) navigateToWall(custom.trim().toUpperCase());
                } else {
                  const selectedWall = wallsList.find(w => w.id === val);
                  navigateToWall(val, selectedWall?.ownerKey);
                }
              }}
              className="bg-white border border-[#111] rounded px-2 py-0.5 text-xs font-mono font-bold outline-none cursor-pointer focus:ring-1 focus:ring-[#0E7C7B]"
            >
              {user ? (
                <>
                  <option value="main">🏠 886.wiki (Home)</option>
                  <optgroup label={`${maskEmail(user.email)} (My Walls)`}>
                    {wallsList.map((w) => (
                      <option key={w.id} value={w.id}>
                        /{w.id} {w.title ? `(${w.title})` : ''} ★ {w.userEmail ? `[${maskEmail(w.userEmail)}]` : ''}
                      </option>
                    ))}
                  </optgroup>
                  {wallId !== 'main' && !wallsList.some(w => w.id === wallId) && (
                    <option value={wallId}>/{wallId} {activeWallOwnerEmail ? `[${maskEmail(activeWallOwnerEmail)}]` : '(Active Wall)'}</option>
                  )}
                </>
              ) : (
                <>
                  <option value="main">🏠 886.wiki (Home)</option>
                  {wallsList.filter(w => w.id !== 'main').map((w) => (
                    <option key={w.id} value={w.id}>
                      /{w.id} {w.title ? `(${w.title})` : ''} {w.userEmail ? `• ${maskEmail(w.userEmail)}` : ''}
                    </option>
                  ))}
                  {wallId !== 'main' && !wallsList.some(w => w.id === wallId) && (
                    <option value={wallId}>/{wallId} {activeWallOwnerEmail ? `[${maskEmail(activeWallOwnerEmail)}]` : '(Active)'}</option>
                  )}
                </>
              )}

              <option value="new">✨ Generate New Wall (domain/W...)</option>
              <option value="custom">✎ Enter Custom ID...</option>
            </select>
          </div>
        </div>

        {/* View Mode Navigation Tabs */}
        <div className="flex items-center bg-[#F7F5F1] p-1 rounded-full border-2 border-[#111] gap-1">
          <button
            onClick={() => setActiveTab('editor')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-black transition-all ${
              activeTab === 'editor'
                ? 'bg-[#111] text-white shadow-sm'
                : 'text-[#111] hover:bg-white'
            }`}
          >
            <LayoutGrid className="w-3.5 h-3.5" />
            <span>Wall Editor</span>
          </button>

          <button
            onClick={() => setActiveTab('viewer')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-black transition-all ${
              activeTab === 'viewer'
                ? 'bg-[#0E7C7B] text-white shadow-sm'
                : 'text-[#111] hover:bg-white'
            }`}
          >
            <Eye className="w-3.5 h-3.5" />
            <span>Visitor Live View</span>
          </button>
        </div>

        {/* Owner Controls & Share Actions */}
        <div className="flex items-center gap-2">
          {/* Owner button: only show when user opens her own wall */}
          {isOwnerAuth && (
            <div 
              title="Owner Authenticated - Click to copy owner URL"
              className="flex items-center gap-1.5 text-xs font-black px-2.5 py-1 rounded-full border-2 border-[#111] bg-[#FFE27A] text-[#111] cursor-pointer shadow-[1px_1px_0px_#111] hover:bg-[#FFD54F] transition"
              onClick={() => handleCopy(getOwnerUrl(), 'owner')}
            >
              <ShieldCheck className="w-3.5 h-3.5 text-[#0A7A34]" />
              <span>Owner</span>
            </div>
          )}

          {/* Quick Copy Link */}
          <button
            onClick={() => handleCopy(getViewerUrl(), 'share')}
            className="flex items-center gap-1 px-2.5 py-1 rounded-full border-2 border-[#111] bg-white text-xs font-bold hover:bg-[#F7F5F1] transition cursor-pointer"
            title="Copy base domain shareable link: domain/Wxxxxxxx"
          >
            {copiedLink === 'share' ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
            <span>{copiedLink === 'share' ? 'Copied Link!' : 'Share Link'}</span>
          </button>

          {/* Direct new window button */}
          <a
            href={isOwnerAuth ? getOwnerUrl() : getViewerUrl()}
            target="_blank"
            rel="noopener noreferrer"
            className="p-1 rounded-full border-2 border-[#111] bg-white text-[#111] hover:bg-[#FFE27A] transition"
            title="Open in new window"
          >
            <ExternalLink className="w-3.5 h-3.5" />
          </a>

          {/* User Logged In -> Logout Button in the Right-Side Corner with masked email */}
          {user && (
            <div className="flex items-center gap-2 pl-2 border-l-2 border-gray-200">
              <span className="hidden lg:inline text-xs font-mono font-bold text-gray-700 max-w-[170px] truncate" title={user.email}>
                {maskEmail(user.email)}
              </span>
              <button
                onClick={handleSignOut}
                className="flex items-center gap-1.5 px-3 py-1 rounded-full border-2 border-[#111] bg-[#FF4D4D] hover:bg-[#E03B3B] text-white text-xs font-black shadow-[2px_2px_0px_#111] transition-transform active:translate-y-0.5 cursor-pointer"
                title={`Logged in as ${maskEmail(user.email)} (${user.email}) - Click to Log Out`}
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Logout</span>
              </button>
            </div>
          )}
        </div>
      </header>

      {/* Sub-Header: Active Wall Base Domain URL Banner */}
      <div className="bg-[#FFFDF9] border-b border-[#E6E2DB] px-4 py-2 flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-bold text-gray-500">Wall URL:</span>
          <span className="font-mono font-black text-[#0E7C7B] bg-[#E3F2FD] px-2.5 py-1 rounded-md border border-[#0E7C7B]">
            {baseDomainUrl}
          </span>
          <button
            onClick={() => handleCopy(baseDomainUrl, 'base-domain')}
            className="flex items-center gap-1 text-xs font-black bg-[#FFE27A] px-2.5 py-1 rounded-md border border-[#111] hover:bg-[#FFD54F] cursor-pointer shadow-[1px_1px_0px_#111]"
            title="Copy direct base domain URL (e.g. domain/W0000004)"
          >
            {copiedLink === 'base-domain' ? <Check className="w-3 h-3 text-emerald-700" /> : <Copy className="w-3 h-3" />}
            <span>{copiedLink === 'base-domain' ? 'URL Copied!' : 'Copy Wall URL'}</span>
          </button>

          {/* Wall Owner Email displayed like l*******@gmail.com */}
          {activeWallOwnerEmail ? (
            <div className="flex items-center gap-1.5 ml-1 px-2.5 py-1 bg-white border border-[#111] rounded-md shadow-[1px_1px_0px_#111]" title={`Wall Owner: ${maskEmail(activeWallOwnerEmail)}`}>
              <span className="text-[11px] font-bold text-gray-500">Owner:</span>
              <span className="font-mono font-black text-[#0E7C7B]">
                {maskEmail(activeWallOwnerEmail)}
              </span>
            </div>
          ) : null}
        </div>

        <div className="flex items-center gap-3 text-[11px] font-medium text-gray-600">
          {activeWallOwnerEmail ? (
            <span className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded bg-gray-100 border border-gray-300 font-mono text-xs">
              <span className="text-[10px] text-gray-500 font-sans font-bold uppercase">Owner:</span>
              <strong className="text-[#0E7C7B]" title={activeWallOwnerEmail}>{maskEmail(activeWallOwnerEmail)}</strong>
            </span>
          ) : null}
          <span className="hidden md:inline">Preview live at <code>/{wallId}</code></span>
          {copiedLink === 'new-wall-slug' && (
            <span className="text-emerald-700 font-bold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-300">
              🎉 New wall generated!
            </span>
          )}
        </div>
      </div>

      {/* Main Content Area */}
      <main className="flex-1 w-full h-full relative overflow-hidden bg-[#F7F5F1]">
        {activeTab === 'editor' && (
          <iframe
            key={`editor-${wallId}-${ownerKey}`}
            src={`/wall-editor.html?wall=${encodeURIComponent(wallId)}${isOwnerAuth ? `&owner=${encodeURIComponent(ownerKey)}` : ''}${activeWallOwnerEmail ? `&ownerEmail=${encodeURIComponent(activeWallOwnerEmail)}` : ''}`}
            className="w-full h-full border-0"
            title="WiKi Wall Editor V620.01"
          />
        )}

        {activeTab === 'viewer' && (
          <div className="w-full h-full flex flex-col relative">
            <div className="bg-[#D9F0EE] border-b border-[#0E7C7B] px-4 py-1.5 flex items-center justify-between text-xs font-bold text-[#0E7C7B]">
              <div className="flex items-center gap-2">
                <span>👁️ Visitor Mode Preview</span>
                <span className="opacity-70">| Path: {wallId === 'main' ? '/' : `/${wallId}`}</span>
                {activeWallOwnerEmail ? (
                  <span className="ml-2 px-2.5 py-0.5 bg-white border border-[#0E7C7B] rounded font-mono text-[11px] text-[#111] shadow-[1px_1px_0px_#0E7C7B]">
                    Wall Owner: <strong className="text-[#0E7C7B]">{maskEmail(activeWallOwnerEmail)}</strong>
                  </span>
                ) : null}
              </div>
              <button 
                onClick={() => setActiveTab('editor')}
                className="underline hover:text-[#111] cursor-pointer"
              >
                Switch to Editor
              </button>
            </div>
            <iframe
              key={`viewer-${wallId}`}
              src={`/wall-editor.html?wall=${encodeURIComponent(wallId)}${activeWallOwnerEmail ? `&ownerEmail=${encodeURIComponent(activeWallOwnerEmail)}` : ''}`}
              className="w-full flex-1 border-0"
              title="WiKi Wall Live Visitor View"
            />
          </div>
        )}
      </main>

      {/* 🌍 CREATOR AUTH & 4-DIGIT OTP MODAL */}
      {showAuthModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
          <div className="bg-white border-2 border-[#111] rounded-2xl shadow-[6px_6px_0px_#111] w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-5 py-3.5 border-b-2 border-[#111] bg-[#FAF8F5]">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-full bg-[#FFE27A] border-1.5 border-[#111] flex items-center justify-center text-sm font-bold shadow-[1px_1px_0px_#111]">
                  🌍
                </div>
                <h3 className="font-black text-sm tracking-tight">
                  WiKi <span className="text-[#0E7C7B]">Wall</span> Creator Verification
                </h3>
              </div>
              <button 
                onClick={() => setShowAuthModal(false)}
                className="p-1 rounded hover:bg-gray-200 transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5">
              {authMessage && (
                <div className={`mb-4 px-3 py-2 rounded-lg text-xs font-bold border ${
                  authMessage.isError 
                    ? 'bg-rose-50 border-rose-300 text-rose-800' 
                    : 'bg-emerald-50 border-emerald-300 text-emerald-800'
                }`}>
                  {authMessage.text}
                </div>
              )}

              {/* STEP 1: ENTER EMAIL */}
              {authStep === 'email' && (
                <form onSubmit={handleSendOtp} className="space-y-4">
                  <div>
                    <h4 className="font-black text-base text-[#111] mb-1">
                      Enter Email to Access Editor
                    </h4>
                    <p className="text-xs text-gray-600 leading-relaxed">
                      Enter your email address to receive a <strong>4-digit verification code</strong>. Once verified, you can generate your own custom wall with the official <code>886.wiki/W0000001</code> slug format.
                    </p>
                  </div>

                  <div>
                    <label className="block text-xs font-black mb-1.5 text-gray-700">
                      Email Address:
                    </label>
                    <div className="relative">
                      <Mail className="w-4 h-4 absolute left-3 top-3 text-gray-400" />
                      <input 
                        type="email"
                        value={emailInput}
                        onChange={(e) => setEmailInput(e.target.value)}
                        placeholder="visitor@example.com"
                        className="w-full pl-9 pr-3 py-2 border-2 border-[#111] rounded-xl text-sm font-bold outline-none focus:border-[#0E7C7B] bg-[#FAF8F5]"
                        required
                        autoFocus
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={authLoading}
                    className="w-full py-2.5 px-4 bg-[#FFE27A] hover:bg-[#FFD54F] border-2 border-[#111] rounded-xl text-xs font-black shadow-[2px_2px_0px_#111] active:translate-y-0.5 transition cursor-pointer disabled:opacity-50"
                  >
                    {authLoading ? '⏳ Sending Code...' : '📧 Send 4-Digit Verification Code'}
                  </button>
                </form>
              )}

              {/* STEP 2: ENTER 4-DIGIT OTP */}
              {authStep === 'otp' && (
                <form onSubmit={handleVerifyOtp} className="space-y-4">
                  <div>
                    <h4 className="font-black text-base text-[#111] mb-1">
                      Enter 4-Digit Verification Code
                    </h4>
                    <p className="text-xs text-gray-600 leading-relaxed">
                      We sent a 4-digit code to <strong>{emailInput}</strong>. Please check your email inbox.
                    </p>
                  </div>

                  <div>
                    <label className="block text-xs font-black mb-1.5 text-gray-700 text-center">
                      Enter 4-Digit Code:
                    </label>
                    <input 
                      type="text"
                      maxLength={4}
                      pattern="[0-9]*"
                      inputMode="numeric"
                      value={otpInput}
                      onChange={(e) => {
                        const val = e.target.value.replace(/\D/g, '').slice(0, 4);
                        setOtpInput(val);
                      }}
                      placeholder="••••"
                      className="w-full py-2.5 px-4 border-2 border-[#111] rounded-xl text-2xl font-mono font-black text-center tracking-[12px] outline-none focus:border-[#0E7C7B] bg-[#FAF8F5]"
                      autoFocus
                      required
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={authLoading || otpInput.length !== 4}
                    className="w-full py-2.5 px-4 bg-[#0E7C7B] hover:bg-[#0B6362] text-white border-2 border-[#111] rounded-xl text-xs font-black shadow-[2px_2px_0px_#111] active:translate-y-0.5 transition cursor-pointer disabled:opacity-50"
                  >
                    {authLoading ? '⏳ Verifying...' : '✓ Verify 4-Digit Code & Log In'}
                  </button>

                  <div className="text-center">
                    <button
                      type="button"
                      onClick={() => setAuthStep('email')}
                      className="text-xs font-bold text-gray-500 hover:text-black underline cursor-pointer"
                    >
                      ← Back to enter different email
                    </button>
                  </div>
                </form>
              )}

              {/* STEP 3: LOGGED IN / GENERATE WALL */}
              {authStep === 'generate' && (
                <div className="space-y-4">
                  <div className="bg-[#FFF9C4] border-2 border-[#111] rounded-xl p-3 flex items-center justify-between">
                    <div>
                      <span className="text-[10px] font-bold text-gray-600 block">Logged in as:</span>
                      <span className="text-xs font-mono font-black text-[#111]" title={user?.email}>{maskEmail(user?.email)}</span>
                    </div>
                    <button
                      type="button"
                      onClick={handleSignOut}
                      className="flex items-center gap-1 text-[11px] font-bold text-gray-700 bg-white border border-[#111] px-2 py-1 rounded-lg hover:bg-gray-100 cursor-pointer"
                    >
                      <LogOut className="w-3 h-3" />
                      <span>Sign Out</span>
                    </button>
                  </div>

                  <div>
                    <h4 className="font-black text-base text-[#111] mb-1">
                      ✨ Generate New WiKi Wall
                    </h4>
                    <p className="text-xs text-gray-600 leading-relaxed">
                      Generate a new collaborative wall stored persistently in the <strong>MySQL DB</strong>. Your direct wall URL will be:
                    </p>
                    <div className="mt-2 font-mono font-black text-xs bg-gray-100 p-2.5 rounded-lg border border-gray-300 text-[#0E7C7B]">
                      {typeof window !== 'undefined' ? `${window.location.host}/W0000004` : 'domain/W0000004'}
                    </div>
                  </div>

                  <form onSubmit={handleGenerateWall} className="space-y-3">
                    <div>
                      <label className="block text-xs font-black mb-1 text-gray-700">
                        Wall Title (Optional):
                      </label>
                      <input 
                        type="text"
                        value={newWallTitle}
                        onChange={(e) => setNewWallTitle(e.target.value)}
                        placeholder="e.g. My Collaborative WiKi Wall"
                        className="w-full px-3 py-2 border-2 border-[#111] rounded-xl text-xs font-bold outline-none focus:border-[#0E7C7B] bg-[#FAF8F5]"
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={authLoading}
                      className="w-full py-2.5 px-4 bg-[#FFE27A] hover:bg-[#FFD54F] border-2 border-[#111] rounded-xl text-xs font-black shadow-[2px_2px_0px_#111] active:translate-y-0.5 transition cursor-pointer disabled:opacity-50"
                    >
                      {authLoading ? '⏳ Generating in MySQL DB...' : '🚀 Generate New Wall (domain/W...)'}
                    </button>
                  </form>

                  <div className="border-t border-dashed border-gray-300 pt-3 flex gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setShowAuthModal(false);
                        setActiveTab('editor');
                      }}
                      className="flex-1 py-1.5 px-3 bg-[#E3F2FD] border border-[#111] rounded-lg text-xs font-bold hover:bg-[#BBDEFB] cursor-pointer"
                    >
                      ✏️ Open Current Wall Editor
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowAuthModal(false)}
                      className="py-1.5 px-3 border border-gray-300 rounded-lg text-xs font-bold hover:bg-gray-100 cursor-pointer"
                    >
                      Close
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
