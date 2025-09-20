const express = require('express');
const path = require('path');
const fs = require('fs');
const { makeWASocket, DisconnectReason, useMultiFileAuthState, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const crypto = require('crypto');

const app = express();
const PORT = 5000;

// Middleware
app.use(express.json());

// Create public directory and ensure static files are properly served
const publicDir = path.join(__dirname, 'public');
if (!fs.existsSync(publicDir)) {
    fs.mkdirSync(publicDir, { recursive: true });
    fs.mkdirSync(path.join(publicDir, 'css'), { recursive: true });
    fs.mkdirSync(path.join(publicDir, 'js'), { recursive: true });
}

// Serve only the public directory (not the entire project)
app.use(express.static(publicDir));

// Storage for sessions and statistics
const activeSessions = new Map();
const sessionStats = {
    total: 0,
    regular: 0,
    premium: 0
};

// Premium keys storage (in production, use a database)
const premiumKeys = new Set();
const users = new Map();

// Get admin credentials from environment (required)
const adminPassword = process.env.ADMIN_PASSWORD;
if (!adminPassword) {
    console.error('ERROR: ADMIN_PASSWORD environment variable is required for security');
    process.exit(1);
}
users.set('admin', { password: adminPassword, isAdmin: true });

// Helper function to generate pairing code
async function generatePairingCode(phoneNumber, isPremium = false) {
    try {
        const { version } = await fetchLatestBaileysVersion();
        
        // Generate unique session id
        const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        // Ensure sessions directory exists outside public folder
        const sessionsDir = path.join(__dirname, 'private_sessions');
        if (!fs.existsSync(sessionsDir)) {
            fs.mkdirSync(sessionsDir, { recursive: true });
        }
        
        // Create auth state in secure location
        const { state, saveCreds } = await useMultiFileAuthState(`${sessionsDir}/${sessionId}`);
        
        // Create socket for pairing codes
        const socket = makeWASocket({
            version,
            auth: state,
            printQRInTerminal: false,
            browser: ['HISOKA-MD', 'Chrome', '1.0.0']
        });

        // Wire up credential saving
        socket.ev.on('creds.update', saveCreds);

        return new Promise((resolve, reject) => {
            let resolved = false;
            let codeGenerationTimer;
            let globalTimeout;
            
            const cleanup = (deleteAuth = false) => {
                try {
                    clearTimeout(codeGenerationTimer);
                    clearTimeout(globalTimeout);
                    
                    if (deleteAuth) {
                        socket.end();
                        activeSessions.delete(sessionId);
                        // Only delete auth files on failure, not success
                        const sessionPath = `${sessionsDir}/${sessionId}`;
                        if (fs.existsSync(sessionPath)) {
                            fs.rmSync(sessionPath, { recursive: true, force: true });
                        }
                    }
                } catch (error) {
                    console.error('Cleanup error:', error);
                }
            };

            const safeResolve = (result) => {
                if (!resolved) {
                    resolved = true;
                    clearTimeout(globalTimeout);
                    resolve(result);
                }
            };

            const safeReject = (error) => {
                if (!resolved) {
                    resolved = true;
                    cleanup(true); // Delete auth on failure
                    reject(error);
                }
            };

            socket.ev.on('connection.update', async (update) => {
                const { connection, lastDisconnect } = update;
                
                if (connection === 'close') {
                    const shouldReconnect = (lastDisconnect?.error)?.output?.statusCode !== DisconnectReason.loggedOut;
                    if (!shouldReconnect) {
                        safeReject(new Error('Session closed'));
                    }
                } else if (connection === 'open') {
                    // Connection successful - preserve session for reuse
                    console.log(`Session ${sessionId} successfully connected and authenticated`);
                }
            });

            // Generate real WhatsApp pairing code
            const generateCode = async () => {
                try {
                    // Remove any non-numeric characters and ensure proper format
                    const cleanPhoneNumber = phoneNumber.replace(/\D/g, '');
                    
                    if (!state.creds.registered) {
                        const pairingCode = await socket.requestPairingCode(cleanPhoneNumber);
                        
                        // Store session info with socket for later management
                        activeSessions.set(sessionId, {
                            socket,
                            phoneNumber: cleanPhoneNumber,
                            isPremium,
                            createdAt: Date.now(),
                            pairingCode,
                            status: 'waiting_pair'
                        });
                        
                        // Update stats
                        sessionStats.total++;
                        if (isPremium) {
                            sessionStats.premium++;
                        } else {
                            sessionStats.regular++;
                        }
                        
                        // Format pairing code for display
                        const formattedCode = pairingCode.match(/.{1,4}/g)?.join('-') || pairingCode;
                        
                        safeResolve({
                            success: true,
                            pairingCode,
                            formattedCode,
                            rawCode: pairingCode,
                            canCopy: true,
                            serverUsed: isPremium ? 'Premium-1' : 'Regular-1',
                            sessionId
                        });
                    } else {
                        safeReject(new Error('Number is already registered'));
                    }
                } catch (error) {
                    safeReject(error);
                }
            };

            // Wait a moment for socket to initialize then generate code
            codeGenerationTimer = setTimeout(generateCode, 2000);

            // Set timeout for pairing code generation (3 minutes)
            globalTimeout = setTimeout(() => {
                safeReject(new Error('Timeout generating pairing code'));
            }, 180000);
        });
    } catch (error) {
        console.error('Error generating pairing code:', error);
        throw error;
    }
}

// API Endpoints

// Pairing code generation endpoint
app.post('/request-pairing', async (req, res) => {
    try {
        const { phoneNumber, premiumKey } = req.body;
        
        if (!phoneNumber) {
            return res.status(400).json({
                success: false,
                error: 'Phone number is required'
            });
        }
        
        // Validate phone number format
        const cleanPhoneNumber = phoneNumber.replace(/\D/g, '');
        if (cleanPhoneNumber.length < 10) {
            return res.status(400).json({
                success: false,
                error: 'Invalid phone number format'
            });
        }
        
        // Check if premium key is valid
        const isPremium = premiumKey && premiumKeys.has(premiumKey);
        
        const result = await generatePairingCode(phoneNumber, isPremium);
        res.json(result);
        
    } catch (error) {
        console.error('Error in /request-pairing:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to generate pairing code. Please try again.'
        });
    }
});

