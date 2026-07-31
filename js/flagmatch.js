// מצב "התאימו דגלים": לחיצה על דגל ואז על שם מדינה מתאים (ידידותי למגע, בלי גרירה).
window.App = window.App || {};

App.FlagMatch = (function () {
  const ROOT_ID = "view-flagmatch";
  const PAIRS_BY_DIFFICULTY = { קל: 4, בינוני: 6, קשה: 8 };

  let pairs = [];
  let selectedFlagId = null;
  let selectedNameId = null;
  let matchedCount = 0;
  let moves = 0;
  let locked = false;
  let currentContinent = "world";
  let currentDifficulty = "בינוני";
  let currentPracticeWeak = false;

  function start(continent, difficulty, practiceWeak) {
    currentContinent = continent;
    currentDifficulty = difficulty;
    currentPracticeWeak = !!practiceWeak;
    const pairCount = PAIRS_BY_DIFFICULTY[difficulty] || 6;
    const basePool = filterCountries(continent, difficulty);
    const pool = currentPracticeWeak ? App.Progress.getWeakCountries(basePool, basePool.length) : basePool;
    const count = Math.min(pairCount, pool.length);
    pairs = shuffle(pool).slice(0, count);
    selectedFlagId = null;
    selectedNameId = null;
    matchedCount = 0;
    moves = 0;
    locked = false;
    render();
    App.Mascot.say("התאימו כל דגל למדינה שלו! 🚩");
  }

  function render() {
    document.getElementById(ROOT_ID).innerHTML = `
      <div class="game-topbar">
        <span class="badge">🧩 התאימו דגלים</span>
        <span class="badge" id="fm-progress">זוגות: 0 מתוך ${pairs.length}</span>
        <span class="badge" id="fm-moves">מהלכים: 0</span>
      </div>
      <p class="setup-subtitle" style="text-align:center">לחצו על דגל, ואז על שם המדינה שמתאים לו</p>
      <div class="match-board">
        <div class="match-col" id="fm-flags"></div>
        <div class="match-col" id="fm-names"></div>
      </div>
    `;

    const flagsCol = document.getElementById("fm-flags");
    shuffle(pairs).forEach((c) => {
      const card = document.createElement("button");
      card.className = "match-card";
      card.dataset.id = c.id;
      card.dataset.type = "flag";
      card.innerHTML = `${flagHtml(c.id)}<span class="match-mark"></span>`;
      card.addEventListener("click", () => onCardClick(card, "flag"));
      flagsCol.appendChild(card);
    });

    const namesCol = document.getElementById("fm-names");
    shuffle(pairs).forEach((c) => {
      const card = document.createElement("button");
      card.className = "match-card";
      card.dataset.id = c.id;
      card.dataset.type = "name";
      card.innerHTML = `<span class="match-name">${c.name_he}</span><span class="match-mark"></span>`;
      card.addEventListener("click", () => onCardClick(card, "name"));
      namesCol.appendChild(card);
    });
  }

  function onCardClick(card, type) {
    if (locked || card.classList.contains("correct")) return;

    const currentSelectedId = type === "flag" ? selectedFlagId : selectedNameId;
    if (currentSelectedId === card.dataset.id) {
      card.classList.remove("selected");
      if (type === "flag") selectedFlagId = null;
      else selectedNameId = null;
      return;
    }

    clearSelection(type);
    card.classList.add("selected");
    if (type === "flag") selectedFlagId = card.dataset.id;
    else selectedNameId = card.dataset.id;

    if (selectedFlagId && selectedNameId) evaluate();
  }

  function clearSelection(type) {
    document.querySelectorAll('.match-card[data-type="' + type + '"]').forEach((el) => el.classList.remove("selected"));
  }

  function cardFor(id, type) {
    return document.querySelector('.match-card[data-type="' + type + '"][data-id="' + id + '"]');
  }

  function evaluate() {
    moves++;
    document.getElementById("fm-moves").textContent = `מהלכים: ${moves}`;
    const flagCard = cardFor(selectedFlagId, "flag");
    const nameCard = cardFor(selectedNameId, "name");

    if (selectedFlagId === selectedNameId) {
      App.Audio.success();
      const streak = App.Progress.recordAnswer(selectedFlagId, true);
      if (streak > 0 && streak % 3 === 0) {
        App.Audio.milestoneFlourish();
        App.Confetti.burst();
      }
      flagCard.classList.remove("selected");
      nameCard.classList.remove("selected");
      flagCard.classList.add("correct");
      nameCard.classList.add("correct");
      flagCard.querySelector(".match-mark").textContent = "✓";
      nameCard.querySelector(".match-mark").textContent = "✓";
      matchedCount++;
      document.getElementById("fm-progress").textContent = `זוגות: ${matchedCount} מתוך ${pairs.length}`;
      selectedFlagId = null;
      selectedNameId = null;
      if (matchedCount === pairs.length) {
        locked = true;
        setTimeout(endGame, 800);
      }
    } else {
      App.Audio.fail();
      App.Progress.recordAnswer(selectedFlagId, false);
      App.Progress.recordAnswer(selectedNameId, false);
      locked = true;
      flagCard.classList.add("wrong");
      nameCard.classList.add("wrong");
      flagCard.querySelector(".match-mark").textContent = "✗";
      nameCard.querySelector(".match-mark").textContent = "✗";
      setTimeout(() => {
        flagCard.classList.remove("selected", "wrong");
        nameCard.classList.remove("selected", "wrong");
        flagCard.querySelector(".match-mark").textContent = "";
        nameCard.querySelector(".match-mark").textContent = "";
        selectedFlagId = null;
        selectedNameId = null;
        locked = false;
      }, 700);
    }
  }

  function endGame() {
    if (moves === pairs.length) App.Audio.perfectScore();
    App.Mascot.say(moves <= pairs.length + 2 ? "וואו, כמעט בלי טעויות! מדהים! 🌟" : "כל הכבוד, סיימתם את כל הזוגות! 🎉");
    document.getElementById(ROOT_ID).innerHTML = `
      <div class="end-screen">
        <div class="end-emoji">🎉</div>
        <div class="end-score">התאמתם את כל הזוגות ב-${moves} מהלכים!</div>
        <div id="fm-end-actions"></div>
      </div>
    `;
    App.Menu.renderEndActions(document.getElementById("fm-end-actions"), "flagmatch", () =>
      start(currentContinent, currentDifficulty, currentPracticeWeak)
    );
  }

  return { start };
})();
