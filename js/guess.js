// מצב "נחשו את המדינה": מציגים דגל+שם, הילד/ה לוחצ/ת על המדינה הנכונה במפה.
window.App = window.App || {};

App.Guess = (function () {
  const ROOT_ID = "view-guess";
  const MAX_MISSES_BY_DIFFICULTY = { קל: 4, בינוני: 3, קשה: 2 };

  let order = [];
  let idx = 0;
  let score = 0;
  let misses = 0;
  let maxMisses = 3;
  let hintLevel = 0;
  let locked = false;
  let currentContinent = "world";
  let currentDifficulty = "בינוני";
  let currentPracticeWeak = false;

  function start(continent, difficulty, practiceWeak) {
    currentContinent = continent;
    currentDifficulty = difficulty;
    currentPracticeWeak = !!practiceWeak;
    maxMisses = MAX_MISSES_BY_DIFFICULTY[difficulty] || 3;

    const basePool = filterCountries(continent, difficulty);
    const pool = currentPracticeWeak ? App.Progress.getWeakCountries(basePool, basePool.length) : basePool;
    const total = Math.min(10, pool.length);
    order = shuffle(pool).slice(0, total);
    idx = 0;
    score = 0;
    locked = false;

    document.getElementById(ROOT_ID).innerHTML = `
      <div class="game-topbar">
        <span class="badge">🎯 נחשו את המדינה</span>
        <span class="badge" id="guess-progress"></span>
        <span class="badge" id="guess-score"></span>
        <span class="badge" id="guess-tries"></span>
        <span class="badge badge-streak" id="guess-streak" hidden></span>
      </div>
      <div class="prompt-card">
        <div class="prompt-flag" id="guess-flag"></div>
        <div class="prompt-name">
          <span id="guess-name"></span>
          ${App.Speech.isSupported() ? '<button class="btn-speak" id="guess-speak-btn" aria-label="הקריאו את שם המדינה">🔊</button>' : ""}
        </div>
        <button class="btn-hint" id="guess-hint-btn">💡 קבלו רמז</button>
        <div class="hint-text" id="guess-hint-text"></div>
      </div>
      <div class="feedback-msg" id="guess-feedback"></div>
      <div class="map-container" id="guess-map"></div>
    `;

    App.Map.render(document.getElementById("guess-map"));
    App.Map.setActiveContinent(continent, difficulty);
    App.Map.bindClick(onCountryClick);
    document.getElementById("guess-hint-btn").addEventListener("click", onHintClick);
    const speakBtn = document.getElementById("guess-speak-btn");
    if (speakBtn) speakBtn.addEventListener("click", () => App.Speech.speak(order[idx].name_he));

    App.Mascot.say("מוכנים? מצאו את המדינה על המפה! 🗺️");
    nextRound();
  }

  function nextRound() {
    locked = false;
    misses = 0;
    hintLevel = 0;
    App.Map.clearStates();
    App.Map.clearLabels();
    App.Map.resetView();
    const fb = document.getElementById("guess-feedback");
    fb.textContent = "";
    fb.className = "feedback-msg";

    if (idx >= order.length) return endGame();

    const country = order[idx];
    document.getElementById("guess-progress").textContent = `שאלה ${idx + 1} מתוך ${order.length}`;
    document.getElementById("guess-score").textContent = `ניקוד: ${score}`;
    document.getElementById("guess-tries").textContent = `ניסיונות שנותרו: ${maxMisses - misses}`;
    document.getElementById("guess-flag").innerHTML = flagHtml(country.id);
    document.getElementById("guess-name").textContent = country.name_he;

    const hintBtn = document.getElementById("guess-hint-btn");
    hintBtn.disabled = false;
    hintBtn.hidden = false;
    hintBtn.textContent = "💡 קבלו רמז";
    document.getElementById("guess-hint-text").innerHTML = "";
  }

  // רמז דו-שלבי: קודם יבשת (+ זום חזותי אם המפה עדיין בתצוגת עולם), ואז - אם עדיין לא
  // פתרו - שכנה שגובלת בה, או לחלופין האות הראשונה של הבירה למדינות אי בלי גבול יבשתי.
  function onHintClick() {
    if (locked || idx >= order.length || hintLevel >= 2) return;
    hintLevel++;
    const country = order[idx];
    const hintTextEl = document.getElementById("guess-hint-text");
    const hintBtn = document.getElementById("guess-hint-btn");

    if (hintLevel === 1) {
      hintTextEl.innerHTML = `<div>🌍 נמצאת ביבשת ${country.continent}</div>`;
      if (currentContinent === "world") App.Map.focusCountry(country.id, 3);
      hintBtn.textContent = "💡 רמז נוסף?";
    } else {
      const neighbors = (country.borders || []).map((id) => COUNTRIES_BY_ID[id]).filter(Boolean);
      const extra = neighbors.length
        ? `🧭 גובלת ב${randomChoice(neighbors).name_he}`
        : `🏛️ שם הבירה שלה מתחיל באות "${country.capital_he.charAt(0)}"`;
      hintTextEl.innerHTML += `<div>${extra}</div>`;
      hintBtn.disabled = true;
    }
  }

  function updateStreakBadge(streak) {
    const el = document.getElementById("guess-streak");
    if (streak >= 2) {
      el.hidden = false;
      el.textContent = `🔥 רצף: ${streak}`;
    } else {
      el.hidden = true;
    }
  }

  function onCountryClick(id) {
    if (locked || idx >= order.length) return;
    const country = order[idx];
    const fb = document.getElementById("guess-feedback");

    if (id === country.id) {
      locked = true;
      App.Map.setState(id, "correct");
      App.Map.setLabel(id, country.name_he);
      App.Audio.success();
      const streak = App.Progress.recordAnswer(country.id, true);
      updateStreakBadge(streak);
      if (streak > 0 && streak % 3 === 0) {
        App.Audio.milestoneFlourish();
        App.Confetti.burst();
        App.Mascot.say(`רצף מדהים! ${streak} נכונות ברצף! 🔥`);
      }
      fb.textContent = "כל הכבוד! 🎉";
      fb.className = "feedback-msg good";
      score++;
      idx++;
      setTimeout(nextRound, 1000);
      return;
    }

    misses++;
    App.Progress.recordAnswer(country.id, false);
    updateStreakBadge(0);
    document.getElementById("guess-tries").textContent = `ניסיונות שנותרו: ${Math.max(maxMisses - misses, 0)}`;
    App.Map.setState(id, "wrong");
    App.Audio.fail();
    setTimeout(() => App.Map.removeState(id, "wrong"), 400);

    if (misses >= maxMisses) {
      locked = true;
      fb.textContent = `זו הייתה ${country.name_he}. נעבור לבאה!`;
      fb.className = "feedback-msg bad";
      App.Map.setState(country.id, "correct");
      App.Map.setLabel(country.id, country.name_he);
      document.getElementById("guess-hint-btn").disabled = true;
      idx++;
      setTimeout(nextRound, 1600);
    } else {
      fb.textContent = "לא בדיוק, נסו שוב! 🤔";
      fb.className = "feedback-msg bad";
    }
  }

  function endGame() {
    const ratio = order.length ? score / order.length : 0;
    if (ratio === 1) App.Audio.perfectScore();
    App.Mascot.say(ratio >= 0.8 ? "כל הכבוד, ידע מעולה על העולם! 🌟" : "יפה מאוד, ממשיכים להתאמן! 💪");
    document.getElementById(ROOT_ID).innerHTML = `
      <div class="end-screen">
        <div class="end-emoji">🏆</div>
        <div class="end-score">ניקוד: ${score} מתוך ${order.length}</div>
        <div id="guess-end-actions"></div>
      </div>
    `;
    App.Menu.renderEndActions(document.getElementById("guess-end-actions"), "guess", () =>
      start(currentContinent, currentDifficulty, currentPracticeWeak)
    );
  }

  return { start };
})();