// Server status endpoint
app.get('/server-status', (req, res) => {
    const regularServers = [
        { serverIndex: 1, status: 'online', sessions: activeSessions.size, maxSessions: 50 },
        { serverIndex: 2, status: 'online', sessions: Math.floor(Math.random() * 30), maxSessions: 50 },
        { serverIndex: 3, status: 'full', sessions: 50, maxSessions: 50 }
    ];
    
    const premiumServers = [
        { serverIndex: 1, status: 'online', sessions: Math.floor(sessionStats.premium), maxSessions: 100 },
        { serverIndex: 2, status: 'online', sessions: Math.floor(Math.random() * 20), maxSessions: 100 }
    ];
    
    res.json({
        success: true,
        serverStatus: {
            regular: regularServers,
            premium: premiumServers
        }
    });
});

// Bot counts endpoint
app.get('/bot-counts', (req, res) => {
    res.json({
        success: true,
        botCounts: {
            total: sessionStats.total,
            regular: sessionStats.regular,
            premium: sessionStats.premium
        },
        serverStatus: {
            regularServersOnline: 3,
            premiumServersOnline: 2
        }
    });
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({
        success: true,
        status: 'healthy',
        performance: {
            uptime: process.uptime(),
            memory: process.memoryUsage()
        }
    });
});

// Basic auth middleware for admin endpoints
const authenticate = (req, res, next) => {
    const auth = req.headers.authorization;
    if (!auth || !auth.startsWith('Basic ')) {
        return res.status(401).json({ success: false, error: 'Authentication required' });
    }
    
    const credentials = Buffer.from(auth.slice(6), 'base64').toString().split(':');
    const username = credentials[0];
    const password = credentials[1];
    
    const user = users.get(username);
    if (!user || user.password !== password) {
        return res.status(401).json({ success: false, error: 'Invalid credentials' });
    }
    
    req.user = { username, isAdmin: user.isAdmin };
    next();
};

// Admin endpoints
app.get('/admin/keys', authenticate, (req, res) => {
    if (!req.user.isAdmin) {
        return res.status(403).json({ success: false, error: 'Admin access required' });
    }
    
    res.json({
        success: true,
        keys: Array.from(premiumKeys)
    });
});

app.post('/admin/generate-key', authenticate, (req, res) => {
    if (!req.user.isAdmin) {
        return res.status(403).json({ success: false, error: 'Admin access required' });
    }
    
    const key = 'PREMIUM_' + crypto.randomBytes(8).toString('hex').toUpperCase();
    premiumKeys.add(key);
    
    res.json({
        success: true,
        key
    });
});

app.get('/admin/users', authenticate, (req, res) => {
    if (!req.user.isAdmin) {
        return res.status(403).json({ success: false, error: 'Admin access required' });
    }
    
    const userList = Array.from(users.entries()).map(([username, user]) => ({
        username,
        isAdmin: user.isAdmin
    }));
    
    res.json({
        success: true,
        users: userList
    });
});

app.post('/admin/add-user', authenticate, (req, res) => {
    if (!req.user.isAdmin) {
        return res.status(403).json({ success: false, error: 'Admin access required' });
    }
    
    const { username, password, isAdmin } = req.body;
    
    if (!username || !password) {
        return res.status(400).json({ success: false, error: 'Username and password required' });
    }
    
    if (users.has(username)) {
        return res.status(400).json({ success: false, error: 'User already exists' });
    }
    
    users.set(username, { password, isAdmin: Boolean(isAdmin) });
    
    res.json({ success: true });
});

// Handle root route and serve index.html
app.get('/', (req, res) => {
    res.sendFile(path.join(publicDir, 'index.html'));
});

// Create secure directories
const privateSessionsDir = path.join(__dirname, 'private_sessions');
if (!fs.existsSync(privateSessionsDir)) {
    fs.mkdirSync(privateSessionsDir, { recursive: true });
}

// Add session management endpoints
app.get('/session/:sessionId/status', (req, res) => {
    const { sessionId } = req.params;
    const session = activeSessions.get(sessionId);
    
    if (!session) {
        return res.status(404).json({ success: false, error: 'Session not found' });
    }
    
    res.json({
        success: true,
        sessionId,
        status: session.status || 'active',
        phoneNumber: session.phoneNumber,
        isPremium: session.isPremium,
        createdAt: session.createdAt
    });
});

app.delete('/session/:sessionId', (req, res) => {
    const { sessionId } = req.params;
    const session = activeSessions.get(sessionId);
    
    if (!session) {
        return res.status(404).json({ success: false, error: 'Session not found' });
    }
    
    try {
        session.socket.end();
        activeSessions.delete(sessionId);
        
        // Clean up session files
        const sessionPath = path.join(__dirname, 'private_sessions', sessionId);
        if (fs.existsSync(sessionPath)) {
            fs.rmSync(sessionPath, { recursive: true, force: true });
        }
        
        res.json({ success: true, message: 'Session terminated' });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to terminate session' });
    }
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
    console.log('HISOKA-MD WhatsApp Pairing Service is now running!');
    console.log('Admin authentication configured from environment');
});