// server.js
const express = require('express');
const crypto = require('crypto');
const app = express();
app.use(express.json());

// Simple in-memory storage: { setupId: { participants, assignment, pins, used } }
const DB = {};

// Helper: generate 4-digit PIN
function genPin(){ return String(Math.floor(1000 + Math.random()*9000)); }

// derangement (no fixed points)
function derange(arr){
  const n = arr.length;
  let idx = Array.from({length:n}, (_,i)=>i);
  let attempt=0;
  do{
    for(let i=n-1;i>0;i--){
      const j = Math.floor(Math.random()*(i+1));
      [idx[i], idx[j]] = [idx[j], idx[i]];
    }
    attempt++;
    if(attempt>2000) break;
  }while(idx.some((v,i)=>v===i));
  return idx.map(i => arr[i]);
}

// Create new setup
app.post('/init', (req, res) => {
  const participants = req.body.participants;
  if(!Array.isArray(participants) || participants.length < 2) return res.status(400).send('participants required');
  // generate assignment
  const recipients = derange(participants.slice());
  const assignment = {};
  for(let i=0;i<participants.length;i++) assignment[participants[i]] = recipients[i];
  // generate pins
  const pins = {};
  for(const p of participants) {
    let pin;
    // avoid duplicate pins in same setup
    do { pin = genPin(); } while(Object.values(pins).includes(pin));
    pins[p] = pin;
  }
  const setupId = crypto.randomBytes(10).toString('hex');
  const used = {}; // name -> true when revealed
  DB[setupId] = { participants, assignment, pins, used, createdAt: Date.now() };
  // Return only pins to organizer and setupId; do NOT return assignment mapping
  res.json({ setupId, pins, used });
});

// Reveal endpoint: name + pin + setupId -> returns recipient if pin valid and not already used by that name
app.post('/reveal', (req, res) => {
  const { setupId, name, pin } = req.body;
  if(!setupId || !name || !pin) return res.status(400).send('setupId,name,pin required');
  const S = DB[setupId];
  if(!S) return res.status(404).send('setup not found');
  if(!S.participants.includes(name)) return res.status(400).send('unknown name');
  if(S.used[name]) return res.status(409).send('bereits verwendet');
  if(S.pins[name] !== String(pin)) return res.status(403).send('PIN ungültig');
  // valid -> reveal recipient and mark used
  const recipient = S.assignment[name];
  // Important: Do NOT include assignment in response besides recipient for requesting user.
  S.used[name] = true;
  // Optionally, remove the assignment mapping for that giver to reduce later exposure
  delete S.assignment[name];
  res.json({ recipient, used: true });
});

// Status endpoint (public): returns setupId (if exists) and used flags but NOT assignment/pins
app.get('/status', (req, res) => {
  // optionally return latest setup if only one; naive approach: return the last created setup
  const keys = Object.keys(DB);
  if(keys.length === 0) return res.json({});
  const latest = keys[keys.length - 1];
  const s = DB[latest];
  res.json({ setupId: latest, participants: s.participants, used: s.used });
});

// Simple housekeeping: clear old setups > 24h (optional)
setInterval(() => {
  const now = Date.now();
  for(const k of Object.keys(DB)){
    if(now - DB[k].createdAt > 24*3600*1000) delete DB[k];
  }
}, 60*60*1000);

const PORT = process.env.PORT || 3000;
app.listen(PORT, ()=> console.log('Server listening on', PORT));