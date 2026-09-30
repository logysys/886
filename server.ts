import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import http from 'http';
import { dbManager } from './src/db/mysql.ts';
import { emailService } from './src/services/emailService.ts';

const portArgIndex = process.argv.indexOf('--port');
const cliPort = portArgIndex !== -1 && process.argv[portArgIndex + 1] ? process.argv[portArgIndex + 1] : null;
const PORT = parseInt(cliPort || process.env.PORT || '3009', 10);
const DATA_DIR = path.resolve(process.cwd(), 'data');
const DEFAULT_OWNER_KEY = process.env.OWNER || 'wiki-owner-secret-key-v618';

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Interfaces
export interface CoWikiCard {
  cid: string;
  raw: string;
  anchor: string;
  zone: 'a' | 'b' | 'c';
  at: number;
  ip: string;
  ok: boolean;
  authorHash?: string;
}

export interface WallData {
  id: string;
  slug?: string;
  title: string;
  v: number;
  cols: number;
  car: boolean;
  zones: { a: boolean; b: boolean; c: boolean };
  zorder: string[];
  lang: string;
  fx: { fw: boolean; fly: boolean; snd: boolean };
  ownerCards: any[];
  cards: CoWikiCard[];
  ownerKey?: string;
  userEmail?: string;
}

interface WallRuntime {
  id: string;
  slug?: string;
  title: string;
  v: number;
  cols: number;
  car: boolean;
  zones: { a: boolean; b: boolean; c: boolean };
  zorder: string[];
  lang: string;
  fx: { fw: boolean; fly: boolean; snd: boolean };
  ownerCards: any[];
  cards: Map<string, CoWikiCard>;
  nextCidNum: number;
  dirty: boolean;
  commitTimer: NodeJS.Timeout | null;
  queue: Promise<any>;
  ownerKey?: string;
  userEmail?: string;
}

// In-memory wall store & SSE streams
const walls = new Map<string, WallRuntime>();
const wallStreams = new Map<string, Set<Response>>();

// Rate limiting tracking
const ipCardCount = new Map<string, { count: number; resetAt: number }>();

function hashIp(ip: string): string {
  return crypto.createHash('sha256').update(ip + '-salt-v618').digest('hex').slice(0, 10);
}

function hashMe(me: string): string {
  return crypto.createHash('sha256').update(me + '-me-salt').digest('hex');
}

function isOwner(req: Request, wallOwnerKey?: string): boolean {
  const headerKey = ((req.headers['x-wall-owner'] as string) || '').trim();
  const queryKey = ((req.query.owner as string) || '').trim();
  const authHeader = ((req.headers['authorization'] as string) || '').trim();
  const bearerKey = authHeader.toLowerCase().startsWith('bearer ') ? authHeader.slice(7).trim() : '';
  const candidate = (headerKey || queryKey || bearerKey).trim();
  if (!candidate) return false;

  // Check against specific wall owner key or default master owner key
  const validKeys = [DEFAULT_OWNER_KEY.trim()];
  if (wallOwnerKey) validKeys.push(wallOwnerKey.trim());

  for (const target of validKeys) {
    if (candidate.length === target.length) {
      if (crypto.timingSafeEqual(Buffer.from(candidate), Buffer.from(target))) {
        return true;
      }
    }
  }
  return false;
}

// Async owner verification using database user records
async function verifyIsOwner(req: Request, wall: WallRuntime): Promise<boolean> {
  // 1) Fast synchronous check
  if (isOwner(req, wall.ownerKey)) return true;

  const headerKey = ((req.headers['x-wall-owner'] as string) || '').trim();
  const queryKey = ((req.query.owner as string) || '').trim();
  const authHeader = ((req.headers['authorization'] as string) || '').trim();
  const bearerKey = authHeader.toLowerCase().startsWith('bearer ') ? authHeader.slice(7).trim() : '';
  const candidate = (headerKey || queryKey || bearerKey).trim();

  // 2) Check if candidate token matches the user in MySQL who owns this wall
  if (candidate) {
    const user = await dbManager.findUserByOwnerKey(candidate);
    if (user && wall.userEmail && user.email.toLowerCase() === wall.userEmail.toLowerCase()) {
      return true;
    }
  }

  // 3) Check if user email header matches the wall's userEmail
  const reqEmail = ((req.headers['x-wall-user-email'] as string) || (req.query.email as string) || '').trim().toLowerCase();
  if (reqEmail && wall.userEmail && reqEmail === wall.userEmail.toLowerCase()) {
    const user = await dbManager.findUserByEmail(reqEmail);
    if (user && (!candidate || candidate === user.owner_key || candidate === wall.ownerKey)) {
      return true;
    }
  }

  return false;
}

