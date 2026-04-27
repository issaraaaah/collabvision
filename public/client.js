// Éléments DOM
const video = document.getElementById('video');
const startCamBtn = document.getElementById('startCam');
const stopCamBtn = document.getElementById('stopCam');
const startScreenBtn = document.getElementById('startScreen');
const stopScreenBtn = document.getElementById('stopScreen');
const recordCamBtn = document.getElementById('recordCam');
const recordScreenBtn = document.getElementById('recordScreen');
const stopRecordBtn = document.getElementById('stopRecord');
const downloadRecordBtn = document.getElementById('downloadRecord');
const recordingStatus = document.getElementById('recordingStatus');
const noteEditor = document.getElementById('noteEditor');
const exportNoteBtn = document.getElementById('exportNote');
const showHistoryBtn = document.getElementById('showHistory');
const historyPanel = document.getElementById('historyPanel');
const historyList = document.getElementById('historyList');
const userNameInput = document.getElementById('userName');
const roomIdInput = document.getElementById('roomId');
const joinRoomBtn = document.getElementById('joinRoom');
const leaveRoomBtn = document.getElementById('leaveRoom');
const connectionStatusSpan = document.getElementById('connectionStatus');
const usersList = document.getElementById('users');

// Variables globales
let cameraStream = null;
let screenStream = null;
let mediaRecorder = null;
let recordedChunks = [];
let currentRecordingType = null; // 'camera' ou 'screen'

let socket = null;
let currentRoom = null;
let currentUser = null;

// Gestion de la caméra
startCamBtn.onclick = async () => {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    cameraStream = stream;
    video.srcObject = stream;
    startCamBtn.disabled = true;
    stopCamBtn.disabled = false;
    recordCamBtn.disabled = false;
  } catch (err) {
    console.error('Erreur caméra:', err);
    alert('Impossible d\'accéder à la caméra.');
  }
};

stopCamBtn.onclick = () => {
  if (cameraStream) {
    cameraStream.getTracks().forEach(track => track.stop());
    cameraStream = null;
    video.srcObject = null;
    startCamBtn.disabled = false;
    stopCamBtn.disabled = true;
    recordCamBtn.disabled = true;
    // Si on enregistrait la caméra, arrêter l'enregistrement
    if (currentRecordingType === 'camera') stopRecording();
  }
};

// Partage d'écran
startScreenBtn.onclick = async () => {
  try {
    const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
    screenStream = stream;
    video.srcObject = stream;
    startScreenBtn.disabled = true;
    stopScreenBtn.disabled = false;
    recordScreenBtn.disabled = false;

    // Détecter la fin du partage (l'utilisateur clique sur "Arrêter" dans le browser)
    stream.getVideoTracks()[0].onended = () => {
      stopScreenShare();
    };
  } catch (err) {
    console.error('Erreur partage écran:', err);
    alert('Partage d\'écran annulé ou non supporté.');
  }
};

stopScreenBtn.onclick = () => stopScreenShare();

function stopScreenShare() {
  if (screenStream) {
    screenStream.getTracks().forEach(track => track.stop());
    screenStream = null;
    video.srcObject = cameraStream; // si caméra active, on la remet
    startScreenBtn.disabled = false;
    stopScreenBtn.disabled = true;
    recordScreenBtn.disabled = true;
    if (currentRecordingType === 'screen') stopRecording();
  }
}

// Enregistrement
recordCamBtn.onclick = () => startRecording('camera');
recordScreenBtn.onclick = () => startRecording('screen');

function startRecording(type) {
  let stream = type === 'camera' ? cameraStream : screenStream;
  if (!stream) {
    alert(`Veuillez d'abord activer ${type === 'camera' ? 'la caméra' : 'le partage d\'écran'}.`);
    return;
  }
  if (mediaRecorder && mediaRecorder.state === 'recording') {
    alert('Un enregistrement est déjà en cours.');
    return;
  }

  recordedChunks = [];
  mediaRecorder = new MediaRecorder(stream);
  mediaRecorder.ondataavailable = (event) => {
    if (event.data.size > 0) recordedChunks.push(event.data);
  };
  mediaRecorder.onstop = () => {
    recordingStatus.innerText = 'Enregistrement terminé.';
    downloadRecordBtn.disabled = false;
    currentRecordingType = null;
    // Sauvegarde des métadonnées dans localStorage
    const blob = new Blob(recordedChunks, { type: 'video/webm' });
    const url = URL.createObjectURL(blob);
    const timestamp = new Date().toISOString();
    const fileName = `recording_${timestamp}.webm`;
    const metadata = {
      name: fileName,
      date: timestamp,
      size: blob.size,
      type: currentRecordingType
    };
    let recordings = JSON.parse(localStorage.getItem('recordings') || '[]');
    recordings.push(metadata);
    localStorage.setItem('recordings', JSON.stringify(recordings));
    // Stocker temporairement le blob pour téléchargement
    window.currentRecordBlob = blob;
    window.currentRecordFileName = fileName;
  };

  mediaRecorder.start();
  currentRecordingType = type;
  recordingStatus.innerText = `Enregistrement ${type === 'camera' ? 'caméra' : 'écran'} en cours...`;
  recordCamBtn.disabled = true;
  recordScreenBtn.disabled = true;
  stopRecordBtn.disabled = false;
  downloadRecordBtn.disabled = true;
}

