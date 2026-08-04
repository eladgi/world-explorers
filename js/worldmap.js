// רכיב מפה משותף לכל מצבי המשחק. טוען את ה-SVG כמחרוזת (בלי fetch, כדי לעבוד גם כקובץ מקומי),
// ומאפשר זום ליבשת/רמת קושי ע"י חישוב תיבה תוחמת (bounding box) של המדינות הרלוונטיות.
// למדינות מרובות-חלקים (למשל צרפת, שכוללת את גיאנה הצרפתית בדרום אמריקה) יש בקובץ ה-SVG
// תת-נתיב עם class="mainland" שמסמן רק את השטח הראשי - משתמשים בו לחישוב הזום כדי לא
// לקבל תצוגת יבשת שנמתחת עד לשטחים מעבר לים.
window.App = window.App || {};

App.Map = (function () {
  let svgEl = null;
  let container = null;
  let resetBtn = null;
  let worldBox = null; // {x,y,w,h} של כל העולם
  let baseBox = null; // {x,y,w,h} הבסיס הנוכחי (יבשת/קושי שנבחרו) - זה גבול ה"זום אאוט"
  let currentBox = null;
  let clickHandler = null;
  let suppressNextClick = false;
  let labelsLayer = null;
  let placedLabelBoxes = []; // תיבות תוחמות של תוויות שכבר הוצגו בסבב הנוכחי, למניעת חפיפה
  let silhouetteSvgEl = null; // עותק נסתר קבוע של המפה, רק לצורך מדידת bbox וחילוץ נתיבים (d)

  const activePointers = new Map();
  let dragStart = null;
  let pinchStart = null;
  let moved = false;
  const DRAG_THRESHOLD = 6;
  const MAX_ZOOM_DIVISOR = 12;
  // רף תחתון לזום אוטומטי (focusCountry/focusCountries) - קצת פחות קיצוני מהזום הידני
  // המקסימלי, כדי שמדינות זעירות (קפריסין, מלטה) לא יתמלאו כמעט את כל המסך בלי שום
  // הקשר גיאוגרפי מסביב (שכנות/חוף) שיעזור למצוא אותן על המפה.
  const MIN_FOCUS_WIDTH_DIVISOR = 6;
  // מדינות שהצורה האמיתית שלהן על המפה קטנה מהסף הזה (ביחידות ה-viewBox) כמעט בלתי
  // ניתנות לראייה/לחיצה (לדוגמה האיים המלדיביים ברוחב 0.2 יחידות בלבד) - מקבלות עיגול-סמן
  // מלאכותי בגודל קבוע (ר' addTinyCountryMarkers) שמשמש גם כאמצעי זיהוי חזותי וגם כאזור
  // לחיצה גדול יותר. אותו סף משמש גם לסינון מצב "נחשו לפי הצורה" (shapeguess.js, דרך
  // isTinyCountry) - בגודל כזה אין שום מידע צורני שניתן לזהות ממנו ממילא.
  const MIN_VISIBLE_MAP_SIZE = 3;
  // צורת "סיכת מפה" קטנה בקואורדינטות מקומיות - החוד ב-(0,0) נוגע במיקום המדויק, הגוף
  // צף מעליו. מכוונת בכל מופע ע"י transform=translate+scale (ר' addTinyCountryMarkers).
  // צורה גיאומטרית מכוונת (לא עיגול צבוע כמו מדינה אמיתית, לא אימוג'י) כדי שאי אפשר יהיה
  // לבלבל אותה עם צורת מדינה אמיתית על המפה - נוסה עיגול קודם וזוהה כמטעה.
  const TINY_MARKER_PATH = "M0,0 L-0.45,-0.75 L-0.35,-1.5 L0,-1.8 L0.35,-1.5 L0.45,-0.75 Z";
  const TINY_MARKER_SCALE = 1.3;

  function elFor(id) {
    return svgEl ? svgEl.querySelector('[id="' + id + '"]') : null;
  }

  function elsFor(id) {
    return svgEl ? svgEl.querySelectorAll('[id="' + id + '"]') : [];
  }

  // עבור מדינות מרובות-חלקים יש תת-נתיב עם class="mainland" (ר' הערה למעלה) - זה האלמנט
  // שממנו נגזרים גם ה-bbox וגם מיקום התווית, כדי לא לכלול שטחים מעבר לים בחישוב.
  function shapeElFor(id) {
    const el = elFor(id);
    if (!el) return null;
    const mainland = el.classList.contains("mainland") ? el : el.querySelector(".mainland");
    return mainland || el;
  }

  function bboxFor(id) {
    const el = shapeElFor(id);
    return el ? el.getBBox() : null;
  }

  // מרכז ה-bbox לא בהכרח נמצא בתוך הצורה עצמה - למדינות ארוכות/מעוקלות (למשל צ'ילה) הוא
  // עלול ליפול בים או מחוץ לגבול. במקום זה, דוגמים רשת נקודות בתוך ה-bbox ובודקים איזה מהן
  // באמת בתוך הצורה (isPointInFill), ואז לוקחים את הממוצע שלהן - ואם הממוצע עצמו נופל מחוץ
  // לצורה (קורה בצורות לא-קמורות), נבחרת נקודת הדגימה הקרובה ביותר אליו שכן בפנים.
  function visualCenterFor(el, box) {
    const fallback = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    if (!el || typeof el.isPointInFill !== "function") return fallback;

    const cols = 22, rows = 12;
    const inside = [];
    for (let r = 0; r <= rows; r++) {
      for (let c = 0; c <= cols; c++) {
        const x = box.x + (box.width * c) / cols;
        const y = box.y + (box.height * r) / rows;
        try {
          if (el.isPointInFill(new DOMPoint(x, y))) inside.push({ x, y });
        } catch (e) {
          return fallback; // isPointInFill לא נתמך - חוזרים לקירוב מרכז ה-bbox
        }
      }
    }
    if (!inside.length) return fallback;

    const mean = inside.reduce((acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y }), { x: 0, y: 0 });
    mean.x /= inside.length;
    mean.y /= inside.length;
    if (el.isPointInFill(new DOMPoint(mean.x, mean.y))) return mean;

    let best = inside[0], bestDist = Infinity;
    inside.forEach((p) => {
      const d = (p.x - mean.x) ** 2 + (p.y - mean.y) ** 2;
      if (d < bestDist) {
        bestDist = d;
        best = p;
      }
    });
    return best;
  }

  function rectsOverlap(a, b) {
    return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
  }

  function computeBoxForIds(ids) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    ids.forEach((id) => {
      const box = bboxFor(id);
      if (!box) return;
      minX = Math.min(minX, box.x);
      minY = Math.min(minY, box.y);
      maxX = Math.max(maxX, box.x + box.width);
      maxY = Math.max(maxY, box.y + box.height);
    });
    if (minX === Infinity) return { ...worldBox };
    const w = Math.max(maxX - minX, 5);
    const h = Math.max(maxY - minY, 5);
    const padX = w * 0.12, padY = h * 0.12;
    return { x: minX - padX, y: minY - padY, w: w + padX * 2, h: h + padY * 2 };
  }

  function parseViewBox(str) {
    const [x, y, w, h] = str.split(/\s+/).map(Number);
    return { x, y, w, h };
  }

  function applyViewBox(box) {
    currentBox = box;
    svgEl.setAttribute("viewBox", [box.x, box.y, box.w, box.h].join(" "));
    if (resetBtn) resetBtn.hidden = box.w >= baseBox.w * 0.98;
  }

  function clampBox(box) {
    const marginX = baseBox.w * 0.5;
    const marginY = baseBox.h * 0.5;
    const minX = baseBox.x - marginX;
    const maxX = baseBox.x + baseBox.w + marginX - box.w;
    const minY = baseBox.y - marginY;
    const maxY = baseBox.y + baseBox.h + marginY - box.h;
    return {
      x: Math.min(Math.max(box.x, Math.min(minX, maxX)), Math.max(minX, maxX)),
      y: Math.min(Math.max(box.y, Math.min(minY, maxY)), Math.max(minY, maxY)),
      w: box.w,
      h: box.h,
    };
  }

  function zoomAroundPoint(fromBox, pt, scaleFactor) {
    const minW = baseBox.w / MAX_ZOOM_DIVISOR;
    const maxW = baseBox.w;
    const newW = Math.min(Math.max(fromBox.w * scaleFactor, minW), maxW);
    const newH = newW * (fromBox.h / fromBox.w);
    const newX = pt.x - (pt.x - fromBox.x) * (newW / fromBox.w);
    const newY = pt.y - (pt.y - fromBox.y) * (newH / fromBox.h);
    applyViewBox(clampBox({ x: newX, y: newY, w: newW, h: newH }));
  }

  function clientToSvgPoint(clientX, clientY) {
    const ctm = svgEl.getScreenCTM();
    if (!ctm) return { x: currentBox.x, y: currentBox.y };
    const pt = new DOMPoint(clientX, clientY).matrixTransform(ctm.inverse());
    return { x: pt.x, y: pt.y };
  }

  function clientToSvgScale() {
    const rect = svgEl.getBoundingClientRect();
    if (!rect.width) return 1;
    return currentBox.w / rect.width;
  }

  function dist(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  function midpoint(a, b) {
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  }

  function onWheel(e) {
    e.preventDefault();
    const pt = clientToSvgPoint(e.clientX, e.clientY);
    const scaleFactor = e.deltaY < 0 ? 0.85 : 1 / 0.85;
    zoomAroundPoint(currentBox, pt, scaleFactor);
  }

  // הערה חשובה: אסור לקרוא ל-setPointerCapture כבר ב-pointerdown - זה מעביר גם את
  // ה-click הבא ליעד ה-SVG הראשי במקום למדינה שנלחצה בפועל (ואז לחיצה רגילה לא עובדת בכלל).
  // לכן קוראים לזה רק כשבאמת מזהים גרירה/צביטה, לא בכל לחיצה.
  function onPointerDown(e) {
    if (e.button !== undefined && e.button > 0) return;
    activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    moved = false;
    if (activePointers.size === 1) {
      dragStart = { x: e.clientX, y: e.clientY, box: { ...currentBox } };
      pinchStart = null;
    } else if (activePointers.size === 2) {
      dragStart = null;
      const pts = Array.from(activePointers.values());
      pinchStart = {
        dist: Math.max(dist(pts[0], pts[1]), 1),
        svgMid: clientToSvgPoint(midpoint(pts[0], pts[1]).x, midpoint(pts[0], pts[1]).y),
        box: { ...currentBox },
      };
      moved = true;
      activePointers.forEach((_, pid) => {
        try { svgEl.setPointerCapture(pid); } catch (err) { /* ignore */ }
      });
    }
  }

  function onPointerMove(e) {
    if (!activePointers.has(e.pointerId)) return;
    activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (activePointers.size === 2 && pinchStart) {
      const pts = Array.from(activePointers.values());
      const d = Math.max(dist(pts[0], pts[1]), 1);
      const scaleFactor = pinchStart.dist / d;
      zoomAroundPoint(pinchStart.box, pinchStart.svgMid, scaleFactor);
    } else if (activePointers.size === 1 && dragStart) {
      const dx = e.clientX - dragStart.x;
      const dy = e.clientY - dragStart.y;
      if (!moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
      if (!moved) {
        try { svgEl.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
      }
      moved = true;
      const scale = clientToSvgScale();
      const newBox = {
        x: dragStart.box.x - dx * scale,
        y: dragStart.box.y - dy * scale,
        w: dragStart.box.w,
        h: dragStart.box.h,
      };
      applyViewBox(clampBox(newBox));
    }
  }

  function onPointerUp(e) {
    // טאפ בודד (לא גרירה/צביטה) במגע: מפעילים את הבחירה ישירות מכאן במקום לסמוך על
    // ה-click הסינתטי שהדפדפן אמור לירות אחרי pointerup. בשילוב עם touch-action:none
    // וטיפול מגע מותאם אישית (לצורך פינץ'/גרירה), חלק ממכשירי אנדרואיד לפעמים "בולעים"
    // את ה-click הראשון בכל רינדור טרי של ה-SVG - נראה כאילו צריך ללחוץ פעמיים כדי
    // שהמדינה תיבחר. מגבילים ל-pointerType==="touch" בלבד כדי לא לשנות שום התנהגות
    // בעכבר (שם ה-click הרגיל כבר עובד טוב).
    const wasSingleTouch = e.pointerType === "touch" && activePointers.size === 1 && !!dragStart;

    activePointers.delete(e.pointerId);
    if (activePointers.size < 2) pinchStart = null;
    if (activePointers.size < 1) dragStart = null;

    if (moved) {
      suppressNextClick = true;
      moved = false;
      return;
    }

    if (wasSingleTouch && clickHandler) {
      const el = e.target.closest && e.target.closest(".country");
      if (el && !el.classList.contains("dimmed")) {
        suppressNextClick = true; // מונע הפעלה כפולה אם ה-click הרגיל בכל זאת יורה אחרי זה
        clickHandler(el.id, el);
      }
    }
  }

  function onSvgClick(e) {
    if (suppressNextClick) {
      suppressNextClick = false;
      return;
    }
    if (!clickHandler) return;
    const el = e.target.closest && e.target.closest(".country");
    if (!el || el.classList.contains("dimmed")) return;
    clickHandler(el.id, el);
  }

  function buildResetButton() {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "map-reset-btn";
    btn.textContent = "↺ איפוס תצוגה";
    btn.hidden = true;
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      resetView();
    });
    container.appendChild(btn);
    return btn;
  }

  // מדינות קטנות מדי לראייה/לחיצה (ר' MIN_VISIBLE_MAP_SIZE) מקבלות סיכת-מפה מלאכותית
  // קטנה, ממורכזת (בחוד שלה) ב"מרכז החזותי" של הצורה האמיתית (אותה פונקציה ששכבת
  // התוויות משתמשת בה). ה-id על הסמן זהה ל-id של הצורה המקורית (כפילות id נסבלת
  // בדפדפנים - ניתוב הלחיצה קורא את ה-id ישירות מהיעד שנלחץ, וכל שאילתת querySelector-יחיד
  // אחרת ב-elFor ממשיכה למצוא את הצורה האמיתית קודם כי היא מופיעה לפניו ב-DOM).
  function addTinyCountryMarkers() {
    const markersLayer = document.createElementNS("http://www.w3.org/2000/svg", "g");
    markersLayer.setAttribute("class", "tiny-markers");
    svgEl.querySelectorAll(".country").forEach((node) => {
      const box = node.getBBox();
      if (Math.max(box.width, box.height) >= MIN_VISIBLE_MAP_SIZE) return;
      const center = visualCenterFor(node, box);
      const marker = document.createElementNS("http://www.w3.org/2000/svg", "path");
      marker.setAttribute("id", node.id);
      marker.setAttribute("data-id", node.id);
      marker.setAttribute("class", "country tiny-marker");
      marker.setAttribute("d", TINY_MARKER_PATH);
      marker.setAttribute("transform", "translate(" + center.x + "," + center.y + ") scale(" + TINY_MARKER_SCALE + ")");
      markersLayer.appendChild(marker);
    });
    svgEl.appendChild(markersLayer);
  }

  // משתמש במקור הנסתר הקבוע (לא ב-svgEl האינטראקטיבי) כדי לתת תשובה נכונה גם אם נקרא
  // לפני שהמפה של המצב הנוכחי בכלל הוצגה (למשל shapeguess.js בונה את מאגר המדינות שלו
  // לפני קריאת App.Map.render()).
  function isTinyCountry(id) {
    const src = ensureSilhouetteSource();
    const el = src.querySelector('[id="' + id + '"]');
    if (!el) return false;
    const box = el.getBBox();
    return Math.max(box.width, box.height) < MIN_VISIBLE_MAP_SIZE;
  }

  function render(el) {
    container = el;
    container.innerHTML = WORLD_MAP_SVG;
    svgEl = container.querySelector("svg");
    svgEl.removeAttribute("width");
    svgEl.removeAttribute("height");
    svgEl.classList.add("world-map-svg");
    svgEl.style.touchAction = "none";
    // slice (ולא meet) כדי שבמסך צר, כשלקונטיינר יש גובה קבוע ב-CSS שלא תואם ליחס הרוחב-גובה
    // של המפה, היא תמלא את השטח ותיחתך בצדדים במקום להצטמצם לרצועה דקה.
    svgEl.setAttribute("preserveAspectRatio", "xMidYMid slice");
    worldBox = parseViewBox(svgEl.getAttribute("viewBox"));
    baseBox = { ...worldBox };
    currentBox = { ...worldBox };

    svgEl.querySelectorAll("path[id]").forEach((node) => {
      if (COUNTRIES_BY_ID[node.id]) {
        node.classList.add("country");
      } else {
        // צורות שקיימות במפה אבל אין להן נתונים במשחק (למשל טריטוריות קטנות) -
        // מקבלות צביעה ניטרלית קבועה במקום להישאר שחורות (ברירת המחדל של SVG).
        node.classList.add("land-other");
      }
    });
    addTinyCountryMarkers();

    activePointers.clear();
    dragStart = null;
    pinchStart = null;
    moved = false;
    suppressNextClick = false;
    labelsLayer = null;

    svgEl.addEventListener("click", onSvgClick);
    svgEl.addEventListener("wheel", onWheel, { passive: false });
    svgEl.addEventListener("pointerdown", onPointerDown);
    svgEl.addEventListener("pointermove", onPointerMove);
    svgEl.addEventListener("pointerup", onPointerUp);
    svgEl.addEventListener("pointercancel", onPointerUp);

    resetBtn = buildResetButton();

    return svgEl;
  }

  function bindClick(handler) {
    clickHandler = handler;
  }

  function setActiveContinent(continent, difficulty) {
    if (!svgEl) return;
    const filtered = filterCountries(continent, difficulty);
    const isFiltered = (continent && continent !== "world") || (difficulty && difficulty !== "קשה");
    const activeIds = isFiltered ? new Set(filtered.map((c) => c.id)) : null;

    svgEl.querySelectorAll(".country").forEach((node) => {
      node.classList.toggle("dimmed", !!(activeIds && !activeIds.has(node.id)));
    });

    baseBox = isFiltered ? computeBoxForIds(Array.from(activeIds)) : { ...worldBox };
    applyViewBox({ ...baseBox });
  }

  function resetView() {
    if (!baseBox) return;
    applyViewBox({ ...baseBox });
  }

  function clearStates() {
    if (!svgEl) return;
    svgEl.querySelectorAll(".country").forEach((node) => {
      node.classList.remove("selected", "correct", "wrong", "neighbor");
    });
  }

  function setState(id, state) {
    // elsFor (לא רק elFor) כדי שגם עיגול-הסמן של מדינה זעירה (ר' addTinyCountryMarkers)
    // יקבל את אותו צבע מצב כמו הצורה האמיתית - בגודל 0.2 יחידות של המלדיביים, הצבע על
    // הצורה עצמה כמעט ולא נראה, והסמן הוא בפועל מה שהשחקן רואה מגיב.
    elsFor(id).forEach((el) => el.classList.add(state));
  }

  function removeState(id, state) {
    elsFor(id).forEach((el) => el.classList.remove(state));
  }

  // שכבת תוויות שמות - לא מוצגת כברירת מחדל (כדי לא להציף מפה עם 179 שמות), רק כשמבקשים
  // תווית למדינה ספציפית (למשל מדינה שנבחרה + השכנות שהודגשו). ה-<text> ממוקם ב"מרכז חזותי"
  // אמיתי של הצורה (ר' visualCenterFor), לא סתם מרכז ה-bbox, וגודל הפונט נגזר מרוחב התצוגה
  // הנוכחי כדי שיישאר קריא גם בזום עולם וגם בזום למדינה בודדת.
  function ensureLabelsLayer() {
    if (labelsLayer && labelsLayer.isConnected) return labelsLayer;
    labelsLayer = document.createElementNS("http://www.w3.org/2000/svg", "g");
    labelsLayer.setAttribute("class", "country-labels");
    svgEl.appendChild(labelsLayer);
    return labelsLayer;
  }

  // אם התווית החדשה חופפת תווית שכבר הוצגה בסבב הזה (למשל שכנות צפופות של מדינה ענקית
  // כמו רוסיה), מדלגים עליה במקום לצייר טקסט חופף ובלתי קריא - התווית הראשונה שנוספת
  // (תמיד המדינה הנבחרת עצמה, ר' סדר הקריאות ב-explore.js) תמיד "מנצחת".
  function setLabel(id, text) {
    const el = shapeElFor(id);
    if (!el) return;
    const box = el.getBBox();
    const layer = ensureLabelsLayer();
    const center = visualCenterFor(el, box);
    const t = document.createElementNS("http://www.w3.org/2000/svg", "text");
    t.setAttribute("x", center.x);
    t.setAttribute("y", center.y);
    t.setAttribute("text-anchor", "middle");
    t.setAttribute("dominant-baseline", "middle");
    t.setAttribute("class", "country-label");
    t.setAttribute("font-size", Math.max(currentBox.w / 55, 2));
    t.textContent = text;
    layer.appendChild(t);

    const tb = t.getBBox();
    const pad = tb.height * 0.2;
    const paddedBox = { x: tb.x - pad, y: tb.y - pad, width: tb.width + pad * 2, height: tb.height + pad * 2 };
    if (placedLabelBoxes.some((b) => rectsOverlap(b, paddedBox))) {
      t.remove();
      return;
    }
    placedLabelBoxes.push(paddedBox);
  }

  function clearLabels() {
    if (labelsLayer) labelsLayer.innerHTML = "";
    placedLabelBoxes = [];
  }

  // מזמן את המפה על מדינה בודדת (לא רק יבשת שלמה) - למשל בשביל "הפתיעו אותי" בגלו את
  // העולם. שומר על יחס הרוחב-גובה של baseBox כדי לא לקבל תצוגה מעוותת, ולא מתקרב מעבר
  // ל-baseBox עצמו (גבול ה"זום אאוט" הרגיל).
  function focusCountry(id, paddingFactor) {
    if (!svgEl || !baseBox) return;
    const box = bboxFor(id);
    if (!box) return;
    const pad = paddingFactor != null ? paddingFactor : 0.7;
    let w = Math.max(box.width, box.height) * (1 + pad * 2);
    w = Math.min(Math.max(w, baseBox.w / MIN_FOCUS_WIDTH_DIVISOR), baseBox.w);
    const aspect = baseBox.h / baseBox.w;
    const h = w * aspect;
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    applyViewBox({ x: cx - w / 2, y: cy - h / 2, w, h });
  }

  // כמו focusCountry אבל למספר מדינות יחד (למשל מדינה שנבחרה + כל שכנותיה) - כדי שתוויות
  // השם לא יידחסו זו לתוך זו בתצוגת יבשת/עולם רחבה (למשל אירופה, שכוללת גם את רוסיה הענקית).
  function focusCountries(ids) {
    if (!svgEl || !baseBox || !ids || !ids.length) return;
    const box = computeBoxForIds(ids);
    const extraX = box.w * 0.15;
    const w = Math.min(Math.max(box.w + extraX * 2, baseBox.w / MIN_FOCUS_WIDTH_DIVISOR), baseBox.w);
    const aspect = baseBox.h / baseBox.w;
    const h = w * aspect;
    const cx = box.x + box.w / 2;
    const cy = box.y + box.h / 2;
    applyViewBox({ x: cx - w / 2, y: cy - h / 2, w, h });
  }

  // עותק נסתר קבוע (unrelated ל-svgEl האינטראקטיבי, שמוחלף בכל render()) שנוצר פעם אחת
  // בעצלנות, רק כדי ש-getBBox() יהיה זמין על כל נתיב מדינה (דורש חיבור ל-DOM, לא נראות).
  function ensureSilhouetteSource() {
    if (silhouetteSvgEl) return silhouetteSvgEl;
    const wrapper = document.createElement("div");
    wrapper.style.position = "absolute";
    wrapper.style.left = "-9999px";
    wrapper.style.top = "-9999px";
    wrapper.style.width = "0";
    wrapper.style.height = "0";
    wrapper.style.overflow = "hidden";
    wrapper.setAttribute("aria-hidden", "true");
    wrapper.innerHTML = WORLD_MAP_SVG;
    document.body.appendChild(wrapper);
    silhouetteSvgEl = wrapper.querySelector("svg");
    return silhouetteSvgEl;
  }

  // מחזיר SVG עצמאי (מחרוזת) עם צללית (צורה בלבד, בלי צבע/שם) של מדינה בודדת - למשל
  // למצב "נחשו לפי הצורה". לא תלוי במפה האינטראקטיבית המוצגת כרגע - עובד גם אם עוד
  // לא הוצגה שום מפה בסבב הזה.
  function getSilhouetteSvg(id, options) {
    const src = ensureSilhouetteSource();
    const el = src.querySelector('[id="' + id + '"]');
    if (!el) return null;
    const box = el.getBBox();
    const pad = options && options.pad != null ? options.pad : 0.08;
    const padX = box.width * pad, padY = box.height * pad;
    const vb = [box.x - padX, box.y - padY, box.width + padX * 2, box.height + padY * 2].join(" ");
    const d = el.getAttribute("d");
    const fill = (options && options.fill) || "#4a5a63";
    return (
      '<svg viewBox="' + vb + '" class="silhouette-svg" preserveAspectRatio="xMidYMid meet">' +
      '<path d="' + d + '" fill="' + fill + '" fill-rule="evenodd"></path>' +
      "</svg>"
    );
  }

  return {
    render,
    bindClick,
    setActiveContinent,
    resetView,
    clearStates,
    setState,
    removeState,
    focusCountry,
    focusCountries,
    setLabel,
    clearLabels,
    getSilhouetteSvg,
    isTinyCountry,
  };
})();