function getWallFilePath(id: string): string {
  const safeId = id.replace(/[^a-zA-Z0-9_-]/g, '_');
  return path.join(DATA_DIR, `wall-${safeId}.json`);
}

function getInitialOwnerCards(wallId: string, customTitle?: string): any[] {
  return [
    {
      _raw: "https://www.youtube.com/watch?v=kJQP7kiw5Fk",
      type: "youtube",
      id: "kJQP7kiw5Fk",
      url: "https://www.youtube.com/watch?v=kJQP7kiw5Fk",
      title: "Luis Fonsi - Despacito ft. Daddy Yankee",
      w: 340,
      h: 220,
      zone: "a"
    },
    {
      _raw: `<md>\n# Welcome to ${customTitle || wallId}!\n\nThis collaborative wall is saved to **MySQL DB** & **V2 Sync Server**.\n- 🐝 **Interactive EzBar**: columns, random layout, carousel mode.\n- 🌍 **Verified Creator**: Generated with customized slug.\n- 🛡️ **Co-WiKi Cards**: Visitors can insert cards using \`＋\` on any card.\n- 🔒 **Owner Moderation**: Approvals turn cards permanent.\n</md>`,
      type: "md",
      title: customTitle || `Welcome to ${wallId}`,
      w: 420,
      h: 380,
      zone: "b"
    },
    {
      _raw: "https://en.wikipedia.org/wiki/Wiki",
      type: "web",
      url: "https://en.wikipedia.org/wiki/Wiki",
      title: "Wiki - Wikipedia",
      w: 340,
      h: 255,
      zone: "b"
    },
    {
      _raw: "https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT",
      type: "web",
      url: "https://open.spotify.com/embed/track/4cOdK2wGLETKBW3PvgPWqT",
      title: "Never Gonna Give You Up - Rick Astley",
      w: 340,
      h: 232,
      zone: "c"
    }
  ];
}

// Load wall from DB or disk or initialize
async function getOrLoadWallAsync(idOrSlug: string): Promise<WallRuntime> {
  const cleanId = idOrSlug.trim();
  const extractIdMatch = cleanId.match(/(W\d+)/i);
  const id = extractIdMatch ? extractIdMatch[1].toUpperCase() : cleanId;

  let runtime = walls.get(id);
  if (runtime) {
    if (!runtime.userEmail) {
      try {
        const dbWall = await dbManager.getWall(idOrSlug);
        if (dbWall?.user_email) runtime.userEmail = dbWall.user_email;
      } catch (e) {}
    }
    return runtime;
  }

  // Check MySQL DB first
  const dbWall = await dbManager.getWall(idOrSlug);
  let parsedDbData: Partial<WallData> | null = null;
  if (dbWall && dbWall.data) {
    try {
      parsedDbData = JSON.parse(dbWall.data);
    } catch (e) {
      console.error('Failed to parse db wall data:', e);
    }
  }

  const filePath = getWallFilePath(id);
  let diskData: Partial<WallData> | null = null;

  if (!parsedDbData && fs.existsSync(filePath)) {
    try {
      const raw = fs.readFileSync(filePath, 'utf-8');
      diskData = JSON.parse(raw);
    } catch (err) {
      console.error(`Error reading ${filePath}:`, err);
    }
  }

  const activeData = parsedDbData || diskData;
  const initialOwnerCards = activeData?.ownerCards || getInitialOwnerCards(id, dbWall?.title);
  const cardMap = new Map<string, CoWikiCard>();
  let maxCidNum = 0;

  if (activeData?.cards && Array.isArray(activeData.cards)) {
    for (const c of activeData.cards) {
      if (c && c.cid) {
        cardMap.set(c.cid, c);
        const match = c.cid.match(/^C(\d+)$/i);
        if (match) {
          const num = parseInt(match[1], 10);
          if (num > maxCidNum) maxCidNum = num;
        }
      }
    }
  }

  runtime = {
    id,
    slug: dbWall?.slug || activeData?.slug || `886.wiki/${id}`,
    title: dbWall?.title || activeData?.title || id,
    v: activeData?.v || 1,
    cols: activeData?.cols !== undefined ? activeData.cols : 0,
    car: !!activeData?.car,
    zones: activeData?.zones || { a: true, b: true, c: true },
    zorder: activeData?.zorder || ['c', 'a', 'b'],
    lang: activeData?.lang || 'en',
    fx: activeData?.fx || { fw: false, fly: false, snd: true },
    ownerCards: initialOwnerCards,
    cards: cardMap,
    nextCidNum: maxCidNum + 1,
    dirty: false,
    commitTimer: null,
    queue: Promise.resolve(),
    ownerKey: dbWall?.owner_key || activeData?.ownerKey || DEFAULT_OWNER_KEY,
    userEmail: dbWall?.user_email || activeData?.userEmail,
  };

  walls.set(id, runtime);

  // If newly created and didn't exist in DB, ensure saved to DB & disk
  if (!dbWall) {
    scheduleSave(runtime);
  }

  return runtime;
}

