// מצב "חידון גיאוגרפיה": שאלות אמריקאיות (4 ברירות) מסוגים שונים.
window.App = window.App || {};

App.Trivia = (function () {
  const ROOT_ID = "view-trivia";
  const TOTAL = 10;

  let pool = [];
  let questions = [];
  let idx = 0;
  let score = 0;
  let locked = false;
  let currentContinent = "world";
  let currentDifficulty = "בינוני";
  let currentPracticeWeak = false;

  function pickDistractors(correct, n, keyFn) {
    let candidates = pool.filter((c) => c.id !== correct.id);

    // ברמת קושי "קשה" מעדיפים מסיחים מאותה יבשת - הרבה יותר מבלבל ומאתגר.
    if (currentDifficulty === "קשה") {
      const sameContinent = candidates.filter((c) => c.continent === correct.continent);
      if (sameContinent.length >= n) candidates = sameContinent;
    }
    if (candidates.length < n) candidates = COUNTRIES.filter((c) => c.id !== correct.id);

    const seenKeys = new Set([keyFn(correct)]);
    const result = [];
    shuffle(candidates).forEach((c) => {
      if (result.length >= n) return;
      const key = keyFn(c);
      if (seenKeys.has(key)) return;
      seenKeys.add(key);
      result.push(c);
    });
    if (result.length < n) {
      shuffle(candidates).forEach((c) => {
        if (result.length >= n || result.includes(c)) return;
        result.push(c);
      });
    }
    return result;
  }

  function buildQuestion(country) {
    const type = randomChoice(["capital", "flag", "continent", "fact", "fact"]);

    if (type === "capital") {
      const distractors = pickDistractors(country, 3, (c) => c.capital_he);
      const options = shuffle([country, ...distractors]).map((c) => ({ label: c.capital_he, correct: c.id === country.id }));
      return { text: `מהי בירת ${country.name_he}?`, flagId: null, options };
    }

    if (type === "flag") {
      const distractors = pickDistractors(country, 3, (c) => c.name_he);
      const options = shuffle([country, ...distractors]).map((c) => ({ label: c.name_he, correct: c.id === country.id }));
      return { text: "לאיזו מדינה שייך הדגל הזה?", flagId: country.id, options };
    }

    if (type === "continent") {
      const others = shuffle(CONTINENTS.filter((c) => c !== country.continent)).slice(0, 3);
      const options = shuffle([country.continent, ...others]).map((c) => ({ label: c, correct: c === country.continent }));
      return { text: `באיזו יבשת נמצאת ${country.name_he}?`, flagId: country.id, options };
    }

    // fact - שתי עובדות שונות לכל מדינה, נבחרות אקראית, כדי לא לחזור על אותה שאלה שוב ושוב.
    const fact = country.fact2_he && Math.random() < 0.5 ? country.fact2_he : country.fact_he;
    const distractors = pickDistractors(country, 3, (c) => c.name_he);
    const options = shuffle([country, ...distractors]).map((c) => ({ label: c.name_he, correct: c.id === country.id }));
    return { text: `${fact} — איזו מדינה זו?`, flagId: null, options };
  }

  function start(continent, difficulty, practiceWeak) {
    currentContinent = continent;
    currentDifficulty = difficulty;
    currentPracticeWeak = !!practiceWeak;
    pool = filterCountries(continent, difficulty);
    const count = Math.min(TOTAL, pool.length);
    const subjectPool = currentPracticeWeak ? App.Progress.getWeakCountries(pool, count) : shuffle(pool).slice(0, count);
    questions = subjectPool.map((country) => Object.assign(buildQuestion(country), { country }));
    idx = 0;
    score = 0;
    locked = false;

    document.getElementById(ROOT_ID).innerHTML = `
      <div class="game-topbar">
        <span class="badge">❓ חידון גיאוגרפיה</span>
        <span class="badge" id="tv-progress"></span>
        <span class="badge" id="tv-score"></span>
        <span class="badge badge-streak" id="tv-streak" hidden></span>
      </div>
      <div class="prompt-card">
        <div class="prompt-flag" id="tv-flag"></div>
        <div class="trivia-question" id="tv-question"></div>
      </div>
      <div class="trivia-options" id="tv-options"></div>
      <div class="feedback-msg" id="tv-feedback"></div>
    `;

    App.Mascot.say("בואו נבדוק כמה אתם יודעים על העולם! 🧠");
    renderQuestion();
  }

  function renderQuestion() {
    locked = false;
    if (idx >= questions.length) return endGame();

    const q = questions[idx];
    document.getElementById("tv-progress").textContent = `שאלה ${idx + 1} מתוך ${questions.length}`;
    document.getElementById("tv-score").textContent = `ניקוד: ${score}`;
    document.getElementById("tv-flag").innerHTML = q.flagId ? flagHtml(q.flagId) : "";
    document.getElementById("tv-question").textContent = q.text;

    const fb = document.getElementById("tv-feedback");
    fb.textContent = "";
    fb.className = "feedback-msg";

    const box = document.getElementById("tv-options");
    box.innerHTML = "";
    q.options.forEach((opt) => {
      const btn = document.createElement("button");
      btn.className = "trivia-option";
      btn.textContent = opt.label;
      btn.addEventListener("click", () => onAnswer(btn, opt));
      box.appendChild(btn);
    });
  }

  function updateStreakBadge(streak) {
    const el = document.getElementById("tv-streak");
    if (streak >= 2) {
      el.hidden = false;
      el.textContent = `🔥 רצף: ${streak}`;
    } else {
      el.hidden = true;
    }
  }

  function onAnswer(btn, opt) {
    if (locked) return;
    locked = true;
    const fb = document.getElementById("tv-feedback");
    const buttons = Array.from(document.querySelectorAll(".trivia-option"));
    buttons.forEach((b) => (b.disabled = true));
    const q = questions[idx];

    if (opt.correct) {
      btn.classList.add("correct");
      score++;
      App.Audio.success();
      const streak = App.Progress.recordAnswer(q.country.id, true);
      updateStreakBadge(streak);
      if (streak > 0 && streak % 3 === 0) {
        App.Audio.milestoneFlourish();
        App.Confetti.burst();
        App.Mascot.say(`רצף מדהים! ${streak} נכונות ברצף! 🔥`);
      }
      fb.textContent = "כל הכבוד! 🎉";
      fb.className = "feedback-msg good";
    } else {
      btn.classList.add("wrong");
      App.Audio.fail();
      App.Progress.recordAnswer(q.country.id, false);
      updateStreakBadge(0);
      fb.textContent = "לא נכון... 🤔";
      fb.className = "feedback-msg bad";
      const correctIdx = q.options.findIndex((o) => o.correct);
      if (correctIdx >= 0) buttons[correctIdx].classList.add("correct");
    }

    idx++;
    setTimeout(renderQuestion, 1400);
  }

  function endGame() {
    const ratio = questions.length ? score / questions.length : 0;
    if (ratio === 1) App.Audio.perfectScore();
    App.Mascot.say(ratio >= 0.8 ? "מוח גיאוגרפי אמיתי! כל הכבוד! 🌟" : "יופי של ניסיון, ממשיכים ללמוד! 💪");
    document.getElementById(ROOT_ID).innerHTML = `
      <div class="end-screen">
        <div class="end-emoji">🏆</div>
        <div class="end-score">ניקוד: ${score} מתוך ${questions.length}</div>
        <div id="tv-end-actions"></div>
      </div>
    `;
    App.Menu.renderEndActions(document.getElementById("tv-end-actions"), "trivia", () =>
      start(currentContinent, currentDifficulty, currentPracticeWeak)
    );
  }

  return { start };
})();
