// מצב "נחשו לפי הצורה": מציגים רק את קווי המתאר של המדינה (בלי דגל, בלי שם) והילד/ה
// צריכ/ה למצוא אותה על המפה. שיבוט מכוון של App.Guess - רק ההנחיה מוחלפת, כי שאר
// המנגנון (רמזים דו-שלביים, לבבות, רצף, שמירת התקדמות) כבר מוכח ועובד.
window.App = window.App || {};

App.ShapeGuess = (function () {
  const ROOT_ID = "view-shapeguess";
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

    // מדינות קטנות מכדי להיראות על המפה (לדוגמה האיים המלדיביים) לא מוצגות במצב הזה -
    // אין להן שום צורה מזוהה שאפשר לבקש מילד/ה לזהות, בניגוד למצב "נחשו את המדינה" (guess.js),
    // ששם עיגול-הסמן המלאכותי (ר' worldmap.js) מספיק כי שם רק צריך למצוא ולא לזהות צורה.
    const basePool = filterCountries(continent, difficulty).filter((c) => !App.Map.isTinyCountry(c.id));
    const pool = currentPracticeWeak ? App.Progress.getWeakCountries(basePool, basePool.length) : basePool;
    const total = Math.min(10, pool.length);
    order = shuffle(pool).slice(0, total);
    idx = 0;
    score = 0;
    streak = 0;
    locked = false;

    document.getElementById(ROOT_ID).innerHTML = `
      <div id="shape-hud"></div>
      <div class="game-cols">
        <div class="game-side">
          <div class="panel centered">
            <div class="prompt-label">איזו מדינה זו? מצאו אותה על המפה</div>
            <div class="shape-prompt" id="shape-prompt"></div>
            <button class="btn-hint" id="shape-hint-btn">💡 קבלו רמז</button>
            <div class="hint-list" id="shape-hint-text"></div>
          </div>
          <div class="panel panel-note">אפשר לגרור את המפה ולהתקרב בשתי אצבעות (או בגלגלת) לפני שלוחצים.</div>
        </div>
        <div class="game-main">
          <div class="map-container" id="shape-map"></div>
          <div class="feedback-msg" id="shape-feedback"></div>
        </div>
      </div>
    `;

    App.Map.render(document.getElementById("shape-map"));
    App.Map.setActiveContinent(continent, difficulty);
    App.Map.bindClick(onCountryClick);
    document.getElementById("shape-hint-btn").addEventListener("click", onHintClick);

    App.Mascot.say("הביטו טוב בצורה, ומצאו אותה על המפה! 🧭");
    nextRound();
  }

  function renderHud() {
    document.getElementById("shape-hud").innerHTML = App.Menu.hudHtml({
      id: "shape-hud-bar",
      emoji: "🧭",
      title: "נחשו לפי הצורה",
      total: order.length,
      idx: Math.min(idx, order.length - 1),
      roundLabel: `שאלה ${Math.min(idx + 1, order.length)} מתוך ${order.length}`,
      hearts: App.Menu.heartsHtml(maxMisses - misses, maxMisses),
      pills: [`⭐ ${score}`],
      streakId: "shape-streak",
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
    const fb = document.getElementById("shape-feedback");
    fb.textContent = "";
    fb.className = "feedback-msg";

    if (idx >= order.length) return endGame();

    const country = order[idx];
    renderHud();
    document.getElementById("shape-prompt").innerHTML = App.Map.getSilhouetteSvg(country.id, { fill: "#3f5a66" }) || "";

    const hintBtn = document.getElementById("shape-hint-btn");
    hintBtn.disabled = false;
    hintBtn.textContent = "💡 קבלו רמז";
    document.getElementById("shape-hint-text").innerHTML = "";
  }

  // רמז דו-שלבי, זהה במתכוון ל-App.Guess. כאן הרמזים חשובים אפילו יותר כי אין שם על המסך.
  function onHintClick() {
    if (locked || idx >= order.length || hintLevel >= 2) return;
    hintLevel++;
    const country = order[idx];
    const hintTextEl = document.getElementById("shape-hint-text");
    const hintBtn = document.getElementById("shape-hint-btn");

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
    const fb = document.getElementById("shape-feedback");

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
      setTimeout(nextRound, 1200);
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
      document.getElementById("shape-hint-btn").disabled = true;
      idx++;
      setTimeout(nextRound, 1800);
    } else {
      fb.textContent = "לא בדיוק, נסו שוב! 🤔";
      fb.className = "feedback-msg bad";
    }
  }

  function endGame() {
    const ratio = order.length ? score / order.length : 0;
    if (ratio === 1) App.Audio.perfectScore();
    App.Mascot.say(ratio >= 0.8 ? "עין נשרית לצורות מדינות! 🌟" : "יפה מאוד, ממשיכים להתאמן! 💪");
    document.getElementById(ROOT_ID).innerHTML = `
      <div class="end-screen">
        <div class="end-emoji">${ratio === 1 ? "🏆" : ratio >= 0.6 ? "🎉" : "💪"}</div>
        <h2 class="end-title">${ratio >= 0.8 ? "עין נשרית לצורות!" : "סיבוב טוב!"}</h2>
        <p class="end-score">ניקוד: ${score} מתוך ${order.length}</p>
        <p class="end-sub">${ratio === 1 ? "כל התשובות נכונות – מושלם!" : "כל תשובה נכונה הוסיפה כוכב לדרכון שלכם."}</p>
        <div id="shape-end-actions"></div>
      </div>
    `;
    App.Menu.renderEndActions(document.getElementById("shape-end-actions"), "shapeguess", () =>
      start(currentContinent, currentDifficulty, currentPracticeWeak)
    );
  }

  return { start };
})();
