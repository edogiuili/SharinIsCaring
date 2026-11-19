// Shared by index.html (the game) and vote.html (the phone page).
// While `server` still contains "YOUR_", the game runs without live voting (show of hands instead).
window.OQ_LIVE = {
  // Address printed by `npx wrangler deploy` (see worker/).
  server: "https://occams-quest.edogiuili.workers.dev",
  // Public address of vote.html. Only used when you open the game from your disk (file://);
  // when the game runs on GitHub Pages, the QR code points to the vote.html next to it.
  voteUrl: "https://edogiuili.github.io/SharinIsCaring/vote.html",
};
