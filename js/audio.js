// צלילי משוב שנוצרים בזמן אמת (Web Audio), בלי קבצי סאונד.
// יש צליל רק על תשובה נכונה/שגויה ורגעי חגיגה (רצף/תג/ניקוד מושלם) - בכוונה אין
// צליל על כל לחיצה, כדי לא להיות מעצבן.
window.App = window.App || {};

App.Audio = (function () {
  const MUTE_KEY = "migley-olam-audio-muted-v1";
  let ctx = null;
  let muted = loadMuted();

  function loadMuted() {
    try {
      return localStorage.getItem(MUTE_KEY) === "1";
    } catch (e) {
      return false;
    }
  }

  function isMuted() {
    return muted;
  }

  function setMuted(val) {
    muted = !!val;
    try {
      localStorage.setItem(MUTE_KEY, muted ? "1" : "0");
    } catch (e) {
      // אחסון לא זמין - ההשתקה פשוט לא תישמר בין ביקורים, לא קריטי
    }
  }

  function toggleMuted() {
    setMuted(!muted);
    return muted;
  }

  function getCtx() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    }
    if (ctx.state === "suspended") ctx.resume();
    return ctx;
  }

  // פרטיאל בודד (גל סינוס טהור) עם פילטר low-pass רך ומעטפת נעימה (עלייה מהירה, דעיכה חלקה).
  function partial(freq, start, duration, gainPeak, type) {
    const c = getCtx();
    if (!c) return;
    const t0 = c.currentTime + start;

    const osc = c.createOscillator();
    osc.type = type || "sine";
    osc.frequency.value = freq;

    const filter = c.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = Math.max(freq * 3, 1000);
    filter.Q.value = 0.5;

    const gain = c.createGain();
    gain.gain.setValueAtTime(0, t0);
    gain.gain.linearRampToValueAtTime(gainPeak, t0 + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + duration);

    osc.connect(filter).connect(gain).connect(c.destination);
    osc.start(t0);
    osc.stop(t0 + duration + 0.05);
  }

  // "פעמון" - יסוד + אוברטון עדין מעל, כמו פעמון קטן ולא ביפ סינתטי שטוח.
  function bell(freq, start, duration, gainPeak) {
    partial(freq, start, duration, gainPeak);
    partial(freq * 2.01, start, duration * 0.55, gainPeak * 0.3);
  }

  // "צ'יימס" בהיר יותר מ-bell - אוברטון על חמישית (1.5x) במקום אוקטבה, לצליל זכוכיתי-נוצץ,
  // כדי שרגעי תג/הישג יישמעו שונה באופיים מרגע "תשובה נכונה" רגיל.
  function chime(freq, start, duration, gainPeak) {
    partial(freq, start, duration, gainPeak);
    partial(freq * 1.5, start, duration * 0.6, gainPeak * 0.35);
    partial(freq * 2, start + 0.02, duration * 0.4, gainPeak * 0.2, "triangle");
  }

  // סטייה קטנה ואקראית בגובה הצליל בכל קריאה, כדי שתשובות נכונות חוזרות לא יישמעו
  // כמו לולאה רובוטית זהה.
  function jitter() {
    return 1 + (Math.random() - 0.5) * 0.02;
  }

  // ארפג'יו עולה נעים (דו-מי-סול) עם צליל פעמון + נצנוץ אוקטבה עדין בסוף - מרגיש
  // כמו הצלחה קטנה, לא ביפ מחשב.
  function success() {
    if (muted) return;
    const j = jitter();
    bell(523.25 * j, 0, 0.35, 0.15); // C5
    bell(659.25 * j, 0.09, 0.4, 0.15); // E5
    bell(783.99 * j, 0.18, 0.55, 0.17); // G5
    bell(1046.5 * j, 0.24, 0.4, 0.07); // C6 - נצנוץ שקט
  }

  // צעד קטן ורך כלפי מטה - "אה, כמעט" עדין, בלי צליל של באזר או טעות חמורה.
  function fail() {
    if (muted) return;
    const j = jitter();
    bell(392.0 * j, 0, 0.3, 0.11); // G4
    bell(349.23 * j, 0.11, 0.42, 0.1); // F4
  }

  // ריצה עולה בהירה בת 4 תווים - מתנגן בנוסף לצליל ה-success הרגיל ברגעי רצף (כל 3
  // תשובות נכונות ברצף), כדי שרגע כזה יישמע כמו "עוד קצת יותר" ולא זהה לתשובה בודדת.
  function milestoneFlourish() {
    if (muted) return;
    const notes = [659.25, 783.99, 987.77, 1174.66]; // E5 G5 B5 D6
    notes.forEach((f, i) => bell(f, 0.4 + i * 0.09, 0.4, 0.16));
    bell(1567.98, 0.4 + notes.length * 0.09, 0.5, 0.12); // G6 - נצנוץ סיום
  }

  // "טאדא" קצר וזכוכיתי - שונה באופיו מ-milestoneFlourish כדי שילדים יבחינו בין
  // "רצף חם" לבין "תג חדש נפתח".
  function badgeEarned() {
    if (muted) return;
    chime(880, 0, 0.3, 0.14); // A5
    chime(1174.66, 0.13, 0.45, 0.16); // D6
    chime(1567.98, 0.26, 0.6, 0.13); // G6
  }

  // הפנפר הכי גדול - ריצה עולה ואז אקורד סיום (3 צלילים ביחד), רק לניקוד מושלם.
  function perfectScore() {
    if (muted) return;
    const run = [523.25, 659.25, 783.99, 1046.5]; // C5 E5 G5 C6
    run.forEach((f, i) => bell(f, i * 0.1, 0.35, 0.14));
    const chordStart = run.length * 0.1 + 0.05;
    bell(1046.5, chordStart, 0.8, 0.18); // C6
    bell(1318.51, chordStart, 0.8, 0.16); // E6
    bell(1567.98, chordStart, 0.8, 0.14); // G6
  }

  return { success, fail, milestoneFlourish, badgeEarned, perfectScore, isMuted, setMuted, toggleMuted };
})();
