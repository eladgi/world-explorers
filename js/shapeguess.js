// מצב "נחשו לפי הצורה": מציגים רק את קווי המתאר של המדינה (בלי דגל, בלי שם) והילד/ה
// צריכ/ה למצוא אותה על המפה. שיבוט של app.Guess עם ההנחיה בלבד מוחלפת - שאר המנגנון
// (רמזים דו-שלביים, ניסיונות, רצף, שמירת התקדמות) זהה במתכוון כי הוא כבר מוכח ועובד.
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
        <span class="badge">🧭 נחשו לפי הצורה</span>
        <span class="badge" id="shape-progress"></span>
        <span class="badge" id="shape-score"></span>
        <span class="badge" id="shape-tries"></span>
        <span class="badge badge-streak" id="shape-streak" hidden></span>
      </div>
      <div class="prompt-card">
        <p class="setup-subtitle" style="margin-top:0">איזו מדינה זו? מצאו אותה על המפה!</p>
        <div class="shape-prompt" id="shape-prompt"></div>
        <button class="btn-hint" id="shape-hint-btn">💡 קבלו רמז</button>
        <div class="hint-text" id="shape-hint-text"></div>
      </div>
      <div class="feedback-msg" id="shape-feedback"></div>
      <div class="map-container" id="shape-map"></div>
    `;

    App.Map.render(document.getElementById("shape-map"));
    App.Map.setActiveContinent(continent, difficulty);
    App.Map.bindClick(onCountryClick);
    document.getElementById("shape-hint-btn").addEventListener("click", onHintClick);

    App.Mascot.say("הביטו טוב בצורה, ומצאו אותה על המפה! 🧭");
    nextRound();
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
    document.getElementById("shape-progress").textContent = `שאלה ${idx + 1} מתוך ${order.length}`;
    document.getElementById("shape-score").textContent = `ניקוד: ${score}`;
    document.getElementById("shape-tries").textContent = `ניסיונות שנותרו: ${maxMisses - misses}`;
    document.getElementById("shape-prompt").innerHTML = App.Map.getSilhouetteSvg(country.id) || "";

    const hintBtn = document.getElementById("shape-hint-btn");
    hintBtn.disabled = false;
    hintBtn.hidden = false;
    hintBtn.textContent = "💡 קבלו רמז";
    document.getElementById("shape-hint-text").innerHTML = "";
  }

  // רמז דו-שלבי, זהה במתכוון ל-App.Guess: יבשת (+ זום חזותי), ואז שכנה שגובלת בה או
  // האות הראשונה של הבירה למדינות אי. כאן הרמזים חשובים אפילו יותר כי אין שם על המסך בכלל.
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

  function updateStreakBadge(streak) {
    const el = document.getElementById("shape-streak");
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
    const fb = document.getElementById("shape-feedback");

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
      fb.textContent = `כל הכבוד! זו ${country.name_he}! 🎉`;
      fb.className = "feedback-msg good";
      score++;
      idx++;
      setTimeout(nextRound, 1200);
      return;
    }

    misses++;
    App.Progress.recordAnswer(country.id, false);
    updateStreakBadge(0);
    document.getElementById("shape-tries").textContent = `ניסיונות שנותרו: ${Math.max(maxMisses - misses, 0)}`;
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
        <div class="end-emoji">🏆</div>
        <div class="end-score">ניקוד: ${score} מתוך ${order.length}</div>
        <div id="shape-end-actions"></div>
      </div>
    `;
    App.Menu.renderEndActions(document.getElementById("shape-end-actions"), "shapeguess", () =>
      start(currentContinent, currentDifficulty, currentPracticeWeak)
    );
  }

  return { start };
})();
