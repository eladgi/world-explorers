// מעקב התקדמות: כוכבים למדינה, טעויות (לצורך תרגול חכם) ורצף תשובות נכונות.
// נשמר ב-localStorage כדי שההתקדמות תישאר גם אחרי סגירת הדפדפן; אם האחסון לא זמין
// (למשל גלישה פרטית) נופלים בעדינות לזיכרון זמני כדי שהמשחק לא יקרוס.
window.App = window.App || {};

App.Progress = (function () {
  const STORAGE_KEY = "migley-olam-progress-v1";
  const MAX_STARS = 3;

  function defaultState() {
    return { stars: {}, mistakes: {}, bestStreak: 0, totalCorrect: 0 };
  }

  let state = load();
  let currentStreak = 0;

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return defaultState();
      const parsed = JSON.parse(raw);
      return { ...defaultState(), ...parsed };
    } catch (e) {
      return defaultState();
    }
  }

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      // אחסון לא זמין - ממשיכים לשחק עם מצב בזיכרון בלבד, בלי לקרוס.
    }
  }

  function recordAnswer(countryId, correct) {
    if (correct) {
      const cur = state.stars[countryId] || 0;
      state.stars[countryId] = Math.min(MAX_STARS, cur + 1);
      state.totalCorrect++;
      currentStreak++;
      if (currentStreak > state.bestStreak) state.bestStreak = currentStreak;
      save();
      checkNewBadges();
    } else {
      state.mistakes[countryId] = (state.mistakes[countryId] || 0) + 1;
      currentStreak = 0;
      save();
    }
    return currentStreak;
  }

  function getStars(countryId) {
    return state.stars[countryId] || 0;
  }

  function getTotalStars() {
    return Object.values(state.stars).reduce((sum, n) => sum + n, 0);
  }

  function getMasteredCount() {
    return Object.values(state.stars).filter((n) => n >= MAX_STARS).length;
  }

  function getCurrentStreak() {
    return currentStreak;
  }

  function getBestStreak() {
    return state.bestStreak;
  }

  // מחזיר עד limit מדינות מתוך pool, בעדיפות לאלה עם הכי הרבה טעויות.
  // אם אין (או אין מספיק) מדינות "קשות" בפול, ממלאים עם השאר כדי שהסבב לא יהיה ריק.
  function getWeakCountries(pool, limit) {
    const withMistakes = pool.filter((c) => (state.mistakes[c.id] || 0) > 0);
    const sorted = withMistakes.slice().sort((a, b) => (state.mistakes[b.id] || 0) - (state.mistakes[a.id] || 0));
    if (sorted.length >= limit) return sorted.slice(0, limit);
    const rest = shuffle(pool.filter((c) => !(state.mistakes[c.id] > 0)));
    return sorted.concat(rest).slice(0, limit);
  }

  function hasAnyWeakCountries(pool) {
    return pool.some((c) => (state.mistakes[c.id] || 0) > 0);
  }

  function resetProgress() {
    state = defaultState();
    currentStreak = 0;
    seenBadgeIds = new Set();
    save();
  }

  const CONTINENT_BADGE_EMOJI = {
    אפריקה: "🦁",
    אסיה: "🐼",
    אירופה: "🏰",
    "צפון אמריקה": "🗽",
    "דרום אמריקה": "🌴",
    אוקיאניה: "🦘",
  };

  // תגים לא נשמרים בנפרד - הם תמיד מחושבים מחדש מתוך stars/bestStreak הקיימים,
  // כך שאין סכימת נתונים חדשה לשמור ואין סיכון תאימות עם שמירות ישנות.
  const BADGES = [
    { id: "stars-1", emoji: "🌍", name: "צעד ראשון", desc: "צברו כוכב ראשון", check: () => getTotalStars() >= 1 },
    { id: "stars-25", emoji: "⭐", name: "25 כוכבים", desc: "צברו 25 כוכבים", check: () => getTotalStars() >= 25 },
    { id: "stars-75", emoji: "🌟", name: "75 כוכבים", desc: "צברו 75 כוכבים", check: () => getTotalStars() >= 75 },
    { id: "stars-150", emoji: "✨", name: "150 כוכבים", desc: "צברו 150 כוכבים", check: () => getTotalStars() >= 150 },
    { id: "streak-5", emoji: "🔥", name: "רצף של 5", desc: "ענו נכון 5 פעמים ברצף", check: () => getBestStreak() >= 5 },
    { id: "streak-10", emoji: "🔥🔥", name: "רצף של 10", desc: "ענו נכון 10 פעמים ברצף", check: () => getBestStreak() >= 10 },
    ...CONTINENTS.map((continent) => ({
      id: "continent-" + continent,
      emoji: CONTINENT_BADGE_EMOJI[continent] || "🏆",
      name: `כובשי ${continent}`,
      desc: `השלימו את כל מדינות ${continent} (3 כוכבים לכל אחת)`,
      check: () => COUNTRIES.filter((c) => c.continent === continent).every((c) => getStars(c.id) >= 3),
    })),
  ];

  function getEarnedBadges() {
    return BADGES.map((b) => ({ id: b.id, emoji: b.emoji, name: b.name, desc: b.desc, earned: b.check() }));
  }

  // תגים שכבר היו מזוהים כ"נצברו" - כדי לחגוג (צליל + הודעת קמע) רק ברגע שתג נפתח
  // בפועל, לא בכל תשובה נכונה אחריו. מאותחל מייד מהמצב שנטען מה-localStorage (לפני כל
  // משחק בסבב הנוכחי), כדי שתגים שכבר נצברו בעבר לא "יחגגו" שוב - אבל התג הראשון שנפתח
  // ממש עכשיו (כולל אם זה הפעם הראשונה אי-פעם) כן יחגג.
  let seenBadgeIds = new Set(BADGES.filter((b) => b.check()).map((b) => b.id));

  function checkNewBadges() {
    const newlyEarned = BADGES.filter((b) => !seenBadgeIds.has(b.id) && b.check());
    if (!newlyEarned.length) return;
    newlyEarned.forEach((b) => seenBadgeIds.add(b.id));
    if (window.App.Audio) App.Audio.badgeEarned();
    if (window.App.Mascot) App.Mascot.say(`תג חדש: ${newlyEarned[0].emoji} ${newlyEarned[0].name}! 🏅`, 3600);
  }

  return {
    recordAnswer,
    getStars,
    getTotalStars,
    getMasteredCount,
    getCurrentStreak,
    getBestStreak,
    getWeakCountries,
    hasAnyWeakCountries,
    resetProgress,
    getEarnedBadges,
  };
})();
