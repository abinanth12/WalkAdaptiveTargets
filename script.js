
const modeSelect = document.getElementById("mode");
const postureSelect = document.getElementById("posture");
const startBtn = document.getElementById("startBtn");
const downloadBtn = document.getElementById("downloadBtn");
const gameArea = document.getElementById("gameArea");
const statusText = document.getElementById("status");

const trialText = document.getElementById("trial");
const hitsText = document.getElementById("hits");
const missesText = document.getElementById("misses");
const avgTimeText = document.getElementById("avgTime");

const TOTAL_TRIALS = 20;
const SMALL_SIZE = 44;
const LARGE_SIZE = 72;

let active = false;
let hits = 0;
let misses = 0;
let missesThisTrial = 0;
let trialStart = 0;
let results = [];

let experimentMode = "fixed";
let experimentPosture = "sitting";

function targetSize() {
  if (
    experimentMode === "adaptive" &&
    experimentPosture === "walking"
  ) {
    return LARGE_SIZE;
  }
  return SMALL_SIZE;
}

function updateStats() {
  trialText.textContent = `${hits}/${TOTAL_TRIALS}`;
  hitsText.textContent = hits;
  missesText.textContent = misses;

  const total = results.reduce(
    (sum, row) => sum + row.time_ms, 0
  );

  const average = hits ? total / hits : 0;
  avgTimeText.textContent = `${Math.round(average)} ms`;
}

function nextTarget() {
  if (hits >= TOTAL_TRIALS) {
    active = false;

    startBtn.disabled = false;
    modeSelect.disabled = false;
    postureSelect.disabled = false;
    downloadBtn.disabled = false;

    statusText.textContent =
      "Experiment complete! Download your CSV.";
    return;
  }

  gameArea.replaceChildren();

  const size = targetSize();
  const width = gameArea.clientWidth;
  const height = gameArea.clientHeight;

  const x = Math.random() * Math.max(0, width - size);
  const y = Math.random() * Math.max(0, height - size);

  const target = document.createElement("button");
  target.type = "button";
  target.className = "target";
  target.setAttribute("aria-label", "Tap target");

  target.style.width = `${size}px`;
  target.style.height = `${size}px`;
  target.style.left = `${x}px`;
  target.style.top = `${y}px`;

  target.addEventListener("pointerdown", (event) => {
    event.stopPropagation();
    if (!active) return;

    const time = Math.round(
      performance.now() - trialStart
    );

    hits++;

    results.push({
      trial: hits,
      mode: experimentMode,
      activity: experimentPosture,
      target_size_px: size,
      time_ms: time,
      misses_before_hit: missesThisTrial
    });

    missesThisTrial = 0;
    nextTarget();
  });

  gameArea.appendChild(target);
  trialStart = performance.now();
  updateStats();
}

gameArea.addEventListener("pointerdown", (event) => {
  if (!active || event.target !== gameArea) return;

  misses++;
  missesThisTrial++;
  updateStats();
});

startBtn.addEventListener("click", () => {
  active = true;
  hits = 0;
  misses = 0;
  missesThisTrial = 0;
  results = [];

  experimentMode = modeSelect.value;
  experimentPosture = postureSelect.value;

  modeSelect.disabled = true;
  postureSelect.disabled = true;
  startBtn.disabled = true;
  downloadBtn.disabled = true;

  statusText.textContent =
    "Tap each blue circle as quickly and accurately as possible.";

  nextTarget();
});

downloadBtn.addEventListener("click", () => {
  if (!results.length) return;

  const columns = [
    "trial",
    "mode",
    "activity",
    "target_size_px",
    "time_ms",
    "misses_before_hit"
  ];

  const rows = results.map(row =>
    columns.map(key => row[key]).join(",")
  );

  const csv = [
    columns.join(","),
    ...rows
  ].join("\r\n");

  const blob = new Blob([csv], {
    type: "text/csv;charset=utf-8"
  });

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = `walktap_${experimentMode}_${experimentPosture}.csv`;

  document.body.appendChild(link);
  link.click();
  link.remove();

  setTimeout(() => URL.revokeObjectURL(url), 1000);
});

updateStats();
