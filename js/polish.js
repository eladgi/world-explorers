// תוספות "כיף": בועת דיבור של קמע (ינשוף חכם) לעידוד קצר, וקונפטי לחגיגת הצלחות.
// שתיהן קלות מאוד - בלי ספריות חיצוניות, רק CSS transitions/keyframes.
window.App = window.App || {};

App.Mascot = (function () {
  let el = null;
  let hideTimer = null;

  function ensureEl() {
    if (el) return el;
    el = document.createElement("div");
    el.className = "mascot-bubble";
    el.innerHTML = '<span class="mascot-emoji">🦉</span><span class="mascot-text"></span>';
    document.body.appendChild(el);
    return el;
  }

  function say(message, duration) {
    const node = ensureEl();
    node.querySelector(".mascot-text").textContent = message;
    node.classList.add("visible");
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => {
      node.classList.remove("visible");
    }, duration || 3200);
  }

  return { say };
})();

// הקראת טקסט בעברית - עזר לילדים שעדיין לומדים לקרוא. אם הדפדפן לא תומך, פשוט לא עושה כלום.
App.Speech = (function () {
  const supported = "speechSynthesis" in window;
  let hebrewVoice = null;
  let voicesReady = false;

  // רשימת הקולות נטענת א-סינכרונית בחלק מהדפדפנים (בעיקר כרום בדסקטופ) - getVoices()
  // יכול להחזיר מערך ריק בקריאה הראשונה, לפני שאירוע voiceschanged מתרחש. בוחרים קול
  // עברי במפורש (ולא רק סומכים על utter.lang) כי חלק מהדפדפנים לא בוחרים קול לפי lang
  // בעצמם, גם אם קול כזה מותקן.
  function refreshHebrewVoice() {
    if (!supported) return;
    const voices = window.speechSynthesis.getVoices();
    if (!voices.length) return;
    voicesReady = true;
    hebrewVoice = voices.find((v) => v.lang && v.lang.toLowerCase().startsWith("he")) || null;
  }

  if (supported) {
    refreshHebrewVoice();
    window.speechSynthesis.addEventListener("voiceschanged", refreshHebrewVoice);
  }

  function speak(text) {
    if (!supported) return;
    window.speechSynthesis.cancel();

    // אם רשימת הקולות כבר נטענה ואין אף קול עברי (למשל מחשב Windows בלי חבילת שפה
    // עברית מותקנת) - אין טעם "לדבר" עם קול לועזי (הוא פשוט לא ישמיע כלום משמעותי
    // לטקסט עברי), אז עדיף הודעה ברורה על כישלון שקט ובלתי מוסבר.
    if (voicesReady && !hebrewVoice) {
      if (window.App && App.Mascot) App.Mascot.say("😕 אין קול בעברית מותקן במחשב הזה", 3600);
      return;
    }

    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = "he-IL";
    if (hebrewVoice) utter.voice = hebrewVoice;
    utter.rate = 0.9;
    window.speechSynthesis.speak(utter);
  }

  return { speak, isSupported: () => supported };
})();

App.Confetti = (function () {
  const COLORS = ["#ff8a5b", "#4ecdc4", "#ffd166", "#06d6a0", "#ef476f"];
  const PIECE_COUNT = 30;

  function burst() {
    const container = document.createElement("div");
    container.className = "confetti-container";
    document.body.appendChild(container);

    for (let i = 0; i < PIECE_COUNT; i++) {
      const piece = document.createElement("div");
      piece.className = "confetti-piece";
      piece.style.left = Math.random() * 100 + "%";
      piece.style.background = COLORS[Math.floor(Math.random() * COLORS.length)];
      piece.style.animationDelay = Math.random() * 0.3 + "s";
      piece.style.animationDuration = 1.6 + Math.random() * 0.8 + "s";
      piece.style.setProperty("--start-rotate", Math.random() * 360 + "deg");
      container.appendChild(piece);
    }

    setTimeout(() => container.remove(), 2700);
  }

  return { burst };
})();
