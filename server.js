require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

const app = express();
const port = process.env.PORT || 5000;

// Parse JSON bodies
app.use(express.json());

// Helper functions for JSON file operations
const readJSONFile = (filePath) => {
    try {
        if (!fs.existsSync(filePath)) {
            const dir = path.dirname(filePath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            fs.writeFileSync(filePath, '{}');
        }
        const data = fs.readFileSync(filePath, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        console.error(`Error reading ${filePath}:`, error);
        return {};
    }
};

const writeJSONFile = (filePath, data) => {
    try {
        const dir = path.dirname(filePath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
        return true;
    } catch (error) {
        console.error(`Error writing ${filePath}:`, error);
        return false;
    }
};

// Serve static files from public directory with cache control
app.use(express.static('public', {
    setHeaders: (res, path) => {
        res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.set('Pragma', 'no-cache');
        res.set('Expires', '0');
    }
}));

// User authentication endpoints
app.post('/api/signup', async (req, res) => {
    try {
        const { email, password } = req.body;
        
        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password are required' });
        }
        
        const users = readJSONFile('./data/users.json');
        
        // Check if user already exists
        if (users.users && users.users[email]) {
            return res.status(400).json({ error: 'User already exists' });
        }
        
        // Hash password
        const hashedPassword = await bcrypt.hash(password, 12);
        
        // Create user
        const userId = uuidv4();
        if (!users.users) users.users = {};
        users.users[email] = {
            id: userId,
            email,
            password: hashedPassword,
            createdAt: new Date().toISOString()
        };
        
        writeJSONFile('./data/users.json', users);
        
        res.json({ success: true, userId, email });
    } catch (error) {
        console.error('Signup error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.post('/api/signin', async (req, res) => {
    try {
        const { email, password } = req.body;
        
        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password are required' });
        }
        
        const users = readJSONFile('./data/users.json');
        
        const user = users.users && users.users[email];
        if (!user) {
            return res.status(400).json({ error: 'Invalid credentials' });
        }
        
        // Check password
        const isValidPassword = await bcrypt.compare(password, user.password);
        if (!isValidPassword) {
            return res.status(400).json({ error: 'Invalid credentials' });
        }
        
        // Create session
        const sessionToken = uuidv4();
        if (!users.sessions) users.sessions = {};
        users.sessions[sessionToken] = {
            userId: user.id,
            email: user.email,
            createdAt: new Date().toISOString()
        };
        
        writeJSONFile('./data/users.json', users);
        
        res.json({ success: true, sessionToken, userId: user.id, email: user.email });
    } catch (error) {
        console.error('Signin error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Study data endpoints
app.get('/api/study-data/:userId', (req, res) => {
    try {
        const { userId } = req.params;
        const studyData = readJSONFile('./data/study_data.json');
        
        const userSubjects = Object.values(studyData.subjects || {}).filter(s => s.userId === userId);
        const userSessions = Object.values(studyData.study_sessions || {}).filter(s => s.userId === userId);
        
        res.json({ subjects: userSubjects, sessions: userSessions });
    } catch (error) {
        console.error('Get study data error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.post('/api/subjects', (req, res) => {
    try {
        const { userId, name, color, goal, description } = req.body;
        
        const studyData = readJSONFile('./data/study_data.json');
        if (!studyData.subjects) studyData.subjects = {};
        
        const subjectId = uuidv4();
        studyData.subjects[subjectId] = {
            id: subjectId,
            userId,
            name,
            color,
            goal,
            description,
            createdAt: new Date().toISOString()
        };
        
        writeJSONFile('./data/study_data.json', studyData);
        
        res.json({ success: true, subject: studyData.subjects[subjectId] });
    } catch (error) {
        console.error('Add subject error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.post('/api/sessions', (req, res) => {
    try {
        const { userId, subjectId, duration, date } = req.body;
        
        const studyData = readJSONFile('./data/study_data.json');
        if (!studyData.study_sessions) studyData.study_sessions = {};
        
        const sessionId = uuidv4();
        studyData.study_sessions[sessionId] = {
            id: sessionId,
            userId,
            subjectId,
            duration,
            date,
            timestamp: new Date().toISOString()
        };
        
        writeJSONFile('./data/study_data.json', studyData);
        
        res.json({ success: true, session: studyData.study_sessions[sessionId] });
    } catch (error) {
        console.error('Add session error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Route for root path
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'landing.html'));
});

// Video notes endpoints
app.get('/api/video-notes/:userId', (req, res) => {
    try {
        const { userId } = req.params;
        const studyData = readJSONFile('./data/study_data.json');
        
        const userNotes = Object.values(studyData.video_notes || {}).filter(n => n.userId === userId);
        
        // Add subject information to notes
        const notesWithSubjects = userNotes.map(note => {
            if (note.subjectId) {
                const subject = studyData.subjects && studyData.subjects[note.subjectId];
                return { ...note, subject };
            }
            return note;
        });
        
        res.json({ notes: notesWithSubjects });
    } catch (error) {
        console.error('Get video notes error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.post('/api/video-notes', (req, res) => {
    try {
        const { userId, title, content, videoUrl, subjectId } = req.body;
        
        if (!userId || !title || !content) {
            return res.status(400).json({ error: 'UserId, title, and content are required' });
        }
        
        const studyData = readJSONFile('./data/study_data.json');
        if (!studyData.video_notes) studyData.video_notes = {};
        
        const noteId = uuidv4();
        studyData.video_notes[noteId] = {
            id: noteId,
            userId,
            title,
            content,
            videoUrl: videoUrl || null,
            subjectId: subjectId || null,
            createdAt: new Date().toISOString()
        };
        
        writeJSONFile('./data/study_data.json', studyData);
        
        // Add subject information to response
        let noteWithSubject = studyData.video_notes[noteId];
        if (subjectId && studyData.subjects && studyData.subjects[subjectId]) {
            noteWithSubject = { ...noteWithSubject, subject: studyData.subjects[subjectId] };
        }
        
        res.json({ success: true, note: noteWithSubject });
    } catch (error) {
        console.error('Add video note error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Delete subject endpoint
app.delete('/api/subjects/:subjectId', (req, res) => {
    try {
        const { subjectId } = req.params;
        const sessionToken = req.headers['x-session-token'];
        
        if (!sessionToken) {
            return res.status(401).json({ error: 'Authentication required' });
        }
        
        // Verify session and get user
        const users = readJSONFile('./data/users.json');
        const session = users.sessions && users.sessions[sessionToken];
        
        if (!session) {
            return res.status(401).json({ error: 'Invalid session' });
        }
        
        const studyData = readJSONFile('./data/study_data.json');
        
        // Check if subject exists and belongs to the user
        if (studyData.subjects && studyData.subjects[subjectId]) {
            if (studyData.subjects[subjectId].userId !== session.userId) {
                return res.status(403).json({ error: 'Not authorized to delete this subject' });
            }
            
            // Delete the subject
            delete studyData.subjects[subjectId];
            
            // Also delete all sessions associated with this subject
            if (studyData.study_sessions) {
                for (const sessionId in studyData.study_sessions) {
                    if (studyData.study_sessions[sessionId].subjectId === subjectId) {
                        delete studyData.study_sessions[sessionId];
                    }
                }
            }
            
            // Also delete all video notes associated with this subject
            if (studyData.video_notes) {
                for (const noteId in studyData.video_notes) {
                    if (studyData.video_notes[noteId].subjectId === subjectId) {
                        delete studyData.video_notes[noteId];
                    }
                }
            }
            
            writeJSONFile('./data/study_data.json', studyData);
            res.json({ success: true });
        } else {
            res.status(404).json({ error: 'Subject not found' });
        }
    } catch (error) {
        console.error('Delete subject error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Delete session endpoint
app.delete('/api/sessions/:sessionId', (req, res) => {
    try {
        const { sessionId } = req.params;
        const sessionToken = req.headers['x-session-token'];
        
        if (!sessionToken) {
            return res.status(401).json({ error: 'Authentication required' });
        }
        
        // Verify session and get user
        const users = readJSONFile('./data/users.json');
        const session = users.sessions && users.sessions[sessionToken];
        
        if (!session) {
            return res.status(401).json({ error: 'Invalid session' });
        }
        
        const studyData = readJSONFile('./data/study_data.json');
        
        // Check if session exists and belongs to the user
        if (studyData.study_sessions && studyData.study_sessions[sessionId]) {
            if (studyData.study_sessions[sessionId].userId !== session.userId) {
                return res.status(403).json({ error: 'Not authorized to delete this session' });
            }
            
            delete studyData.study_sessions[sessionId];
            writeJSONFile('./data/study_data.json', studyData);
            res.json({ success: true });
        } else {
            res.status(404).json({ error: 'Session not found' });
        }
    } catch (error) {
        console.error('Delete session error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.delete('/api/video-notes/:noteId', (req, res) => {
    try {
        const { noteId } = req.params;
        
        const studyData = readJSONFile('./data/study_data.json');
        
        if (studyData.video_notes && studyData.video_notes[noteId]) {
            delete studyData.video_notes[noteId];
            writeJSONFile('./data/study_data.json', studyData);
            res.json({ success: true });
        } else {
            res.status(404).json({ error: 'Video note not found' });
        }
    } catch (error) {
        console.error('Delete video note error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Route for the main app
app.get('/app', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'complete_study_tracker.html'));
});

app.listen(port, '0.0.0.0', () => {
    console.log(`Study GPS server running on http://0.0.0.0:${port}`);
});