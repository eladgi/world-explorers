// מצב "גלו את העולם": לחיצה על מדינה מציגה כרטיס עובדות + שכנות שלה, עם אפשרות
// "הפתיעו אותי" לגילוי אקראי ואתגרי חיפוש קלים שמעודדים לחקור ולא רק ללחוץ באקראי.
window.App = window.App || {};

App.Explore = (function () {
  const ROOT_ID = "view-explore";
  let currentPool = [];
  let currentChallenge = null;

  function start(continent, difficulty) {
    currentPool = filterCountries(continent, difficulty);

    document.getElementById(ROOT_ID).innerHTML = `
      <div class="game-topbar">
        <span class="badge">🔎 גלו את העולם</span>
        <span class="badge">${continent === "world" ? "כל העולם" : continent}</span>
        <span class="badge">רמת קושי: ${difficulty}</span>
      </div>
      <div class="challenge-banner" id="explore-challenge"></div>
      <div class="explore-actions">
        <button class="btn-secondary" id="explore-spin-btn">🎲 הפתיעו אותי</button>
      </div>
      <p class="setup-subtitle" style="text-align:center">לחצו על מדינה במפה כדי לגלות עליה עובדות ואת שכנותיה</p>
      <div class="map-container" id="explore-map"></div>
      <div id="explore-info"></div>
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
    el.textContent = currentChallenge ? currentChallenge.text : "";
    el.hidden = !currentChallenge;
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
      return { text: `🔎 אתגר: מצאו מדינה ביבשת ${basis.continent}`, check: (c) => c.continent === basis.continent };
    }
    if (type === "language") {
      const lang = randomChoice(basis.languages_he);
      return { text: `🔎 אתגר: מצאו מדינה שמדברים בה ${lang}`, check: (c) => c.languages_he.includes(lang) };
    }
    if (type === "population-big") {
      return { text: "🔎 אתגר: מצאו מדינה עם יותר מ-100 מיליון תושבים", check: (c) => c.population > 100 };
    }
    return { text: "🔎 אתגר: מצאו מדינה עם פחות ממיליון תושבים", check: (c) => c.population < 1 };
  }

  function selectCountry(id) {
    App.Map.clearStates();
    App.Map.clearLabels();
    App.Map.setState(id, "selected");
    const country = COUNTRIES_BY_ID[id];
    const neighborIds = (country.borders || []).filter((b) => COUNTRIES_BY_ID[b]);
    neighborIds.forEach((b) => App.Map.setState(b, "neighbor"));

    // מתמקדים במדינה+שכנותיה (לא נשארים בזום היבשת המלאה) כדי שהתוויות לא יידחסו זו לתוך
    // זו - במיוחד רלוונטי ביבשות עם פערי גודל ענקיים כמו אירופה (שכוללת גם את רוסיה).
    // חייב לקרות *לפני* setLabel, כי גודל הטקסט נגזר מרוחב התצוגה הנוכחי.
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
      box.innerHTML = '<div class="info-placeholder">👆 לחצו על מדינה במפה כדי להתחיל</div>';
      return;
    }

    const neighborNames = (country.borders || []).map((id) => COUNTRIES_BY_ID[id]).filter(Boolean).map((c) => c.name_he);
    const neighborsHtml = neighborNames.length
      ? neighborNames.join(", ")
      : "אין לה גבול יבשתי עם מדינה אחרת (מדינת אי) 🏝️";

    box.innerHTML = `
      <div class="info-card">
        <div style="text-align:center">${flagHtml(country.id)}</div>
        <h3 style="text-align:center">
          ${country.name_he}
          ${App.Speech.isSupported() ? '<button class="btn-speak" id="explore-speak-btn" aria-label="הקריאו את שם המדינה">🔊</button>' : ""}
        </h3>
        <dl>
          <dt>בירה</dt><dd>${country.capital_he}</dd>
          <dt>יבשת</dt><dd>${country.continent}</dd>
          <dt>שפה</dt><dd>${country.languages_he.join(", ")}</dd>
          <dt>אוכלוסייה</dt><dd>${formatPopulation(country.population)}</dd>
          <dt>שכנות</dt><dd>${neighborsHtml}</dd>
        </dl>
        <p class="info-fact">💡 ${country.fact_he}</p>
        ${country.fact2_he ? `<p class="info-fact">💡 ${country.fact2_he}</p>` : ""}
      </div>
    `;

    const speakBtn = document.getElementById("explore-speak-btn");
    if (speakBtn) speakBtn.addEventListener("click", () => App.Speech.speak(country.name_he));
  }

  return { start };
})();
