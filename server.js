const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const crypto = require("crypto");

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });
app.use(express.static("public"));
app.get("/health", (_, res) => res.json({ ok: true }));

const rooms = new Map();
const WORDS = ["watermelon","astronaut","pizza","volcano","basketball","unicorn","toothbrush","helicopter","penguin","popcorn","rainbow","guitar","dinosaur","spaceship","hamburger","telescope","cactus","ice cream","octopus","castle"];
const QUIZ = [
  {q:"Which animal is known as the ship of the desert?", a:["Camel","Horse","Elephant","Llama"], correct:0},
  {q:"How many sides does a hexagon have?", a:["5","6","7","8"], correct:1},
  {q:"Which planet is famous for its rings?", a:["Mars","Venus","Saturn","Mercury"], correct:2},
  {q:"What is the largest ocean on Earth?", a:["Atlantic","Indian","Arctic","Pacific"], correct:3},
  {q:"Which one is a primary color of light?", a:["Blue","Pink","Brown","Grey"], correct:0},
  {q:"What do bees collect from flowers?", a:["Sand","Nectar","Dew","Leaves"], correct:1},
  {q:"How many days are in a leap year?", a:["364","365","366","367"], correct:2},
  {q:"Which instrument has keys, pedals and strings?", a:["Drum","Flute","Violin","Piano"], correct:3}
];
const WYR = [
  ["Fly anywhere","Become invisible"],["Eat only pizza for a week","Eat only burgers for a week"],
  ["Talk to animals","Speak every human language"],["Live underwater","Live in space"],
  ["Always be 10 minutes early","Always be 10 minutes late"],["Have a rewind button","Have a pause button"],
  ["Explore a jungle","Explore the deep ocean"],["Never do homework again","Never clean your room again"]
];
const code = () => crypto.randomBytes(3).toString("hex").toUpperCase();
const safeRoom = r => ({
  code:r.code, hostId:r.hostId, players:r.players.map(p=>({id:p.id,name:p.name,score:p.score})),
  game:r.game ? {type:r.game.type,phase:r.game.phase,round:r.game.round,drawerId:r.game.drawerId,
    question:r.game.question ? {q:r.game.question.q} : null,options:r.game.options,wyr:r.game.wyr, votes:r.game.votes ? Object.keys(r.game.votes).length : 0,
    answered:r.game.answers ? Object.keys(r.game.answers).length : 0, message:r.game.message || ""} : null
});
function emitRoom(r) { io.to(r.code).emit("room:update", safeRoom(r)); }
function getRoom(socket) { const c=socket.data.room; return c && rooms.get(c); }
function sendError(socket, message) { socket.emit("app:error", message); }
function pick(a) { return a[Math.floor(Math.random()*a.length)]; }
function resetScores(r) { r.players.forEach(p=>p.score=0); }
function startGame(r, type) {
  r.game = {type, phase:"playing", round:1, answers:{}, votes:{}, used:[]};
  if (type==="draw") {
    r.game.drawerId = r.players[0].id; r.game.word = pick(WORDS); r.game.phase="drawing";
    r.players.forEach(p=>io.to(p.id).emit("game:private",{kind:"draw-word",word:p.id===r.game.drawerId?r.game.word:null,isDrawer:p.id===r.game.drawerId}));
  } else if (type==="imposter") {
    r.game.phase="clues"; r.game.word=pick(WORDS); r.game.imposterId=pick(r.players).id;
    r.players.forEach(p=>io.to(p.id).emit("game:private",{kind:"imposter-role",role:p.id===r.game.imposterId?"IMPOSTER":"CIVILIAN",word:p.id===r.game.imposterId?"":r.game.word}));
  } else if (type==="quiz") {
    r.game.question=pick(QUIZ); r.game.options=r.game.question.a; r.game.answers={};
  } else if (type==="wyr") {
    r.game.wyr=pick(WYR); r.game.votes={};
  }
  emitRoom(r);
}
io.on("connection", socket => {
  socket.on("room:create", ({name}, cb) => {
    const clean=(name||"").trim().slice(0,18); if(!clean) return cb?.({error:"Enter a player name."});
    let c; do { c=code(); } while(rooms.has(c));
    const p={id:socket.id,name:clean,score:0};
    const r={code:c,hostId:socket.id,players:[p],game:null};
    rooms.set(c,r); socket.join(c); socket.data.room=c; cb?.({room:safeRoom(r)});
  });
  socket.on("room:join", ({code:c,name}, cb) => {
    c=(c||"").trim().toUpperCase(); const r=rooms.get(c); const clean=(name||"").trim().slice(0,18);
    if(!clean) return cb?.({error:"Enter a player name."});
    if(!r) return cb?.({error:"Room not found. Check the code."});
    if(r.players.length>=6) return cb?.({error:"This room is full (6 players max)."});
    if(r.game) return cb?.({error:"A game is already running. Ask the host to return to the lobby."});
    r.players.push({id:socket.id,name:clean,score:0}); socket.join(c); socket.data.room=c;
    cb?.({room:safeRoom(r)}); emitRoom(r); io.to(c).emit("notice",`${clean} joined the party!`);
  });
  socket.on("room:leave", () => leave(socket));
  socket.on("game:start", type => {
    const r=getRoom(socket); if(!r || r.hostId!==socket.id) return;
    if(r.players.length<2) return sendError(socket,"Invite at least one friend first.");
    if(!["draw","imposter","quiz","wyr"].includes(type)) return;
    resetScores(r); startGame(r,type);
  });
  socket.on("draw:stroke", data => {
    const r=getRoom(socket); if(!r?.game || r.game.type!=="draw" || r.game.drawerId!==socket.id) return;
    socket.to(r.code).emit("draw:stroke",data);
  });
  socket.on("draw:clear", () => { const r=getRoom(socket); if(r?.game?.type==="draw" && r.game.drawerId===socket.id) io.to(r.code).emit("draw:clear"); });
  socket.on("draw:guess", guess => {
    const r=getRoom(socket); if(!r?.game || r.game.type!=="draw") return;
    const p=r.players.find(x=>x.id===socket.id); if(!p || socket.id===r.game.drawerId) return;
    const g=String(guess||"").trim().toLowerCase();
    if(!g) return;
    if(g===r.game.word.toLowerCase()) {
      p.score+=10; const drawer=r.players.find(x=>x.id===r.game.drawerId); if(drawer) drawer.score+=5;
      io.to(r.code).emit("notice",`${p.name} guessed it! The word was ${r.game.word}.`);
      r.game.phase="round-over"; r.game.message=`The word was ${r.game.word}!`;
      emitRoom(r);
    } else socket.to(r.code).emit("draw:chat",{name:p.name,text:String(guess).slice(0,70)});
  });
  socket.on("game:next", () => {
    const r=getRoom(socket); if(!r || r.hostId!==socket.id || !r.game) return;
    if(r.game.type==="draw") {
      const idx=r.players.findIndex(p=>p.id===r.game.drawerId); const next=r.players[(idx+1)%r.players.length];
      r.game.round++; r.game.drawerId=next.id; r.game.word=pick(WORDS); r.game.phase="drawing"; r.game.message="";
      io.to(r.code).emit("draw:clear");
      r.players.forEach(p=>io.to(p.id).emit("game:private",{kind:"draw-word",word:p.id===next.id?r.game.word:null,isDrawer:p.id===next.id}));
      emitRoom(r);
    } else if(r.game.type==="quiz") {
      r.game.round++; r.game.question=pick(QUIZ.filter(q=>!r.game.used.includes(q.q)) .length ? QUIZ.filter(q=>!r.game.used.includes(q.q)) : QUIZ);
      r.game.used.push(r.game.question.q); r.game.answers={}; r.game.phase="playing"; emitRoom(r);
    } else if(r.game.type==="wyr") {
      r.game.round++; r.game.wyr=pick(WYR); r.game.votes={}; r.game.phase="playing"; emitRoom(r);
    } else if(r.game.type==="imposter") {
      r.game.phase="clues"; r.game.votes={}; r.game.word=pick(WORDS); r.game.imposterId=pick(r.players).id;
      r.players.forEach(p=>io.to(p.id).emit("game:private",{kind:"imposter-role",role:p.id===r.game.imposterId?"IMPOSTER":"CIVILIAN",word:p.id===r.game.imposterId?"":r.game.word}));
      emitRoom(r);
    }
  });
  socket.on("quiz:answer", index => {
    const r=getRoom(socket); if(!r?.game || r.game.type!=="quiz" || r.game.answers[socket.id]!==undefined) return;
    const q=r.game.question; const ok=Number(index)===q.correct; r.game.answers[socket.id]=Number(index);
    const p=r.players.find(x=>x.id===socket.id); if(ok && p) p.score+=10;
    emitRoom(r);
    if(Object.keys(r.game.answers).length===r.players.length) io.to(r.code).emit("notice","Everyone has answered! Host can go to the next question.");
  });
  socket.on("wyr:vote", index => {
    const r=getRoom(socket); if(!r?.game || r.game.type!=="wyr" || r.game.votes[socket.id]!==undefined) return;
    r.game.votes[socket.id]=Number(index); emitRoom(r);
  });
  socket.on("imposter:vote", id => {
    const r=getRoom(socket); if(!r?.game || r.game.type!=="imposter" || r.game.phase!=="clues" || r.game.votes[socket.id]!==undefined) return;
    if(!r.players.some(p=>p.id===id)) return;
    r.game.votes[socket.id]=id; emitRoom(r);
    if(Object.keys(r.game.votes).length===r.players.length) {
      const tally={}; Object.values(r.game.votes).forEach(v=>tally[v]=(tally[v]||0)+1);
      const max=Math.max(...Object.values(tally)); const out=Object.keys(tally).filter(k=>tally[k]===max);
      r.game.phase="round-over"; r.game.message=out.length===1 && out[0]===r.game.imposterId ? "You found the imposter!" : "The imposter escaped!";
      io.to(r.code).emit("imposter:result",{imposterId:r.game.imposterId,word:r.game.word,message:r.game.message});
      emitRoom(r);
    }
  });
  socket.on("lobby:return", () => {
    const r=getRoom(socket); if(!r || r.hostId!==socket.id) return;
    r.game=null; emitRoom(r);
  });
  socket.on("disconnect",()=>leave(socket));
});
function leave(socket) {
  const r=getRoom(socket); if(!r) return;
  r.players=r.players.filter(p=>p.id!==socket.id); socket.leave(r.code); socket.data.room=null;
  if(!r.players.length) rooms.delete(r.code);
  else {
    if(r.hostId===socket.id) r.hostId=r.players[0].id;
    if(r.game) { r.game=null; io.to(r.code).emit("notice","A player left. The game ended and the room returned to the lobby."); }
    emitRoom(r);
  }
}
const PORT=process.env.PORT||3000;
server.listen(PORT,()=>console.log(`FRIEND PARTY running on ${PORT}`));
