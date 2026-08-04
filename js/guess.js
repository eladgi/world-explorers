// מצב "נחשו את המדינה": מציגים דגל+שם, הילד/ה לוחצ/ת על המדינה הנכונה במפה.
// ההנחיה יושבת בפאנל צדדי (מעל המפה בטלפון, לצידה במסך רחב) כדי שהמפה תישאר גדולה.
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
  let streak = 0;
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
    streak = 0;
    locked = false;

    document.getElementById(ROOT_ID).innerHTML = `
      <div id="guess-hud"></div>
      <div class="game-cols">
        <div class="game-side">
          <div class="panel centered">
            <div class="prompt-label">מצאו את המדינה הזו על המפה</div>
            <div class="prompt-flag" id="guess-flag"></div>
            <div class="prompt-name-row">
              <span class="prompt-name" id="guess-name"></span>
              ${App.Speech.isSupported() ? '<button class="btn-speak" id="guess-speak-btn" aria-label="הקריאו את שם המדינה">🔊</button>' : ""}
            </div>
            <button class="btn-hint" id="guess-hint-btn">💡 קבלו רמז</button>
            <div class="hint-list" id="guess-hint-text"></div>
          </div>
          <div class="panel panel-note">אפשר לגרור את המפה ולהתקרב בשתי אצבעות (או בגלגלת) לפני שלוחצים.</div>
        </div>
        <div class="game-main">
          <div class="map-container" id="guess-map"></div>
          <div class="feedback-msg" id="guess-feedback"></div>
        </div>
      </div>
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

  function renderHud() {
    document.getElementById("guess-hud").innerHTML = App.Menu.hudHtml({
      id: "guess-hud-bar",
      emoji: "🎯",
      title: "נחשו את המדינה",
      total: order.length,
      idx: Math.min(idx, order.length - 1),
      roundLabel: `שאלה ${Math.min(idx + 1, order.length)} מתוך ${order.length}`,
      hearts: App.Menu.heartsHtml(maxMisses - misses, maxMisses),
      pills: [`⭐ ${score}`],
      streakId: "guess-streak",
      streak: streak,
    });
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
    App.Map.setHintTarget(country.id);
    renderHud();
    document.getElementById("guess-flag").innerHTML = flagHtml(country.id);
    document.getElementById("guess-name").textContent = country.name_he;

    const hintBtn = document.getElementById("guess-hint-btn");
    hintBtn.disabled = false;
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

  function onCountryClick(id) {
    if (locked || idx >= order.length) return;
    const country = order[idx];
    const fb = document.getElementById("guess-feedback");

    if (id === country.id) {
      locked = true;
      App.Map.setState(id, "correct");
      App.Map.setLabel(id, country.name_he);
      App.Audio.success();
      streak = App.Progress.recordAnswer(country.id, true);
      score++;
      renderHud();
      if (streak > 0 && streak % 3 === 0) {
        App.Audio.milestoneFlourish();
        App.Confetti.burst();
        App.Mascot.say(`רצף מדהים! ${streak} נכונות ברצף! 🔥`);
      }
      fb.textContent = `כל הכבוד! זו ${country.name_he}! 🎉`;
      fb.className = "feedback-msg good";
      idx++;
      setTimeout(nextRound, 1100);
      return;
    }

    misses++;
    App.Progress.recordAnswer(country.id, false);
    streak = 0;
    renderHud();
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
      setTimeout(nextRound, 1700);
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
        <div class="end-emoji">${ratio === 1 ? "🏆" : ratio >= 0.6 ? "🎉" : "💪"}</div>
        <h2 class="end-title">${ratio >= 0.8 ? "מגלי עולם אמיתיים!" : "סיבוב טוב!"}</h2>
        <p class="end-score">ניקוד: ${score} מתוך ${order.length}</p>
        <p class="end-sub">${ratio === 1 ? "כל התשובות נכונות – מושלם!" : "כל תשובה נכונה הוסיפה כוכב לדרכון שלכם."}</p>
        <div id="guess-end-actions"></div>
      </div>
    `;
    App.Menu.renderEndActions(document.getElementById("guess-end-actions"), "guess", () =>
      start(currentContinent, currentDifficulty, currentPracticeWeak)
    );
  }

  return { start };
})();
