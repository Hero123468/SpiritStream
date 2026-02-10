```js
/* --------------------------------------------------------------
  OLD MANUAL CHAPTER LOADER (disabled for now)
  Keeping this for reference in case we want to
  reintroduce manual chapter loading later.
--------------------------------------------------------------

document.getElementById("loadBtn").addEventListener("click", async () => {
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
   Constants & Plan
-------------------------------------------------- */

const BIBLE_ID = "de4e12af7f28f599-01"; // KJV

const PLAN = [
  { id: "PSA", apiId: "PSA", name: "Psalms", start: 1, end: 150 },
  { id: "PRO", apiId: "PRO", name: "Proverbs", start: 1, end: 31 },
  { id: "ACT", apiId: "ACT", name: "Acts", start: 1, end: 28 },
  { id: "CH1", apiId: "1CH", name: "1 Chronicles", start: 1, end: 29 }
];


/* --------------------------------------------------
   Global State
-------------------------------------------------- */

let currentText = "";
let utterance = null;
let isSpeaking = false;
let isPaused = false;
let playlistIndex = 0;
let progressInterval = null;

// progress structure:
// {
//   lastPlayed: "2025-02-10",
//   PSA: 1,
//   PRO: 1,
//   ACT: 1,
//   CH1: 1
// }
let progress = JSON.parse(localStorage.getItem("bibleTTS_progress") || "{}");


/* --------------------------------------------------
   Utility
-------------------------------------------------- */

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function ensureProgressInitialized() {
  PLAN.forEach(entry => {
    if (typeof progress[entry.id] !== "number") {
      progress[entry.id] = entry.start;
    }
  });
  if (!progress.lastPlayed) {
    progress.lastPlayed = todayISO();
  }
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
} else {
  toggleThemeBtn.textContent = "Dark Mode";
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
   Chapter Fetching (Original API)
-------------------------------------------------- */

async function fetchChapterForEntry(entry) {
  const chapterNum = progress[entry.id];
  const chapterId = `${entry.apiId}.${chapterNum}`;

  chapterTextDiv.textContent = "Loading…";
  playStatus.textContent = `Loading ${entry.name} ${chapterNum}…`;
  playStatus.className = "status";

  try {
    const res = await fetch(`/chapter?bibleId=${BIBLE_ID}&chapterId=${chapterId}`);

    if (!res.ok) throw new Error("HTTP " + res.status);

    const data = await res.json();
    const tmp = document.createElement("div");
    tmp.innerHTML = data.data.content;

    currentText = tmp.textContent.trim();
    chapterTextDiv.textContent = currentText;

    playStatus.textContent = `Ready: ${entry.name} ${chapterNum}`;
    playStatus.className = "status";
  } catch (e) {
    chapterTextDiv.textContent = "Error loading chapter.";
    playStatus.textContent = "❌ " + e.message;
    playStatus.className = "status error";
    throw e;
  }
}


/* --------------------------------------------------
   Load Current Track in Playlist
-------------------------------------------------- */

async function loadToday() {
  ensureProgressInitialized();
  const entry = PLAN[playlistIndex];
  await fetchChapterForEntry(entry);
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
  const entry = PLAN[playlistIndex];
  const chapterNum = progress[entry.id];

  /* ------------------------------
     On Start
  ------------------------------ */
  u.onstart = () => {
    isSpeaking = true;
    isPaused = false;
    pauseBtn.textContent = "Pause";
    playStatus.textContent = `Reading ${entry.name} ${chapterNum} (track ${playlistIndex + 1} of ${PLAN.length})…`;
    playStatus.className = "status";

    // Reset progress visuals
    progressBar.style.width = "0%";
    progressBar.classList.remove("complete");
    resetRing();

    // Update playlist bar
    updatePlaylistProgress();

    // Start progress tracking
    clearInterval(progressInterval);
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
      // Move to next track in today's playlist
      await loadToday();
      speak();
    } else {
      // Finished all 4 tracks for today
      playStatus.textContent = "Daily playlist complete.";
      playStatus.className = "status success";

      // Advance chapter counters for each plan entry (Pattern B)
      PLAN.forEach(entry => {
        let nextChapter = progress[entry.id] + 1;
        if (nextChapter > entry.end) nextChapter = entry.start;
        progress[entry.id] = nextChapter;
      });

      progress.lastPlayed = todayISO();
      saveProgress();

      // Reset playlist for next session
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

  ensureProgressInitialized();

  try {
    await loadToday();
    speak();
  } catch (e) {
    // Error already handled in fetchChapterForEntry
  }
};

pauseBtn.onclick = () => {
  if (!speechSynthesis.speaking) return;

  if (!isPaused) {
    speechSynthesis.pause();
    isPaused = true;
    pauseBtn.textContent = "Resume";
    playStatus.textContent = "Paused.";
    playStatus.className = "status";
  } else {
    speechSynthesis.resume();
    isPaused = false;
    pauseBtn.textContent = "Pause";

    const entry = PLAN[playlistIndex];
    const chapterNum = progress[entry.id];
    playStatus.textContent = `Reading ${entry.name} ${chapterNum} (track ${playlistIndex + 1} of ${PLAN.length})…`;
    playStatus.className = "status";
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
  playStatus.className = "status";
};

nextBtn.onclick = async () => {
  // Force skip to next track in today's playlist
  speechSynthesis.cancel();
  isPaused = false;
  isSpeaking = false;
  pauseBtn.textContent = "Pause";

  clearInterval(progressInterval);
  progressBar.style.width = "0%";
  resetRing();

  playlistIndex++;
  if (playlistIndex >= PLAN.length) {
    // If user forces next past last track, wrap to first track
    playlistIndex = 0;
  }

  try {
    await loadToday();
    speak();
  } catch (e) {
    // Error already handled
  }
};


/* --------------------------------------------------
   Initial Setup
-------------------------------------------------- */

ensureProgressInitialized();
updatePlaylistProgress();
chapterTextDiv.textContent = "No text loaded.";
playStatus.textContent = "Ready when you are.";
playStatus.className = "status";
```