/* --------------------------------------------------------------
  OLD MANUAL CHAPTER LOADER (disabled for now)
  Keeping this for reference in case we want to
  reintroduce manual chapter loading later.
-------------------------------------------------------------- */

/*document.getElementById("loadBtn").addEventListener("click", async () => {
  const bibleId = document.getElementById("bibleId").value.trim();
  const chapterId = document.getElementById("chapterId").value.trim();
  const chapterTextDiv = document.getElementById("chapterText");

  chapterTextDiv.textContent = "Loading…";

  try {
    const res = await fetch(`/chapter?bibleId=${bibleId}&chapterId=${chapterId}`);
    const data = await res.json();

    const tmp = document.createElement("div");
    tmp.innerHTML = data.data.content;

    chapterTextDiv.textContent = tmp.textContent.trim();
  } catch (e) {
    chapterTextDiv.textContent = "Error loading chapter.";
  }
});
-------------------------------------------------------------- */
/* --------------------------------------------------
   Global State
-------------------------------------------------- */

let currentText = "";
let utterance = null;
let isSpeaking = false;
let isPaused = false;
let playlistIndex = 0;
let progressInterval = null;

const PLAN = [
  { book: "Genesis", chapter: 1 },
  { book: "Matthew", chapter: 1 },
  { book: "Psalms", chapter: 1 },
  { book: "Acts", chapter: 1 }
];

let progress = JSON.parse(localStorage.getItem("bibleTTS_progress") || "{}");


/* --------------------------------------------------
   Utility
-------------------------------------------------- */

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function saveProgress() {
  localStorage.setItem("bibleTTS_progress", JSON.stringify(progress));
}


/* --------------------------------------------------
   DOM Elements
-------------------------------------------------- */

const playBtn = document.getElementById("play");
const pauseBtn = document.getElementById("pause");
const stopBtn = document.getElementById("stop");
const nextBtn = document.getElementById("next");
const playStatus = document.getElementById("playStatus");
const chapterTextDiv = document.getElementById("chapterText");

const progressBar = document.getElementById("progressBar");
const playlistProgressBar = document.getElementById("playlistProgressBar");
const playRingCircle = document.querySelector("#playRing circle");

const toggleThemeBtn = document.getElementById("toggleTheme");


/* --------------------------------------------------
   Theme Persistence
-------------------------------------------------- */

const savedTheme = localStorage.getItem("bibleTTS_theme");
if (savedTheme === "dark") {
  document.body.classList.add("dark");
  toggleThemeBtn.textContent = "Light Mode";
}

toggleThemeBtn.onclick = () => {
  document.body.classList.toggle("dark");
  const mode = document.body.classList.contains("dark") ? "dark" : "light";
  toggleThemeBtn.textContent = mode === "dark" ? "Light Mode" : "Dark Mode";
  localStorage.setItem("bibleTTS_theme", mode);
};


/* --------------------------------------------------
   Playlist Progress Bar
-------------------------------------------------- */

function updatePlaylistProgress() {
  const percent = (playlistIndex / PLAN.length) * 100;
  playlistProgressBar.style.width = percent + "%";
}


/* --------------------------------------------------
   Circular Play Button Ring
-------------------------------------------------- */

const RING_CIRCUMFERENCE = 214;

function resetRing() {
  playRingCircle.style.strokeDashoffset = RING_CIRCUMFERENCE;
}

function updateRing(percent) {
  const offset = RING_CIRCUMFERENCE - (percent / 100) * RING_CIRCUMFERENCE;
  playRingCircle.style.strokeDashoffset = offset;
}


/* --------------------------------------------------
   Load Chapter Text
-------------------------------------------------- */

async function loadToday() {
  const entry = PLAN[playlistIndex];
  const url = `https://bible-api.com/${entry.book}%20${entry.chapter}`;

  const res = await fetch(url);
  const data = await res.json();

  currentText = data.text;
  chapterTextDiv.textContent = currentText;
}


/* --------------------------------------------------
   Speak Function (TTS + Progress Bars)
-------------------------------------------------- */

function speak() {
  if (!currentText) {
    playStatus.textContent = "No text loaded.";
    playStatus.className = "status error";
    return;
  }

  utterance = new SpeechSynthesisUtterance(currentText);
  const u = utterance;

  /* ------------------------------
     On Start
  ------------------------------ */
  u.onstart = () => {
    isSpeaking = true;
    isPaused = false;
    pauseBtn.textContent = "Pause";
    playStatus.textContent = `Reading track ${playlistIndex + 1}…`;
    playStatus.className = "status";

    // Reset progress visuals
    progressBar.style.width = "0%";
    progressBar.classList.remove("complete");
    resetRing();

    // Update playlist bar
    updatePlaylistProgress();

    // Start progress tracking
    progressInterval = setInterval(() => {
      if (!u || !u.text) return;

      const spoken = speechSynthesis.speaking && !speechSynthesis.paused;
      if (!spoken) return;

      const total = u.text.length;
      const current = u.charIndex || 0;
      const percent = (current / total) * 100;

      progressBar.style.width = percent + "%";
      updateRing(percent);
    }, 100);
  };

  /* ------------------------------
     On End
  ------------------------------ */
  u.onend = async () => {
    isSpeaking = false;

    if (isPaused) return;

    clearInterval(progressInterval);
    progressBar.style.width = "100%";
    progressBar.classList.add("complete");
    updateRing(100);

    playlistIndex++;

    if (playlistIndex < PLAN.length) {
      await loadToday();
      speak();
    } else {
      playStatus.textContent = "Daily playlist complete.";
      playStatus.className = "status success";

      progress.lastPlayed = todayISO();
      saveProgress();

      playlistIndex = 0;
      updatePlaylistProgress();
    }
  };

  speechSynthesis.cancel();
  speechSynthesis.speak(u);
}


/* --------------------------------------------------
   Controls
-------------------------------------------------- */

playBtn.onclick = async () => {
  speechSynthesis.cancel();
  isPaused = false;
  isSpeaking = false;
  pauseBtn.textContent = "Pause";

  const today = todayISO();
  const finishedToday = progress.lastPlayed === today;

  if (!finishedToday && playlistIndex === 0) {
    await loadToday();
  }

  speak();
};

pauseBtn.onclick = () => {
  if (!isSpeaking && !speechSynthesis.speaking) return;

  if (!isPaused) {
    speechSynthesis.pause();
    isPaused = true;
    pauseBtn.textContent = "Resume";
    playStatus.textContent = "Paused.";
  } else {
    speechSynthesis.resume();
    isPaused = false;
    pauseBtn.textContent = "Pause";
    playStatus.textContent = `Reading track ${playlistIndex + 1}…`;
  }
};

stopBtn.onclick = () => {
  speechSynthesis.cancel();
  isSpeaking = false;
  isPaused = false;
  pauseBtn.textContent = "Pause";

  clearInterval(progressInterval);
  progressBar.style.width = "0%";
  resetRing();

  playStatus.textContent = "Stopped.";
};

nextBtn.onclick = async () => {
  speechSynthesis.cancel();
  isPaused = false;
  isSpeaking = false;
  pauseBtn.textContent = "Pause";

  clearInterval(progressInterval);
  progressBar.style.width = "0%";
  resetRing();

  playlistIndex++;
  if (playlistIndex >= PLAN.length) playlistIndex = 0;

  await loadToday();
  speak();
};
