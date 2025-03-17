require('dotenv').config();
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Store active sessions and their connections
const sessions = new Map();

wss.on('connection', (ws) => {
  let sessionId = null;
  let userId = null;

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      
      switch (data.type) {
        case 'join':
          sessionId = data.sessionId;
          userId = data.userId;
          
          // Add to session
          if (!sessions.has(sessionId)) {
            sessions.set(sessionId, new Map());
          }
          sessions.get(sessionId).set(userId, ws);
          
          // Send confirmation
          ws.send(JSON.stringify({
            type: 'joined',
            sessionId,
            userId
          }));
          break;
          
        case 'leave':
          if (sessionId && sessions.has(sessionId)) {
            sessions.get(sessionId).delete(userId);
            if (sessions.get(sessionId).size === 0) {
              sessions.delete(sessionId);
            }
          }
          break;
          
        default:
          // Forward message to all participants in the session except sender
          if (sessionId && sessions.has(sessionId)) {
            const sessionParticipants = sessions.get(sessionId);
            sessionParticipants.forEach((participantWs, participantId) => {
              if (participantId !== userId && participantWs.readyState === WebSocket.OPEN) {
                participantWs.send(JSON.stringify(data));
              }
            });
          }
          break;
      }
    } catch (error) {
      console.error('Error processing message:', error);
    }
  });

  ws.on('close', () => {
    if (sessionId && sessions.has(sessionId)) {
      sessions.get(sessionId).delete(userId);
      if (sessions.get(sessionId).size === 0) {
        sessions.delete(sessionId);
      }
      
      // Notify other participants about the leave
      const sessionParticipants = sessions.get(sessionId);
      if (sessionParticipants) {
        sessionParticipants.forEach((participantWs, participantId) => {
          if (participantId !== userId && participantWs.readyState === WebSocket.OPEN) {
            participantWs.send(JSON.stringify({
              type: 'participantLeft',
              sessionId,
              userId
            }));
          }
        });
      }
    }
  });
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

const PORT = process.env.PORT || 8080;
server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
}); 