// Synchronous wrapper for existing handlers
function getOrLoadWall(id: string): WallRuntime {
  let runtime = walls.get(id);
  if (runtime) return runtime;

  const filePath = getWallFilePath(id);
  let diskData: Partial<WallData> | null = null;
  if (fs.existsSync(filePath)) {
    try {
      diskData = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    } catch (e) {}
  }

  const initialOwnerCards = diskData?.ownerCards || getInitialOwnerCards(id);
  const cardMap = new Map<string, CoWikiCard>();
  let maxCidNum = 0;

  if (diskData?.cards && Array.isArray(diskData.cards)) {
    for (const c of diskData.cards) {
      if (c && c.cid) {
        cardMap.set(c.cid, c);
        const match = c.cid.match(/^C(\d+)$/i);
        if (match) {
          const num = parseInt(match[1], 10);
          if (num > maxCidNum) maxCidNum = num;
        }
      }
    }
  }

  runtime = {
    id,
    slug: diskData?.slug || `886.wiki/${id}`,
    title: diskData?.title || id,
    v: diskData?.v || 1,
    cols: diskData?.cols !== undefined ? diskData.cols : 0,
    car: !!diskData?.car,
    zones: diskData?.zones || { a: true, b: true, c: true },
    zorder: diskData?.zorder || ['c', 'a', 'b'],
    lang: diskData?.lang || 'en',
    fx: diskData?.fx || { fw: false, fly: false, snd: true },
    ownerCards: initialOwnerCards,
    cards: cardMap,
    nextCidNum: maxCidNum + 1,
    dirty: false,
    commitTimer: null,
    queue: Promise.resolve(),
    ownerKey: diskData?.ownerKey || DEFAULT_OWNER_KEY,
    userEmail: diskData?.userEmail,
  };

  walls.set(id, runtime);

  // Also asynchronously try to sync with DB
  dbManager.getWall(id).then(dbWall => {
    if (dbWall && dbWall.data) {
      try {
        const parsed = JSON.parse(dbWall.data);
        if (runtime) {
          runtime.title = dbWall.title || runtime.title;
          runtime.slug = dbWall.slug || runtime.slug;
          runtime.ownerKey = dbWall.owner_key || runtime.ownerKey;
          runtime.userEmail = dbWall.user_email || runtime.userEmail;
          if (Array.isArray(parsed.ownerCards) && parsed.ownerCards.length) {
            runtime.ownerCards = parsed.ownerCards;
          }
        }
      } catch (err) {}
    }
  });

  return runtime;
}

// Group commit to disk and MySQL DB
function scheduleSave(wall: WallRuntime): Promise<void> {
  wall.dirty = true;
  return new Promise((resolve) => {
    if (wall.commitTimer) {
      resolve();
      return;
    }
    wall.commitTimer = setTimeout(async () => {
      wall.commitTimer = null;
      if (!wall.dirty) {
        resolve();
        return;
      }
      try {
        await writeWallToDiskAndDb(wall);
        wall.dirty = false;
      } catch (err) {
        console.error(`Failed to write wall ${wall.id}:`, err);
      }
      resolve();
    }, 45);
  });
}

async function writeWallToDiskAndDb(wall: WallRuntime): Promise<void> {
  const filePath = getWallFilePath(wall.id);
  const tmpPath = `${filePath}.${Date.now()}.${Math.random().toString(36).slice(2, 6)}.tmp`;

  const payload: WallData = {
    id: wall.id,
    slug: wall.slug || `886.wiki/${wall.id}`,
    title: wall.title,
    v: wall.v,
    cols: wall.cols,
    car: wall.car,
    zones: wall.zones,
    zorder: wall.zorder,
    lang: wall.lang,
    fx: wall.fx,
    ownerCards: wall.ownerCards,
    cards: Array.from(wall.cards.values()),
    ownerKey: wall.ownerKey,
    userEmail: wall.userEmail,
  };

  const json = JSON.stringify(payload, null, 2);
  await fs.promises.writeFile(tmpPath, json, 'utf-8');
  await fs.promises.rename(tmpPath, filePath);

  // Sync to MySQL DB
  await dbManager.updateWall(wall.id, payload);
}

