const WebSocket = require('ws');
const http = require('http');
const express = require('express'); 
const path = require('path');       

const app = express();
const server = http.createServer(app); 
app.use(express.static(path.join(__dirname, 'public')));
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const wss = new WebSocket.Server({ server });

const clients = new Map();
let activeControllerId = null;

wss.on('connection', (ws) => {
    ws.id = Math.random().toString(36).substr(2, 9);
    console.log(`Client connected: ${ws.id}`);

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);

            if (data.type === 'JOIN_STUDENT') {
                const student = {
                    id: ws.id,
                    name: data.name || `Student ${ws.id.substr(0, 4)}`,
                    role: 'student',
                    ws: ws
                };
                clients.set(ws.id, student);
                broadcastStudentList();
            }
            else if (data.type === 'JOIN_TEACHER') {
                const teacher = {
                    id: ws.id,
                    name: 'Teacher',
                    role: 'teacher',
                    ws: ws
                };
                clients.set(ws.id, teacher);
                broadcastStudentList();
            }
            else if (data.type === 'GRANT_CONTROL' && data.targetId) {
                revokeCurrentControl();
                activeControllerId = data.targetId;

                const targetStudent = clients.get(activeControllerId);
                if (targetStudent && targetStudent.ws.readyState === WebSocket.OPEN) {
                    targetStudent.ws.send(JSON.stringify({ type: 'CONTROL_GRANTED' }));
                    console.log(`Control granted to ${targetStudent.name}`);
                }
                broadcastStudentList();
            }
            else if (data.type === 'REVOKE_CONTROL') {
                revokeCurrentControl();
                broadcastStudentList();
            }
            else if (data.type === 'GAME_STATE_UPDATE' && data.targetId) {
                const targetClient = clients.get(data.targetId);
                if (targetClient && targetClient.ws.readyState === WebSocket.OPEN) {
                    targetClient.ws.send(JSON.stringify(data));
                }
            }
            else if (data.type === 'GAME_ACTION') {
                if (ws.id === activeControllerId) {
                    broadcastToTeachers(data);
                }
            }

        } catch (e) {
            console.error("Error processing message:", e);
        }
    });

    ws.on('close', () => {
        console.log(`Client disconnected: ${ws.id}`);
        if (ws.id === activeControllerId) {
            activeControllerId = null;
        }
        clients.delete(ws.id);
        broadcastStudentList();
    });
});

function revokeCurrentControl() {
    if (activeControllerId) {
        const student = clients.get(activeControllerId);
        if (student && student.ws.readyState === WebSocket.OPEN) {
            student.ws.send(JSON.stringify({ type: 'CONTROL_REVOKED' }));
        }
        activeControllerId = null;
    }
}

function broadcastStudentList() {
    const studentList = [];
    clients.forEach((client) => {
        if (client.role === 'student') {
            studentList.push({
                id: client.id,
                name: client.name,
                isActive: (client.id === activeControllerId)
            });
        }
    });

    const message = JSON.stringify({ type: 'STUDENT_LIST', list: studentList });

    clients.forEach((client) => {
        if (client.role === 'teacher' && client.ws.readyState === WebSocket.OPEN) {
            client.ws.send(message);
        }
    });
}

function broadcastToTeachers(data) {
    const message = JSON.stringify(data);
    clients.forEach((client) => {
        if (client.role === 'teacher' && client.ws.readyState === WebSocket.OPEN) {
            client.ws.send(message);
        }
    });
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`WebSocket Server is running on port ${PORT}`);
});