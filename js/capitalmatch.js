// מצב "התאימו בירות": לחיצה על מדינה ואז על הבירה שמתאימה לה (אותו מנגנון כמו התאימו דגלים).
window.App = window.App || {};

App.CapitalMatch = (function () {
  const ROOT_ID = "view-capitalmatch";
  const PAIRS_BY_DIFFICULTY = { קל: 4, בינוני: 6, קשה: 8 };

  let pairs = [];
  let selectedCountryId = null;
  let selectedCapitalId = null;
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
    selectedCountryId = null;
    selectedCapitalId = null;
    matchedCount = 0;
    moves = 0;
    locked = false;
    render();
    App.Mascot.say("התאימו כל מדינה לבירה שלה! 🏙️");
  }

  function render() {
    document.getElementById(ROOT_ID).innerHTML = `
      <div class="game-topbar">
        <span class="badge">🏙️ התאימו בירות</span>
        <span class="badge" id="cm-progress">זוגות: 0 מתוך ${pairs.length}</span>
        <span class="badge" id="cm-moves">מהלכים: 0</span>
      </div>
      <p class="setup-subtitle" style="text-align:center">לחצו על מדינה, ואז על הבירה שמתאימה לה</p>
      <div class="match-board">
        <div class="match-col" id="cm-countries"></div>
        <div class="match-col" id="cm-capitals"></div>
      </div>
    `;

    const countriesCol = document.getElementById("cm-countries");
    shuffle(pairs).forEach((c) => {
      const card = document.createElement("button");
      card.className = "match-card";
      card.dataset.id = c.id;
      card.dataset.type = "country";
      card.innerHTML = `${flagHtml(c.id)}<span class="match-name">${c.name_he}</span><span class="match-mark"></span>`;
      card.addEventListener("click", () => onCardClick(card, "country"));
      countriesCol.appendChild(card);
    });

    const capitalsCol = document.getElementById("cm-capitals");
    shuffle(pairs).forEach((c) => {
      const card = document.createElement("button");
      card.className = "match-card";
      card.dataset.id = c.id;
      card.dataset.type = "capital";
      card.innerHTML = `<span class="match-name">${c.capital_he}</span><span class="match-mark"></span>`;
      card.addEventListener("click", () => onCardClick(card, "capital"));
      capitalsCol.appendChild(card);
    });
  }

  function onCardClick(card, type) {
    if (locked || card.classList.contains("correct")) return;

    const currentSelectedId = type === "country" ? selectedCountryId : selectedCapitalId;
    if (currentSelectedId === card.dataset.id) {
      card.classList.remove("selected");
      if (type === "country") selectedCountryId = null;
      else selectedCapitalId = null;
      return;
    }

    clearSelection(type);
    card.classList.add("selected");
    if (type === "country") selectedCountryId = card.dataset.id;
    else selectedCapitalId = card.dataset.id;

    if (selectedCountryId && selectedCapitalId) evaluate();
  }

  function clearSelection(type) {
    document.querySelectorAll('.match-card[data-type="' + type + '"]').forEach((el) => el.classList.remove("selected"));
  }

  function cardFor(id, type) {
    return document.querySelector('.match-card[data-type="' + type + '"][data-id="' + id + '"]');
  }

  function evaluate() {
    moves++;
    document.getElementById("cm-moves").textContent = `מהלכים: ${moves}`;
    const countryCard = cardFor(selectedCountryId, "country");
    const capitalCard = cardFor(selectedCapitalId, "capital");

    if (selectedCountryId === selectedCapitalId) {
      App.Audio.success();
      const streak = App.Progress.recordAnswer(selectedCountryId, true);
      if (streak > 0 && streak % 3 === 0) {
        App.Audio.milestoneFlourish();
        App.Confetti.burst();
      }
      countryCard.classList.remove("selected");
      capitalCard.classList.remove("selected");
      countryCard.classList.add("correct");
      capitalCard.classList.add("correct");
      countryCard.querySelector(".match-mark").textContent = "✓";
      capitalCard.querySelector(".match-mark").textContent = "✓";
      matchedCount++;
      document.getElementById("cm-progress").textContent = `זוגות: ${matchedCount} מתוך ${pairs.length}`;
      selectedCountryId = null;
      selectedCapitalId = null;
      if (matchedCount === pairs.length) {
        locked = true;
        setTimeout(endGame, 800);
      }
    } else {
      App.Audio.fail();
      App.Progress.recordAnswer(selectedCountryId, false);
      App.Progress.recordAnswer(selectedCapitalId, false);
      locked = true;
      countryCard.classList.add("wrong");
      capitalCard.classList.add("wrong");
      countryCard.querySelector(".match-mark").textContent = "✗";
      capitalCard.querySelector(".match-mark").textContent = "✗";
      setTimeout(() => {
        countryCard.classList.remove("selected", "wrong");
        capitalCard.classList.remove("selected", "wrong");
        countryCard.querySelector(".match-mark").textContent = "";
        capitalCard.querySelector(".match-mark").textContent = "";
        selectedCountryId = null;
        selectedCapitalId = null;
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
        <div id="cm-end-actions"></div>
      </div>
    `;
    App.Menu.renderEndActions(document.getElementById("cm-end-actions"), "capitalmatch", () =>
      start(currentContinent, currentDifficulty, currentPracticeWeak)
    );
  }

  return { start };
})();
