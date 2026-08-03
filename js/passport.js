// מסך "הדרכון שלי": אלבום מדבקות - דגלים מקובצים ליבשות, עם פס התקדמות לכל יבשת,
// דהויים עד שמתחילים ללמוד עליהם ומוזהבים כשמשלימים אותם (3 כוכבים).
window.App = window.App || {};

App.Passport = (function () {
  const ROOT_ID = "view-passport";
  const CONTINENT_EMOJI = {
    אפריקה: "🦁",
    אסיה: "🐼",
    אירופה: "🏰",
    "צפון אמריקה": "🗽",
    "דרום אמריקה": "🌴",
    אוקיאניה: "🦘",
  };
  let resetArmed = false;

  function starsHtml(n) {
    let s = "";
    for (let i = 0; i < 3; i++) s += i < n ? "★" : "☆";
    return s;
  }

  function tierClass(n) {
    if (n >= 3) return "sticker-mastered";
    if (n >= 1) return "sticker-started";
    return "sticker-locked";
  }

  function badgesHtml() {
    const badges = App.Progress.getEarnedBadges();
    const items = badges
      .map(
        (b) => `
        <div class="badge-item ${b.earned ? "badge-earned" : "badge-locked"}">
          <div class="badge-emoji">${b.emoji}</div>
          <div class="badge-name">${b.name}</div>
          <div class="badge-desc">${b.desc}</div>
        </div>`
      )
      .join("");
    return `
      <h3 class="passport-section-title">🏅 מדליות</h3>
      <div class="badge-grid">${items}</div>`;
  }

  function render() {
    resetArmed = false;
    const totalStars = App.Progress.getTotalStars();
    const mastered = App.Progress.getMasteredCount();
    const total = COUNTRIES.length;

    const sections = CONTINENTS.map((continent) => {
      const list = COUNTRIES.filter((c) => c.continent === continent);
      const continentMastered = list.filter((c) => App.Progress.getStars(c.id) >= 3).length;
      const pct = Math.round((continentMastered / list.length) * 100);
      const stickers = list
        .map((c) => {
          const stars = App.Progress.getStars(c.id);
          return `
        <div class="sticker ${tierClass(stars)}">
          <div class="sticker-flag">${flagHtml(c.id)}</div>
          <div class="sticker-name">${c.name_he}</div>
          <div class="sticker-stars">${starsHtml(stars)}</div>
        </div>`;
        })
        .join("");
      return `
        <div class="passport-continent">
          <div class="passport-continent-head">
            <span class="passport-continent-emoji">${CONTINENT_EMOJI[continent] || "🌎"}</span>
            <h3>${continent}</h3>
            <span class="passport-continent-count">${continentMastered}/${list.length}</span>
            <span class="passport-bar"><i style="width:${pct}%"></i></span>
          </div>
          <div class="passport-list">${stickers}</div>
        </div>`;
    }).join("");

    document.getElementById(ROOT_ID).innerHTML = `
      <div class="passport-summary">
        <div class="passport-summary-emoji">🎒</div>
        <div class="passport-summary-text">
          <h1>הדרכון שלי</h1>
          <p>${mastered} מתוך ${total} מדינות הושלמו · ⭐ ${totalStars} כוכבים</p>
        </div>
        <div class="passport-stats">
          <div class="passport-stat"><b>${totalStars}</b><span>⭐ כוכבים</span></div>
          <div class="passport-stat"><b>${mastered}</b><span>🏅 הושלמו</span></div>
          <div class="passport-stat"><b>${App.Progress.getBestStreak()}</b><span>🔥 רצף שיא</span></div>
        </div>
      </div>
      ${badgesHtml()}
      ${sections}
      <div class="passport-reset-wrap">
        <button class="btn-secondary" id="passport-reset-btn">איפוס התקדמות</button>
      </div>
    `;

    document.getElementById("passport-reset-btn").addEventListener("click", onResetClick);
  }

  function onResetClick() {
    const btn = document.getElementById("passport-reset-btn");
    if (!resetArmed) {
      resetArmed = true;
      btn.textContent = "בטוחים? לחצו שוב כדי לאפס";
      btn.classList.add("armed");
      return;
    }
    App.Progress.resetProgress();
    render();
    App.Menu.updateStarsBadge();
  }

  return { render };
})();
