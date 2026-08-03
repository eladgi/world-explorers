// ניווט כללי: תפריט ראשי -> מסך בחירת יבשת+קושי -> מצב המשחק שנבחר.
// כאן גם רכיבי ה-UI המשותפים למצבי המשחק (סרגל HUD, נקודות התקדמות, לבבות, פס סיום).
window.App = window.App || {};

App.Menu = (function () {
  const MODES = {
    explore: {
      title: "גלו את העולם",
      subtitle: "בחרו יבשת, ואז לחצו על כל מדינה כדי לגלות עליה עובדות",
      emoji: "🔎",
      viewId: "view-explore",
      start: (continent, difficulty) => App.Explore.start(continent, difficulty),
      hasPractice: false,
    },
    guess: {
      title: "נחשו את המדינה",
      subtitle: "יופיעו דגל ושם מדינה – מצאו אותה על המפה!",
      emoji: "🎯",
      viewId: "view-guess",
      start: (continent, difficulty, practiceWeak) => App.Guess.start(continent, difficulty, practiceWeak),
      hasPractice: true,
    },
    flagmatch: {
      title: "התאימו דגלים",
      subtitle: "התאימו כל דגל לשם המדינה הנכון שלו",
      emoji: "🧩",
      viewId: "view-flagmatch",
      start: (continent, difficulty, practiceWeak) => App.FlagMatch.start(continent, difficulty, practiceWeak),
      hasPractice: true,
    },
    capitalmatch: {
      title: "התאימו בירות",
      subtitle: "התאימו כל מדינה לבירה שלה",
      emoji: "🏙️",
      viewId: "view-capitalmatch",
      start: (continent, difficulty, practiceWeak) => App.CapitalMatch.start(continent, difficulty, practiceWeak),
      hasPractice: true,
    },
    shapeguess: {
      title: "נחשו לפי הצורה",
      subtitle: "רואים רק את קווי המתאר של המדינה - מוצאים אותה על המפה!",
      emoji: "🧭",
      viewId: "view-shapeguess",
      start: (continent, difficulty, practiceWeak) => App.ShapeGuess.start(continent, difficulty, practiceWeak),
      hasPractice: true,
    },
    trivia: {
      title: "חידון גיאוגרפיה",
      subtitle: "ענו נכון על כמה שיותר שאלות",
      emoji: "❓",
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

  // תיאור קצר בשפה של ילדים לכל רמה, במקום רק שם הרמה.
  const DIFFICULTY_META = {
    קל: { emoji: "🌱", desc: "מדינות מוכרות בלבד – מושלם להתחלה" },
    בינוני: { emoji: "⭐", desc: "מוכרות + עוד כמה חדשות" },
    קשה: { emoji: "🔥", desc: "כל המדינות שבמשחק" },
  };

  let pendingMode = null;
  let pendingModeKey = null;
  let selectedContinent = "world";
  let selectedDifficulty = "בינוני";
  let practiceWeak = false;
  let allViewIds = [];

  function updateStarsBadge() {
    const total = App.Progress.getTotalStars();
    const mastered = App.Progress.getMasteredCount();
    const el = document.getElementById("stars-count");
    if (el) el.textContent = total;
    const set = (id, val) => {
      const node = document.getElementById(id);
      if (node) node.textContent = val;
    };
    set("stat-stars", total);
    set("stat-mastered", mastered);
    set("stat-streak", App.Progress.getBestStreak());
    set("stat-total", COUNTRIES.length);
    const line = document.getElementById("menu-passport-line");
    if (line) line.textContent = `${mastered} מתוך ${COUNTRIES.length} מדינות הושלמו · ⭐ ${total} כוכבים`;
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
    // ה-CTA הדביק ("בואו נתחיל") שייך רק למסך ההגדרות
    document.getElementById("setup-cta-bar").hidden = id !== "view-setup";
    // במסך הראשי יש מקום לשם המלא בכותרת; בשאר המסכים הוא מתקפל לגלובוס בלבד בטלפון
    document.body.classList.toggle("at-menu", id === "view-menu");
    updateStarsBadge();
    window.scrollTo({ top: 0, behavior: "smooth" });

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
    pendingModeKey = modeKey;
    if (!preserveSelections) {
      selectedContinent = "world";
      selectedDifficulty = "בינוני";
      practiceWeak = false;
    }
    document.getElementById("setup-emoji").textContent = pendingMode.emoji;
    document.getElementById("setup-title").textContent = pendingMode.title;
    document.getElementById("setup-subtitle").textContent = pendingMode.subtitle;
    renderContinentChips();
    renderDifficultyChips();
    renderPracticeToggle();
    showView("view-setup");
  }

  // ---------- רכיבי UI משותפים למצבי המשחק ----------

  // נקודות התקדמות: הושלמו / נוכחית / עתידיות - במקום טקסט "שאלה 4 מתוך 10" בלבד.
  function dotsHtml(total, idx) {
    let out = "";
    for (let i = 0; i < total; i++) {
      const cls = i < idx ? " class=\"done\"" : i === idx ? " class=\"now\"" : "";
      out += `<i${cls}></i>`;
    }
    return `<span class="hud-dots">${out}</span>`;
  }

  // לבבות = ניסיונות שנותרו בסבב הנוכחי (מובן יותר לילדים ממספר).
  function heartsHtml(left, max) {
    return "❤️".repeat(Math.max(left, 0)) + "🤍".repeat(Math.max(Math.min(max - left, max), 0));
  }

  // סרגל אחד קומפקטי לכל מצבי המשחק, במקום שורת "באדג'ים" זהים.
  function hudHtml(opts) {
    const parts = [`<span class="hud-mode">${opts.emoji} ${opts.title}</span>`];
    if (opts.total) parts.push(dotsHtml(opts.total, opts.idx));
    if (opts.roundLabel) parts.push(`<span class="hud-round">${opts.roundLabel}</span>`);
    parts.push('<span class="hud-spacer"></span>');
    if (opts.hearts) parts.push(`<span class="hud-hearts" aria-label="ניסיונות שנותרו">${opts.hearts}</span>`);
    if (opts.pills) opts.pills.forEach((p) => parts.push(`<span class="hud-pill">${p}</span>`));
    parts.push(`<span class="hud-pill streak" id="${opts.streakId}"${opts.streak >= 2 ? "" : " hidden"}>🔥 ${opts.streak}</span>`);
    return `<div class="hud" id="${opts.id}">${parts.join("")}</div>`;
  }

  function updateStreakPill(id, streak) {
    const el = document.getElementById(id);
    if (!el) return;
    el.hidden = streak < 2;
    el.textContent = `🔥 ${streak}`;
  }

  // פס פעולות אחיד למסכי סיום (שחקו שוב / שנו הגדרות / תפריט ראשי).
  function renderEndActions(container, modeKey, onReplay) {
    container.innerHTML = `
      <div class="end-actions">
        <button class="btn-primary" id="end-replay-btn">🔄 שחקו שוב</button>
        <div class="end-actions-row">
          <button class="btn-secondary" id="end-settings-btn">⚙️ הגדרות</button>
          <button class="btn-tertiary" id="end-home-btn">🏠 תפריט</button>
        </div>
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
      btn.className = "option-card" + (c === selectedContinent ? " active" : "");
      btn.innerHTML = `
        <span class="option-emoji">${CONTINENT_ICONS[c] || "🌎"}</span>
        <span class="option-name">${c === "world" ? "כל העולם" : c}</span>
        <span class="option-meta">${filterCountries(c, selectedDifficulty).length} מדינות</span>
      `;
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
      const meta = DIFFICULTY_META[d] || { emoji: "⭐", desc: "" };
      const count = filterCountries(selectedContinent, d).length;
      const btn = document.createElement("button");
      btn.className = "option-card difficulty" + (d === selectedDifficulty ? " active" : "");
      btn.innerHTML = `
        <span class="option-name"><span>${meta.emoji}</span>${d}</span>
        <span class="option-meta">${meta.desc} · ${count} מדינות</span>
      `;
      btn.addEventListener("click", () => {
        selectedDifficulty = d;
        renderDifficultyChips();
        renderContinentChips();
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
    btn.className = "practice-toggle" + (practiceWeak ? " active" : "");
    btn.innerHTML = `
      <span class="practice-emoji">🎯</span>
      <span class="practice-body">
        <span class="practice-title">תרגול המדינות הקשות שלי</span>
        <span class="practice-sub">נתמקד במדינות שבהן טעיתם הכי הרבה</span>
      </span>
      <span class="switch" aria-hidden="true"><i></i></span>
    `;
    btn.setAttribute("aria-pressed", practiceWeak ? "true" : "false");
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
    document.getElementById("menu-passport-cta").addEventListener("click", openPassport);
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

  return {
    init,
    goHome,
    showView,
    updateStarsBadge,
    renderEndActions,
    hudHtml,
    dotsHtml,
    heartsHtml,
    updateStreakPill,
  };
})();

document.addEventListener("DOMContentLoaded", App.Menu.init);
