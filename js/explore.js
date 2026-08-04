// מצב "גלו את העולם": לחיצה על מדינה מציגה כרטיס עובדות + שכנות שלה, עם אפשרות
// "הפתיעו אותי" לגילוי אקראי ואתגרי חיפוש קלים שמעודדים לחקור ולא רק ללחוץ באקראי.
// בפריסה הרחבה כרטיס העובדות יושב ליד המפה (ולא מתחתיה) כדי שלא יצטרכו לגלול אחרי כל לחיצה.
window.App = window.App || {};

App.Explore = (function () {
  const ROOT_ID = "view-explore";
  let currentPool = [];
  let currentChallenge = null;

  function start(continent, difficulty) {
    currentPool = filterCountries(continent, difficulty);

    document.getElementById(ROOT_ID).innerHTML = `
      <div class="explore-bar">
        <span class="chip-static">🔎 גלו את העולם</span>
        <span class="chip-static soft">${continent === "world" ? "כל העולם" : continent} · ${difficulty}</span>
        <span class="hud-spacer"></span>
        <button class="btn-secondary" id="explore-spin-btn">🎲 הפתיעו אותי</button>
      </div>
      <div class="challenge-banner" id="explore-challenge" hidden>
        <span class="challenge-emoji">🎯</span>
        <span id="explore-challenge-text"></span>
      </div>
      <div class="game-cols">
        <div class="game-main">
          <div class="map-container" id="explore-map"></div>
        </div>
        <div class="game-side" id="explore-info"></div>
      </div>
    `;

    App.Map.render(document.getElementById("explore-map"));
    App.Map.setActiveContinent(continent, difficulty);
    App.Map.bindClick(onCountryClick);
    document.getElementById("explore-spin-btn").addEventListener("click", onSpinClick);

    rollChallenge();
    renderInfo(null);
  }

  function rollChallenge() {
    currentChallenge = generateChallenge(currentPool);
    const el = document.getElementById("explore-challenge");
    if (!el) return;
    el.hidden = !currentChallenge;
    if (currentChallenge) document.getElementById("explore-challenge-text").textContent = currentChallenge.text;
  }

  function generateChallenge(pool) {
    if (!pool.length) return null;
    const types = [];
    if (new Set(pool.map((c) => c.continent)).size > 1) types.push("continent");
    types.push("language");
    if (pool.some((c) => c.population > 100)) types.push("population-big");
    if (pool.some((c) => c.population < 1)) types.push("population-small");
    const type = randomChoice(types);
    const basis = randomChoice(pool);

    if (type === "continent") {
      return { text: `מצאו מדינה ביבשת ${basis.continent}`, check: (c) => c.continent === basis.continent };
    }
    if (type === "language") {
      const lang = randomChoice(basis.languages_he);
      return { text: `מצאו מדינה שמדברים בה ${lang}`, check: (c) => c.languages_he.includes(lang) };
    }
    if (type === "population-big") {
      return { text: "מצאו מדינה עם יותר מ-100 מיליון תושבים", check: (c) => c.population > 100 };
    }
    return { text: "מצאו מדינה עם פחות ממיליון תושבים", check: (c) => c.population < 1 };
  }

  function selectCountry(id) {
    App.Map.clearStates();
    App.Map.clearLabels();
    App.Map.setState(id, "selected");
    const country = COUNTRIES_BY_ID[id];
    const neighborIds = (country.borders || []).filter((b) => COUNTRIES_BY_ID[b]);
    neighborIds.forEach((b) => App.Map.setState(b, "neighbor"));

    // מתמקדים במדינה+שכנותיה (לא נשארים בזום היבשת המלאה) כדי שהתוויות לא יידחסו זו לתוך
    // זו. חייב לקרות *לפני* setLabel, כי גודל הטקסט נגזר מרוחב התצוגה הנוכחי.
    App.Map.focusCountries([id, ...neighborIds]);
    App.Map.setLabel(id, country.name_he);
    neighborIds.forEach((b) => App.Map.setLabel(b, COUNTRIES_BY_ID[b].name_he));
    renderInfo(country);

    if (currentChallenge && currentChallenge.check(country)) {
      App.Audio.success();
      App.Confetti.burst();
      App.Mascot.say("כל הכבוד, מצאתם את זה! 🎉");
      rollChallenge();
    }
  }

  function onCountryClick(id) {
    selectCountry(id);
  }

  function onSpinClick() {
    if (!currentPool.length) return;
    const country = randomChoice(currentPool);
    selectCountry(country.id);
  }

  function renderInfo(country) {
    const box = document.getElementById("explore-info");
    if (!country) {
      box.innerHTML = `
        <div class="info-placeholder">
          <div class="placeholder-emoji">👆</div>
          <div class="placeholder-title">לחצו על מדינה במפה</div>
          <div class="placeholder-text">נראה לכם את הדגל, הבירה, השפות, השכנות ושתי עובדות מפתיעות.</div>
        </div>
      `;
      return;
    }

    const neighborNames = (country.borders || []).map((id) => COUNTRIES_BY_ID[id]).filter(Boolean).map((c) => c.name_he);
    const neighborsHtml = neighborNames.length
      ? neighborNames.join(", ")
      : "אין גבול יבשתי – מדינת אי 🏝️";

    box.innerHTML = `
      <div class="panel info-card">
        <div class="info-head">
          ${flagHtml(country.id)}
          <div class="info-head-text">
            <div class="info-name">${country.name_he}</div>
            <div class="info-sub">${country.continent} · ${formatPopulation(country.population)}</div>
          </div>
          ${App.Speech.isSupported() ? '<button class="btn-speak" id="explore-speak-btn" aria-label="הקריאו את שם המדינה">🔊</button>' : ""}
        </div>
        <dl>
          <dt>בירה</dt><dd>${country.capital_he}</dd>
          <dt>שפות</dt><dd>${country.languages_he.join(", ")}</dd>
          <dt>שכנות</dt><dd>${neighborsHtml}</dd>
        </dl>
        <div class="info-facts">
          <p class="info-fact">💡 ${country.fact_he}</p>
          ${country.fact2_he ? `<p class="info-fact">💡 ${country.fact2_he}</p>` : ""}
        </div>
        <div class="info-legend">בטורקיז – השכנות שלה על המפה</div>
      </div>
    `;

    const speakBtn = document.getElementById("explore-speak-btn");
    if (speakBtn) speakBtn.addEventListener("click", () => App.Speech.speak(country.name_he));

    scrollInfoIntoViewIfNeeded(box);
  }

  // במסך צר, game-cols עובר לעמודה אחת (המפה קודם, כרטיס העובדות אחריה) - בלי זה, אחרי
  // כל לחיצה על מדינה הכרטיס נשאר מתחת לקפל ואף אחד לא רואה שהוא בכלל התעדכן. במסך רחב
  // הכרטיס כבר גלוי לצד המפה (ר' ההערה בראש הקובץ), אז גוללים רק אם באמת צריך.
  function scrollInfoIntoViewIfNeeded(box) {
    const rect = box.getBoundingClientRect();
    const fullyVisible = rect.top >= 0 && rect.bottom <= window.innerHeight;
    if (fullyVisible) return;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    box.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "nearest" });
  }

  return { start };
})();
