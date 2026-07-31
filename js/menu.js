// ניווט כללי: תפריט ראשי -> מסך בחירת יבשת+קושי -> מצב המשחק שנבחר.
window.App = window.App || {};

App.Menu = (function () {
  const MODES = {
    explore: {
      title: "גלו את העולם",
      subtitle: "בחרו יבשת, ואז לחצו על כל מדינה כדי לגלות עליה עובדות",
      viewId: "view-explore",
      start: (continent, difficulty) => App.Explore.start(continent, difficulty),
      hasPractice: false,
    },
    guess: {
      title: "נחשו את המדינה",
      subtitle: "יופיעו דגל ושם מדינה – מצאו אותה על המפה!",
      viewId: "view-guess",
      start: (continent, difficulty, practiceWeak) => App.Guess.start(continent, difficulty, practiceWeak),
      hasPractice: true,
    },
    flagmatch: {
      title: "התאימו דגלים",
      subtitle: "התאימו כל דגל לשם המדינה הנכון שלו",
      viewId: "view-flagmatch",
      start: (continent, difficulty, practiceWeak) => App.FlagMatch.start(continent, difficulty, practiceWeak),
      hasPractice: true,
    },
    capitalmatch: {
      title: "התאימו בירות",
      subtitle: "התאימו כל מדינה לבירה שלה",
      viewId: "view-capitalmatch",
      start: (continent, difficulty, practiceWeak) => App.CapitalMatch.start(continent, difficulty, practiceWeak),
      hasPractice: true,
    },
    shapeguess: {
      title: "נחשו לפי הצורה",
      subtitle: "רואים רק את קווי המתאר של המדינה - מוצאים אותה על המפה!",
      viewId: "view-shapeguess",
      start: (continent, difficulty, practiceWeak) => App.ShapeGuess.start(continent, difficulty, practiceWeak),
      hasPractice: true,
    },
    trivia: {
      title: "חידון גיאוגרפיה",
      subtitle: "ענו נכון על כמה שיותר שאלות",
      viewId: "view-trivia",
      start: (continent, difficulty, practiceWeak) => App.Trivia.start(continent, difficulty, practiceWeak),
      hasPractice: true,
    },
  };

  const CONTINENT_ICONS = {
    world: "🌍",
    אפריקה: "🦁",
    אסיה: "🐼",
    אירופה: "🏰",
    "צפון אמריקה": "🗽",
    "דרום אמריקה": "🌴",
    אוקיאניה: "🦘",
  };

  const DIFFICULTY_ICONS = {
    קל: "🌱",
    בינוני: "⭐",
    קשה: "🔥",
  };

  let pendingMode = null;
  let selectedContinent = "world";
  let selectedDifficulty = "בינוני";
  let practiceWeak = false;
  let allViewIds = [];

  function updateStarsBadge() {
    const btn = document.getElementById("btn-stars");
    if (btn) btn.textContent = `⭐ ${App.Progress.getTotalStars()}`;
  }

  function updateMuteBtn() {
    const btn = document.getElementById("btn-mute");
    if (!btn) return;
    const muted = App.Audio.isMuted();
    btn.textContent = muted ? "🔇" : "🔊";
    btn.setAttribute("aria-label", muted ? "הפעילו צלילים" : "השתקת צלילים");
  }

  function showView(id) {
    allViewIds.forEach((v) => {
      document.getElementById(v).hidden = v !== id;
    });
    document.getElementById("btn-home").hidden = id === "view-menu";
    updateStarsBadge();
    window.scrollTo({ top: 0, behavior: "smooth" });

    // אנימציית כניסה עדינה למסך החדש, במקום מעבר חד - קלאס שמוסר את עצמו אחרי שהריצה
    // מסתיימת כדי שאפשר יהיה להפעיל אותה שוב בפעם הבאה שאותו מסך יוצג.
    const el = document.getElementById(id);
    el.classList.remove("view-enter");
    void el.offsetWidth;
    el.classList.add("view-enter");
  }

  function goHome() {
    pendingMode = null;
    showView("view-menu");
  }

  function openPassport() {
    App.Passport.render();
    showView("view-passport");
  }

  function openSetup(modeKey, preserveSelections) {
    pendingMode = MODES[modeKey];
    if (!preserveSelections) {
      selectedContinent = "world";
      selectedDifficulty = "בינוני";
      practiceWeak = false;
    }
    document.getElementById("setup-title").textContent = pendingMode.title;
    document.getElementById("setup-subtitle").textContent = pendingMode.subtitle;
    renderContinentChips();
    renderDifficultyChips();
    renderPracticeToggle();
    showView("view-setup");
  }

  // פס פעולות אחיד למסכי סיום (שחקו שוב / שנו הגדרות / תפריט ראשי) - כדי שלא יצטרכו
  // להגיע דווקא לכפתור הבית שבכותרת אחרי כל משחק שנגמר.
  function renderEndActions(container, modeKey, onReplay) {
    container.innerHTML = `
      <div class="end-actions">
        <button class="btn-primary" id="end-replay-btn">🔄 שחקו שוב</button>
        <button class="btn-secondary" id="end-settings-btn">⚙️ שנו הגדרות</button>
        <button class="btn-tertiary" id="end-home-btn">🏠 תפריט ראשי</button>
      </div>
    `;
    document.getElementById("end-replay-btn").addEventListener("click", onReplay);
    document.getElementById("end-settings-btn").addEventListener("click", () => openSetup(modeKey, true));
    document.getElementById("end-home-btn").addEventListener("click", goHome);
  }

  function renderContinentChips() {
    const row = document.getElementById("continent-chips");
    row.innerHTML = "";
    const options = ["world", ...CONTINENTS];
    options.forEach((c) => {
      const btn = document.createElement("button");
      btn.className = "chip" + (c === selectedContinent ? " active" : "");
      btn.textContent = (CONTINENT_ICONS[c] || "🌎") + " " + (c === "world" ? "כל העולם" : c);
      btn.addEventListener("click", () => {
        selectedContinent = c;
        renderContinentChips();
      });
      row.appendChild(btn);
    });
  }

  function renderDifficultyChips() {
    const row = document.getElementById("difficulty-chips");
    row.innerHTML = "";
    DIFFICULTIES.forEach((d) => {
      const btn = document.createElement("button");
      btn.className = "chip" + (d === selectedDifficulty ? " active" : "");
      btn.textContent = DIFFICULTY_ICONS[d] + " " + d;
      btn.addEventListener("click", () => {
        selectedDifficulty = d;
        renderDifficultyChips();
      });
      row.appendChild(btn);
    });
  }

  function renderPracticeToggle() {
    const wrap = document.getElementById("practice-toggle-wrap");
    if (!pendingMode.hasPractice) {
      wrap.hidden = true;
      return;
    }
    wrap.hidden = false;
    wrap.innerHTML = "";
    const btn = document.createElement("button");
    btn.className = "chip chip-practice" + (practiceWeak ? " active" : "");
    btn.textContent = "🎯 תרגול המדינות הקשות שלי";
    btn.addEventListener("click", () => {
      practiceWeak = !practiceWeak;
      renderPracticeToggle();
    });
    wrap.appendChild(btn);
  }

  function startMode() {
    if (!pendingMode) return;
    showView(pendingMode.viewId);
    pendingMode.start(selectedContinent, selectedDifficulty, practiceWeak);
  }

  function init() {
    allViewIds = Array.from(document.querySelectorAll(".view")).map((v) => v.id);

    document.querySelectorAll(".mode-card").forEach((card) => {
      card.addEventListener("click", () => openSetup(card.dataset.mode));
    });

    document.getElementById("setup-start").addEventListener("click", startMode);
    document.getElementById("btn-home").addEventListener("click", goHome);
    document.getElementById("btn-stars").addEventListener("click", openPassport);
    document.getElementById("btn-help").addEventListener("click", () => App.Tutorial.show());
    document.getElementById("btn-mute").addEventListener("click", () => {
      App.Audio.toggleMuted();
      updateMuteBtn();
    });

    updateStarsBadge();
    updateMuteBtn();
    showView("view-menu");
    App.Tutorial.maybeShowAuto();
  }

  return { init, goHome, showView, updateStarsBadge, renderEndActions };
})();

document.addEventListener("DOMContentLoaded", App.Menu.init);