// Sequential queue helper per wall
function enqueueWallTask<T>(wall: WallRuntime, task: () => Promise<T>): Promise<T> {
  const next = wall.queue.then(task, task);
  wall.queue = next.catch(() => {});
  return next;
}

// Broadcast SSE event
function broadcastEvent(wallId: string, eventName: string, data: any) {
  const clients = wallStreams.get(wallId);
  if (!clients || clients.size === 0) return;
  const payload = `event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const client of clients) {
    try {
      client.write(payload);
    } catch (e) {
      clients.delete(client);
    }
  }
}

// Create Express app
const app = express();
app.use(express.static(path.resolve(process.cwd(), 'public')));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// CORS headers for API calls
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, x-wall-me, x-wall-owner, authorization');
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
    return;
  }
  next();
});

// ==========================================
// 1) AUTH & 4-DIGIT OTP ENDPOINTS (MySQL DB)
// ==========================================

// Send 4-digit OTP to Visitor Email
app.post('/api/auth/send-otp', async (req: Request, res: Response) => {
  try {
    const { email } = req.body;
    if (!email || typeof email !== 'string') {
      res.status(400).json({ success: false, error: 'Email address is required.' });
      return;
    }

    const cleanEmail = email.trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(cleanEmail)) {
      res.status(400).json({ success: false, error: 'Please enter a valid email address.' });
      return;
    }

    // Generate 4-digit numeric code
    const otp = emailService.generateOtp();
    const expiresAt = Date.now() + 10 * 60 * 1000; // 10 minutes

    // Save OTP to MySQL DB
    await dbManager.createOtp(cleanEmail, otp, expiresAt);

    // Send Email
    await emailService.sendOtpEmail(cleanEmail, otp);

    res.json({
      success: true,
      message: `4-digit verification code sent to ${cleanEmail}. Please check your inbox.`,
    });
  } catch (err: any) {
    console.error('Error in /api/auth/send-otp:', err);
    res.status(500).json({ success: false, error: err.message || 'Failed to send verification code.' });
  }
});

// Verify 4-digit OTP & Login
app.post('/api/auth/verify-otp', async (req: Request, res: Response) => {
  try {
    const { email, otp } = req.body;
    if (!email || !otp) {
      res.status(400).json({ success: false, error: 'Email and 4-digit OTP are required.' });
      return;
    }

    const cleanEmail = email.trim().toLowerCase();
    const cleanOtp = String(otp).trim();

    if (!/^\d{4}$/.test(cleanOtp)) {
      res.status(400).json({ success: false, error: 'OTP must be exactly 4 numeric digits.' });
      return;
    }

    // Check DB for OTP
    const verification = await dbManager.verifyOtp(cleanEmail, cleanOtp);
    if (!verification.valid) {
      res.status(400).json({ success: false, error: verification.reason || 'Invalid or expired OTP.' });
      return;
    }

    // Register or get user from MySQL DB
    const user = await dbManager.getOrCreateUser(cleanEmail);

    // Return user with their ownerKey and auth token
    res.json({
      success: true,
      message: 'Email verified successfully!',
      email: cleanEmail,
      user,
      ownerKey: user.owner_key,
      token: user.owner_key,
    });
  } catch (err: any) {
    console.error('Error in /api/auth/verify-otp:', err);
    res.status(500).json({ success: false, error: err.message || 'Verification failed.' });
  }
});

// ==========================================
// 2) GENERATE NEW WALL (MySQL DB with 886.wiki/Wxxxxxxx Slug)
// ==========================================

app.post('/api/walls/generate', async (req: Request, res: Response) => {
  try {
    const { email, title } = req.body;
    if (!email || typeof email !== 'string') {
      res.status(400).json({ success: false, error: 'Visitor email is required to generate a new wall.' });
      return;
    }

    const cleanEmail = email.trim().toLowerCase();

    // Ensure user exists and get their owner key
    const user = await dbManager.getOrCreateUser(cleanEmail);
    const ownerKey = user.owner_key || `wiki-owner-${crypto.randomBytes(8).toString('hex')}`;

    // Get next sequential wall number from MySQL DB
    const nextNum = await dbManager.getNextWallNumber();
    const { id: wallId, slug: wallSlug } = dbManager.formatWallSlug(nextNum);

    const wallTitle = (title && typeof title === 'string' && title.trim())
      ? title.trim().slice(0, 100)
      : `WiKi Wall ${wallId}`;

    const initialCards = getInitialOwnerCards(wallId, wallTitle);

    const wallPayload = {
      id: wallId,
      slug: wallSlug,
      title: wallTitle,
      v: 1,
      cols: 4,
      car: false,
      zones: { a: true, b: true, c: true },
      zorder: ['c', 'a', 'b'],
      lang: 'en',
      fx: { fw: false, fly: false, snd: true },
      ownerCards: initialCards,
      cards: [],
      ownerKey,
      userEmail: cleanEmail,
    };

    // Save to MySQL DB
    const createdDbWall = await dbManager.createWall({
      id: wallId,
      slug: wallSlug,
      userEmail: cleanEmail,
      title: wallTitle,
      wallNum: nextNum,
      data: wallPayload,
      ownerKey,
    });

    // Also instantiate in memory runtime
    const runtime: WallRuntime = {
      id: wallId,
      slug: wallSlug,
      title: wallTitle,
      v: 1,
      cols: 4,
      car: false,
      zones: { a: true, b: true, c: true },
      zorder: ['c', 'a', 'b'],
      lang: 'en',
      fx: { fw: false, fly: false, snd: true },
      ownerCards: initialCards,
      cards: new Map(),
      nextCidNum: 1,
      dirty: false,
      commitTimer: null,
      queue: Promise.resolve(),
      ownerKey,
      userEmail: cleanEmail,
    };
    walls.set(wallId, runtime);

    // Save file on disk too for redundancy
    await writeWallToDiskAndDb(runtime);

    console.log(`[Wall Generated] Created wall: ${wallId} with slug: ${wallSlug} for ${cleanEmail}`);

    res.json({
      success: true,
      message: `New wall created successfully!`,
      wall: {
        id: wallId,
        slug: wallSlug,
        title: wallTitle,
        ownerKey,
        userEmail: cleanEmail,
      },
    });
  } catch (err: any) {
    console.error('Error generating wall:', err);
    res.status(500).json({ success: false, error: err.message || 'Failed to generate wall.' });
  }
});

// Database Telemetry Status
app.get('/api/db/status', (req: Request, res: Response) => {
  res.json(dbManager.getStats());
});

// Force sync local JSON database walls into MySQL database
app.all('/api/db/sync', async (req: Request, res: Response) => {
  try {
    const result = await dbManager.syncLocalDbToMySql();
    res.json({
      success: true,
      message: 'Database sync completed successfully',
      stats: dbManager.getStats(),
      synced: result,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Direct route for 886.wiki slugs (e.g. /886.wiki/W0000001, /886.WIKI/W0000001) -> redirects to base domain /W0000001
app.get(/^\/886\.(?:wiki|WIKI)\/(W\d+)/i, async (req: Request, res: Response) => {
  const wallId = req.params[0].toUpperCase();
  res.redirect(`/${encodeURIComponent(wallId)}`);
});

// Direct route for base domain walls (e.g. /W0000004, /W0000001)
app.get(/^\/(W\d+)$/i, (req: Request, res: Response, next: NextFunction) => {
  const distIndex = path.resolve(process.cwd(), 'dist', 'index.html');
  if (fs.existsSync(distIndex)) {
    res.sendFile(distIndex);
  } else {
    next();
  }
});

// Health check
app.get('/api/healthz', (req: Request, res: Response) => {
  let totalStreams = 0;
  for (const set of wallStreams.values()) {
    totalStreams += set.size;
  }
  res.json({
    status: 'ok',
    version: 'V620.01-V2-Sync',
    uptime: Math.round(process.uptime()),
    wallsCount: walls.size,
    streamsCount: totalStreams,
    db: dbManager.getStats(),
  });
});

// Metrics
app.get('/api/metrics', (req: Request, res: Response) => {
  let totalStreams = 0;
  let totalCards = 0;
  for (const set of wallStreams.values()) totalStreams += set.size;
  for (const w of walls.values()) totalCards += w.cards.size;

  res.json({
    activeWalls: walls.size,
    liveStreams: totalStreams,
    totalVisitorCards: totalCards,
    memoryUsage: process.memoryUsage(),
    uptime: process.uptime(),
    db: dbManager.getStats(),
  });
});

// Server Info / Owner verification
app.get('/api/owner-status', (req: Request, res: Response) => {
  const wallId = (req.query.wall as string || '').trim();
  const runtime = wallId ? walls.get(wallId) : undefined;
  const verified = isOwner(req, runtime?.ownerKey);
  res.json({
    verified,
    defaultKeyConfigured: !!DEFAULT_OWNER_KEY,
    ownerKeySample: DEFAULT_OWNER_KEY,
  });
});

// List walls from MySQL DB (filtered by user if user is logged in)
app.get('/api/walls', async (req: Request, res: Response) => {
  try {
    const dbWalls = await dbManager.listWalls();
    const reqEmail = ((req.query.email as string) || (req.headers['x-wall-user-email'] as string) || '').trim().toLowerCase();
    const ownerToken = ((req.headers['x-wall-owner'] as string) || (req.query.owner as string) || '').trim();

    let filteredWalls = dbWalls;
    if (reqEmail) {
      filteredWalls = dbWalls.filter(w => w.user_email.toLowerCase() === reqEmail);
    } else if (ownerToken) {
      const user = await dbManager.findUserByOwnerKey(ownerToken);
      if (user) {
        filteredWalls = dbWalls.filter(w => w.user_email.toLowerCase() === user.email.toLowerCase());
      }
    }

    const result: any[] = [];
    for (const dw of filteredWalls) {
      const runtime = walls.get(dw.id);
      const streamSet = wallStreams.get(dw.id);
      result.push({
        id: dw.id,
        slug: dw.slug,
        title: dw.title,
        userEmail: dw.user_email,
        ownerKey: dw.owner_key,
        createdAt: dw.created_at,
        ownerCardCount: runtime ? runtime.ownerCards.length : 0,
        guestCardCount: runtime ? runtime.cards.size : 0,
        pendingCount: runtime ? Array.from(runtime.cards.values()).filter((c) => !c.ok).length : 0,
        watchers: streamSet ? streamSet.size : 0,
      });
    }

    res.json({ ok: true, walls: result, totalWalls: dbWalls.length });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Get wall data
app.get(['/api/wall', '/api/wall/', '/api/wall/:id', '/api/walls/:id'], async (req: Request, res: Response) => {
  const idOrSlug = req.params.id || 'main';
  const wall = await getOrLoadWallAsync(idOrSlug);
  const authenticatedAsOwner = await verifyIsOwner(req, wall);

  res.json({
    id: wall.id,
    slug: wall.slug,
    title: wall.title,
    v: wall.v,
    cols: wall.cols,
    car: wall.car,
    zones: wall.zones,
    zorder: wall.zorder,
    lang: wall.lang,
    fx: wall.fx,
    ownerCards: wall.ownerCards,
    cards: Array.from(wall.cards.values()),
    userEmail: wall.userEmail,
    isOwner: authenticatedAsOwner,
    ownerKey: authenticatedAsOwner ? wall.ownerKey : undefined,
  });
});

// Review visitor cards (Owner only)
app.get(['/api/wall/:id/review', '/api/walls/:id/review'], async (req: Request, res: Response) => {
  const id = req.params.id;
  const wall = await getOrLoadWallAsync(id);
  const authenticatedAsOwner = await verifyIsOwner(req, wall);

  if (!authenticatedAsOwner) {
    res.status(401).json({ ok: false, error: 'Unauthorized. Owner key required.' });
    return;
  }

  const cardsList = Array.from(wall.cards.values()).map(c => ({
    cid: c.cid,
    raw: c.raw,
    zone: c.zone,
    anchor: c.anchor,
    ok: !!c.ok,
    at: c.at,
    fingerprint: (c.authorHash || c.ip || '').slice(0, 8) || 'visitor'
  }));

  res.json({
    ok: true,
    wallId: wall.id,
    ownerKey: wall.ownerKey,
    cards: cardsList
  });
});

// Update / Save wall configuration & owner cards (Owner only or creation)
app.put(['/api/wall/:id', '/api/walls/:id'], async (req: Request, res: Response) => {
  const id = req.params.id;
  const wall = await getOrLoadWallAsync(id);
  const authenticatedAsOwner = await verifyIsOwner(req, wall);

  if (!authenticatedAsOwner) {
    res.status(401).json({ ok: false, error: 'Unauthorized. Owner key required.' });
    return;
  }

  const body = req.body || {};

  await enqueueWallTask(wall, async () => {
    wall.v += 1;
    if (typeof body.title === 'string') wall.title = body.title.slice(0, 200);
    if (body.cols !== undefined) wall.cols = body.cols;
    if (body.car !== undefined) wall.car = !!body.car;
    if (body.zones) wall.zones = body.zones;
    if (body.zorder && Array.isArray(body.zorder)) wall.zorder = body.zorder;
    if (body.lang) wall.lang = body.lang;
    if (body.fx) wall.fx = body.fx;
    if (Array.isArray(body.ownerCards)) wall.ownerCards = body.ownerCards;
    if (Array.isArray(body.list)) wall.ownerCards = body.list;

    await scheduleSave(wall);
    broadcastEvent(wall.id, 'sync', {
      v: wall.v,
      title: wall.title,
      cols: wall.cols,
      car: wall.car,
      zones: wall.zones,
      zorder: wall.zorder,
    });
  });

  res.json({ ok: true, v: wall.v, message: 'Saved to MySQL database' });
});

// Post a new visitor card (Co-WiKi)
app.post(['/api/wall/:id/cards', '/api/walls/:id/cards'], async (req: Request, res: Response) => {
  const id = req.params.id;
  const wall = await getOrLoadWallAsync(id);

  const rawIp = req.ip || req.socket.remoteAddress || '127.0.0.1';
  const hashedIp = hashIp(rawIp);
  const now = Date.now();

  const tracker = ipCardCount.get(hashedIp);
  if (tracker && tracker.resetAt > now) {
    if (tracker.count >= 60) {
      res.status(429).json({ ok: false, error: 'Rate limit exceeded: 60 cards per minute limit' });
      return;
    }
    tracker.count += 1;
  } else {
    ipCardCount.set(hashedIp, { count: 1, resetAt: now + 60000 });
  }

  const body = req.body || {};
  const rawText = (body.raw || '').trim();

  if (!rawText) {
    res.status(400).json({ ok: false, error: 'Card raw payload is required' });
    return;
  }

  const zone = body.zone === 'a' || body.zone === 'c' ? body.zone : 'b';
  const anchor = typeof body.anchor === 'string' ? body.anchor.trim() : '';

  const meHeader = (req.headers['x-wall-me'] as string) || '';
  const authorHash = meHeader ? hashMe(meHeader) : hashedIp;

  const authenticatedAsOwner = await verifyIsOwner(req, wall);

  let newCard: CoWikiCard | null = null;

  await enqueueWallTask(wall, async () => {
    const cid = `C${wall.nextCidNum}`;
    wall.nextCidNum += 1;

    newCard = {
      cid,
      raw: rawText,
      anchor,
      zone,
      at: now,
      ip: hashedIp,
      ok: authenticatedAsOwner,
      authorHash,
    };

    wall.cards.set(cid, newCard);
    await scheduleSave(wall);
    broadcastEvent(wall.id, 'card', newCard);
  });

  res.status(201).json({
    ok: true,
    card: newCard,
    status: authenticatedAsOwner ? 'approved' : 'pending',
  });
});

// Approve a visitor card (Owner only)
app.post(['/api/wall/:id/cards/:cid/approve', '/api/walls/:id/cards/:cid/approve'], async (req: Request, res: Response) => {
  const { id, cid } = req.params;
  const wall = await getOrLoadWallAsync(id);

  const authenticatedAsOwner = await verifyIsOwner(req, wall);
  if (!authenticatedAsOwner) {
    res.status(401).json({ ok: false, error: 'Unauthorized. Owner key required.' });
    return;
  }

  await enqueueWallTask(wall, async () => {
    const card = wall.cards.get(cid);
    if (!card) {
      res.status(404).json({ ok: false, error: 'Card not found' });
      return;
    }

    card.ok = true;
    await scheduleSave(wall);
    broadcastEvent(wall.id, 'approve', { cid, ok: true });
    res.json({ ok: true, cid, message: 'Card approved and made permanent' });
  });
});

// Delete a visitor card (Owner or author)
app.delete(['/api/wall/:id/cards/:cid', '/api/walls/:id/cards/:cid'], async (req: Request, res: Response) => {
  const { id, cid } = req.params;
  const wall = await getOrLoadWallAsync(id);

  const authenticatedAsOwner = await verifyIsOwner(req, wall);
  const meHeader = (req.headers['x-wall-me'] as string) || '';
  const rawIp = req.ip || req.socket.remoteAddress || '127.0.0.1';
  const hashedIp = hashIp(rawIp);
  const userAuthorHash = meHeader ? hashMe(meHeader) : hashedIp;

  await enqueueWallTask(wall, async () => {
    const card = wall.cards.get(cid);
    if (!card) {
      res.status(404).json({ ok: false, error: 'Card not found' });
      return;
    }

    const isAuthor = card.authorHash === userAuthorHash || card.ip === hashedIp;
    if (!authenticatedAsOwner && !isAuthor) {
      res.status(403).json({ ok: false, error: 'Forbidden: only the card author or wall owner can delete this card' });
      return;
    }

    wall.cards.delete(cid);
    await scheduleSave(wall);
    broadcastEvent(wall.id, 'drop', { cid });
    res.json({ ok: true, cid, message: 'Card deleted' });
  });
});

// SSE Live stream for a wall
app.get(['/api/wall/:id/stream', '/api/walls/:id/stream'], async (req: Request, res: Response) => {
  const id = req.params.id;
  const wall = await getOrLoadWallAsync(id);

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.write('\n');

  if (!wallStreams.has(wall.id)) {
    wallStreams.set(wall.id, new Set());
  }
  const streamSet = wallStreams.get(wall.id)!;
  streamSet.add(res);

  const initData = {
    id: wall.id,
    slug: wall.slug,
    title: wall.title,
    v: wall.v,
    ownerCardCount: wall.ownerCards.length,
    guestCardCount: wall.cards.size,
  };
  res.write(`event: init\ndata: ${JSON.stringify(initData)}\n\n`);

  const heartbeatTimer = setInterval(() => {
    try {
      res.write(': heartbeat\n\n');
    } catch (e) {
      clearInterval(heartbeatTimer);
    }
  }, 15000);

  req.on('close', () => {
    clearInterval(heartbeatTimer);
    streamSet.delete(res);
    if (streamSet.size === 0) {
      wallStreams.delete(wall.id);
    }
  });
});

// Long polling fallback: GET /api/wall/:id/poll?since=v
app.get(['/api/wall/:id/poll', '/api/walls/:id/poll'], async (req: Request, res: Response) => {
  const id = req.params.id;
  const since = parseInt((req.query.since as string) || '0', 10);
  const wall = await getOrLoadWallAsync(id);

  if (wall.v > since) {
    res.json({
      v: wall.v,
      cards: Array.from(wall.cards.values()),
      ownerCards: wall.ownerCards,
      cols: wall.cols,
      car: wall.car,
      zones: wall.zones,
      zorder: wall.zorder,
    });
    return;
  }

  let resolved = false;
  const timeout = setTimeout(() => {
    if (!resolved) {
      resolved = true;
      res.json({ timeout: true, v: wall.v });
    }
  }, 25000);

  const checker = setInterval(() => {
    if (wall.v > since && !resolved) {
      resolved = true;
      clearTimeout(timeout);
      clearInterval(checker);
      res.json({
        v: wall.v,
        cards: Array.from(wall.cards.values()),
        ownerCards: wall.ownerCards,
        cols: wall.cols,
        car: wall.car,
        zones: wall.zones,
        zorder: wall.zorder,
      });
    }
  }, 1000);

  req.on('close', () => {
    clearTimeout(timeout);
    clearInterval(checker);
  });
});

// Frame check
app.get('/api/frame-check', async (req: Request, res: Response) => {
  const targetUrl = (req.query.url as string || '').trim();
  if (!targetUrl || !/^https?:\/\//i.test(targetUrl)) {
    res.status(400).json({ embeddable: false, error: 'Invalid URL' });
    return;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3500);

    const response = await fetch(targetUrl, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
      signal: controller.signal,
      redirect: 'follow',
    });

    clearTimeout(timeout);

    const xfo = (response.headers.get('x-frame-options') || '').toLowerCase();
    const csp = (response.headers.get('content-security-policy') || '').toLowerCase();

    let embeddable = true;
    let reason = '';

    if (xfo === 'deny' || xfo === 'sameorigin') {
      embeddable = false;
      reason = `X-Frame-Options: ${xfo}`;
    } else if (csp.includes('frame-ancestors')) {
      const match = csp.match(/frame-ancestors\s+([^;]+)/);
      if (match) {
        const policy = match[1].trim();
        if (policy === "'none'" || policy === "'self'") {
          embeddable = false;
          reason = `CSP: frame-ancestors ${policy}`;
        }
      }
    }

    res.json({ embeddable, reason, url: targetUrl });
  } catch (err: any) {
    res.json({ embeddable: false, reason: err?.message || 'Check failed', url: targetUrl });
  }
});

// Fallback: any unmatched /api/* request MUST return JSON, NEVER HTML
app.all('/api/*', (req: Request, res: Response) => {
  res.status(404).json({ ok: false, error: `API route not found: ${req.method} ${req.path}` });
});

// Setup Vite middleware in dev or static files in production
async function startServer() {
  const isDev = process.env.NODE_ENV !== 'production';

  if (isDev) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    if (fs.existsSync(distPath)) {
      app.use(express.static(distPath));
      app.get('*', (req, res) => {
        res.sendFile(path.join(distPath, 'index.html'));
      });
    }
  }

  const server = http.createServer(app);
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`WiKi Wall V618.23 Server running on port ${PORT}`);
    console.log(`Default owner key: ${DEFAULT_OWNER_KEY}`);
    console.log(`Database engine initialized (${dbManager.getStats().type})`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
