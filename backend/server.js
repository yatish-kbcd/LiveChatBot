import express from 'express';
import cors from 'cors';
import OpenAI from 'openai';
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// MySQL connection
const dbConfig = {
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
};

let db;
try {
  db = await mysql.createConnection(dbConfig);
  console.log('Connected to MySQL database');

  // Create tables if not exist
  await db.execute(`
    CREATE TABLE IF NOT EXISTS sessions (
      id VARCHAR(255) PRIMARY KEY,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS messages (
      id INT AUTO_INCREMENT PRIMARY KEY,
      session_id VARCHAR(255),
      role ENUM('system', 'user', 'assistant'),
      content TEXT,
      timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
    )
  `);

  console.log('Database tables ready');
} catch (error) {
  console.error('Database connection error:', error);
  process.exit(1);
}

app.post('/chat', async (req, res) => {
  let { message, sessionId } = req.body;

  if (!sessionId) {
    sessionId = Date.now().toString(); // Generate sessionId if not provided
  }

  try {
    // Ensure session exists
    await db.execute('INSERT IGNORE INTO sessions (id) VALUES (?)', [sessionId]);

    // Get conversation history
    const [rows] = await db.execute(
      'SELECT role, content FROM messages WHERE session_id = ? ORDER BY timestamp ASC',
      [sessionId]
    );

    const systemPrompt = `You are a voice assistant. Follow these rules:
1. Keep responses under 3 sentences
2. Use simple language
3. Avoid markdown, lists, or special characters
4. Use contractions for natural speech
5. Avoid complex numbers or codes`;

    const messages = [
      { role: 'system', content: systemPrompt },
      ...rows.map(row => ({ role: row.role, content: row.content })),
      { role: 'user', content: message }
    ];

    // Store user message
    await db.execute('INSERT INTO messages (session_id, role, content) VALUES (?, ?, ?)', [sessionId, 'user', message]);

    const completion = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages,
      stream: true,
    });

    res.setHeader('Content-Type', 'text/plain');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    let fullResponse = '';
    for await (const chunk of completion) {
      const content = chunk.choices[0]?.delta?.content || '';
      res.write(content);
      fullResponse += content;
    }

    // Store assistant response
    if (fullResponse.trim()) {
      await db.execute('INSERT INTO messages (session_id, role, content) VALUES (?, ?, ?)', [sessionId, 'assistant', fullResponse.trim()]);
    }

    res.end();
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});

app.listen(3001, () => {
  console.log('Server running on port 3001');
});
