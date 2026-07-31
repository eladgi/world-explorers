// הדרכה קצרה למשתמש/ת חדש/ה: כמה כרטיסים שמסבירים בקצרה את המשחקים והתכונות העיקריות.
// מוצג פעם אחת אוטומטית (עם דגל נפרד ב-localStorage, לא קשור לשמירת ההתקדמות עצמה -
// כדי שאיפוס התקדמות בדרכון לא יגרום להדרכה לקפוץ שוב), ואפשר לפתוח שוב בכל רגע
// דרך כפתור העזרה בכותרת.
window.App = window.App || {};

App.Tutorial = (function () {
  const SEEN_KEY = "migley-olam-tutorial-seen-v1";
  let overlayEl = null;
  let stepIdx = 0;

  const STEPS = [
    {
      emoji: "🌍",
      title: "ברוכים הבאים למגלי עולם!",
      text: "משחק קטן שעוזר לכם להכיר את מדינות העולם - איפה הן נמצאות ומה מיוחד בהן.",
    },
    {
      emoji: "🎮",
      title: "שישה משחקים שונים",
      text: "🔎 גלו את העולם · 🎯 נחשו את המדינה · 🧭 נחשו לפי הצורה · 🧩 התאימו דגלים · 🏙️ התאימו בירות · ❓ חידון גיאוגרפיה. בחרו מה שבא לכם מהתפריט הראשי!",
    },
    {
      emoji: "⭐",
      title: "כוכבים והדרכון שלכם",
      text: "כל תשובה נכונה מזכה אתכם בכוכב על המדינה הזו. לחצו על כפתור הכוכבים למעלה כדי לראות את הדרכון והתגים שצברתם.",
    },
    {
      emoji: "💡",
      title: "נתקעתם? יש עזרה!",
      text: "כפתור 'קבלו רמז' עוזר במשחקי מפה. ואפשר גם להפעיל 'תרגול המדינות הקשות שלי' כדי להתמקד במה שכדאי לתרגל יותר.",
    },
    {
      emoji: "🚀",
      title: "מוכנים?",
      text: "בואו נתחיל לגלות את העולם!",
    },
  ];

  function ensureOverlay() {
    if (overlayEl) return overlayEl;
    overlayEl = document.createElement("div");
    overlayEl.className = "tutorial-overlay";
    document.body.appendChild(overlayEl);
    return overlayEl;
  }

  function render() {
    const step = STEPS[stepIdx];
    const isLast = stepIdx === STEPS.length - 1;
    const dots = STEPS.map((_, i) => `<span class="tutorial-dot${i === stepIdx ? " active" : ""}"></span>`).join("");

    overlayEl.innerHTML = `
      <div class="tutorial-card">
        <button class="tutorial-skip" id="tutorial-skip-btn">דלגו</button>
        <div class="tutorial-emoji">${step.emoji}</div>
        <h2 class="tutorial-title">${step.title}</h2>
        <p class="tutorial-text">${step.text}</p>
        <div class="tutorial-dots">${dots}</div>
        <div class="tutorial-nav">
          <button class="btn-secondary" id="tutorial-back-btn" ${stepIdx === 0 ? "disabled" : ""}>הקודם</button>
          <button class="btn-primary" id="tutorial-next-btn">${isLast ? "בואו נתחיל! 🚀" : "הבא"}</button>
        </div>
      </div>
    `;

    document.getElementById("tutorial-skip-btn").addEventListener("click", close);
    document.getElementById("tutorial-back-btn").addEventListener("click", () => {
      if (stepIdx > 0) {
        stepIdx--;
        render();
      }
    });
    document.getElementById("tutorial-next-btn").addEventListener("click", () => {
      if (isLast) {
        close();
        return;
      }
      stepIdx++;
      render();
    });
  }

  function show() {
    stepIdx = 0;
    ensureOverlay();
    overlayEl.classList.add("visible");
    render();
  }

  function close() {
    try {
      localStorage.setItem(SEEN_KEY, "1");
    } catch (e) {
      // אחסון לא זמין - פשוט לא נזכור שההדרכה נצפתה, לא קריטי
    }
    if (overlayEl) overlayEl.classList.remove("visible");
  }

  function maybeShowAuto() {
    let seen = false;
    try {
      seen = localStorage.getItem(SEEN_KEY) === "1";
    } catch (e) {
      seen = false;
    }
    if (!seen) show();
  }

  return { show, maybeShowAuto };
})();
