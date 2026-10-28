// --- Edit these for your demo ---
const START_TOTAL = 15812;
const PAGE_COUNT_AFTER_MS = 600;   // set to 0 to start the page count immediately
const PAGE_COUNT_VALUE = 7;        // what "on this page" animates up to
// --------------------------------

const $ = (id) => document.getElementById(id);

// Show the real hostname of the active tab
chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
  try { $("site").textContent = new URL(tabs[0].url).hostname.replace(/^www\./, ""); }
  catch { /* keep placeholder */ }
});

$("closeBanner").onclick = () => $("banner").classList.add("hidden");

// Fake count-up so the demo looks alive
let page = 0;
setTimeout(() => {
  const t = setInterval(() => {
    page++;
    $("pageCount").textContent = page;
    $("totalCount").textContent = (START_TOTAL + page).toLocaleString();
    if (page >= PAGE_COUNT_VALUE) clearInterval(t);
  }, 120);
}, PAGE_COUNT_AFTER_MS);

// Pause toggle
let paused = false;
$("pause").onclick = () => {
  paused = !paused;
  document.querySelector(".card").classList.toggle("paused", paused);
  $("pauseText").textContent = paused ? "Resume on this site" : "Pause on this site";
  $("pauseIcon").innerHTML = paused ? "&#9654;" : "&#10074;&#10074;";
};