stopRecordBtn.onclick = () => stopRecording();

function stopRecording() {
  if (mediaRecorder && mediaRecorder.state === 'recording') {
    mediaRecorder.stop();
    stopRecordBtn.disabled = true;
    recordCamBtn.disabled = !cameraStream;
    recordScreenBtn.disabled = !screenStream;
  }
}

downloadRecordBtn.onclick = () => {
  if (window.currentRecordBlob) {
    const link = document.createElement('a');
    link.href = URL.createObjectURL(window.currentRecordBlob);
    link.download = window.currentRecordFileName;
    link.click();
    URL.revokeObjectURL(link.href);
  } else {
    alert('Aucun enregistrement disponible.');
  }
};

// ================= NOTES avec localStorage et historique =================
let noteHistory = []; // max 10 éléments
const NOTE_STORAGE_KEY = 'collabvision_note';
const HISTORY_STORAGE_KEY = 'collabvision_note_history';

function loadNoteFromLocalStorage() {
  const savedNote = localStorage.getItem(NOTE_STORAGE_KEY);
  if (savedNote !== null) noteEditor.value = savedNote;
  const savedHistory = localStorage.getItem(HISTORY_STORAGE_KEY);
  if (savedHistory) {
    noteHistory = JSON.parse(savedHistory);
    updateHistoryUI();
  }
}

function saveNoteToLocalStorage() {
  const content = noteEditor.value;
  localStorage.setItem(NOTE_STORAGE_KEY, content);
  // Ajouter à l'historique si différent de la dernière version
  if (noteHistory.length === 0 || noteHistory[0].content !== content) {
    noteHistory.unshift({
      content: content,
      date: new Date().toLocaleString()
    });
    if (noteHistory.length > 10) noteHistory.pop();
    localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(noteHistory));
    updateHistoryUI();
  }
}

function updateHistoryUI() {
  historyList.innerHTML = '';
  noteHistory.forEach((item, idx) => {
    const li = document.createElement('li');
    li.textContent = `${item.date} : ${item.content.substring(0, 50)}${item.content.length > 50 ? '...' : ''}`;
    li.onclick = () => {
      noteEditor.value = item.content;
      saveNoteToLocalStorage(); // Sauvegarder la version restaurée comme actuelle
    };
    historyList.appendChild(li);
  });
}

// Sauvegarde automatique toutes les 2 secondes
let autosaveInterval = setInterval(() => {
  saveNoteToLocalStorage();
}, 2000);

exportNoteBtn.onclick = () => {
  const content = noteEditor.value;
  const blob = new Blob([content], { type: 'text/plain' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `notes_${new Date().toISOString()}.txt`;
  link.click();
  URL.revokeObjectURL(link.href);
};

showHistoryBtn.onclick = () => {
  if (historyPanel.style.display === 'none') {
    historyPanel.style.display = 'block';
    showHistoryBtn.textContent = 'Masquer historique';
  } else {
    historyPanel.style.display = 'none';
    showHistoryBtn.textContent = '📜 Historique';
  }
};

// Initialisation des notes
loadNoteFromLocalStorage();

// ================= COLLABORATION WEBSOCKET =================
function connectToRoom() {
  if (socket) {
    if (currentRoom) leaveRoom();
    socket.disconnect();
  }
  socket = io();
  currentUser = userNameInput.value.trim() || 'Anonyme';
  currentRoom = roomIdInput.value.trim();
  if (!currentRoom) {
    alert('Veuillez entrer un nom de salle.');
    return;
  }
  socket.emit('join-room', { roomId: currentRoom, userName: currentUser });
  socket.on('note-update', (newNote) => {
    // Mettre à jour l'éditeur sans déclencher de boucle
    if (noteEditor.value !== newNote) {
      noteEditor.value = newNote;
      saveNoteToLocalStorage(); // Sauvegarde locale de la version reçue
    }
  });
  socket.on('user-list', (users) => {
    usersList.innerHTML = users.map(u => `<li>${escapeHtml(u)}</li>`).join('');
  });
  socket.on('connect_error', (err) => {
    console.error('Erreur socket:', err);
    connectionStatusSpan.innerText = 'Erreur de connexion';
  });
  connectionStatusSpan.innerText = `Connecté à la salle "${currentRoom}"`;
  joinRoomBtn.disabled = true;
  leaveRoomBtn.disabled = false;
}

function leaveRoom() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
  currentRoom = null;
  connectionStatusSpan.innerText = 'Non connecté';
  usersList.innerHTML = '';
  joinRoomBtn.disabled = false;
  leaveRoomBtn.disabled = true;
}

joinRoomBtn.onclick = connectToRoom;
leaveRoomBtn.onclick = leaveRoom;

// Synchronisation des notes : quand l'utilisateur tape, on envoie à la salle
noteEditor.addEventListener('input', () => {
  if (socket && currentRoom) {
    socket.emit('note-change', { roomId: currentRoom, newNote: noteEditor.value });
  }
  // La sauvegarde locale est déjà faite par l'intervalle, mais on peut la forcer ici pour plus de réactivité
  saveNoteToLocalStorage();
});

// Petit utilitaire pour éviter les injections XSS
function escapeHtml(str) {
  return str.replace(/[&<>]/g, function(m) {
    if (m === '&') return '&amp;';
    if (m === '<') return '&lt;';
    if (m === '>') return '&gt;';
    return m;
  });
}