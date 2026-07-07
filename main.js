/* ==========================================================================
   БАНОЧКА — main.js
   Прелоадер с реальным прогрессом → фолбэки ассетов → GSAP/ScrollTrigger сцены.
   ========================================================================== */
(function(){
  "use strict";

  var ASSET_NAMES = [
    "hero-sky","jar-front","jar-quarter","jar-side","jar-macro",
    "farm","workshop","lab","shelf",
    "manifesto-sky","burst","members-sky","ingredients-levitation","sky-panorama"
  ];

  // Раскадровка v3: логическое имя ассета (см. data-bg в index.html) -> реальный
  // файл в assets/. lab, manifesto-sky, ingredients-levitation, sky-panorama
  // не менялись (глава 4 ждёт мужского персонажа; UGC-полоса не трогается) — остаются старыми jpg.
  var ASSET_FILES = {
    "hero-sky":              "SB-01.png",
    "jar-front":             "SB-02a.png",
    "jar-quarter":           "SB-02b.png",
    "jar-side":              "SB-02c.png",
    "jar-macro":             "SB-03.png",
    "farm":                  "SB-04.png",
    "workshop":              "SB-05.png",
    "lab":                   "lab.jpg",
    "shelf":                 "SB-07.png",
    "manifesto-sky":         "manifesto-sky.jpg",
    "burst":                 "SB-09.png",
    "members-sky":           "SB-11.png",
    "ingredients-levitation":"ingredients-levitation.jpg",
    "sky-panorama":          "sky-panorama.jpg"
  };

  var ASSET_STATUS = {}; // name -> true (loaded) | false (error)

  function assetPath(name){ return "assets/" + (ASSET_FILES[name] || (name + ".jpg")); }

  /* ---------------- ПРЕЛОАДЕР: реальный прогресс ---------------- */
  function preload(done){
    var total = ASSET_NAMES.length;
    var settled = 0;

    var statusEl = document.getElementById("preloader-status");
    var fillEl = document.getElementById("preloader-fill");

    function update(){
      var pct = total === 0 ? 100 : Math.round((settled / total) * 100);
      if (fillEl) fillEl.style.width = pct + "%";
      if (statusEl) statusEl.textContent = "ВАРКА №1 · ЗАГРУЗКА " + pct + "%";
      if (settled >= total) done();
    }

    if (total === 0){ update(); return; }

    ASSET_NAMES.forEach(function(name){
      var img = new Image();
      img.onload = function(){ ASSET_STATUS[name] = true; settled++; update(); };
      img.onerror = function(){ ASSET_STATUS[name] = false; settled++; update(); };
      img.src = assetPath(name);
    });

    update();
  }

  /* ---------------- Применение фонов + фолбэков ---------------- */
  function applyAssetBackgrounds(){
    var nodes = document.querySelectorAll("[data-bg]");
    nodes.forEach(function(el){
      var name = el.getAttribute("data-bg");
      if (ASSET_STATUS[name]){
        el.style.backgroundImage = "url('" + assetPath(name) + "')";
      } else {
        el.classList.add("asset-missing");
      }
    });
  }

  /* ---------------- Скрыть прелоадер ---------------- */
  function hidePreloader(cb){
    var preloader = document.getElementById("preloader");
    if (!preloader){ cb(); return; }
    var curtain = preloader.querySelector(".preloader-curtain");
    var inner = preloader.querySelector(".preloader-inner");

    if (window.gsap){
      var tl = gsap.timeline({ onComplete: function(){ preloader.style.display = "none"; cb(); } });
      tl.to(inner, { opacity:0, duration:0.35, ease:"power2.out" });
      tl.to(preloader, { autoAlpha:0, duration:0.6, ease:"power2.inOut" }, "-=0.1");
    } else {
      preloader.style.transition = "opacity .5s ease";
      preloader.style.opacity = "0";
      setTimeout(function(){ preloader.style.display = "none"; cb(); }, 520);
    }
  }

  /* ---------------- Посимвольный сплиттер (фолбэк на SplitText) ---------------- */
  function splitChars(el){
    var text = el.textContent;
    el.textContent = "";
    var words = text.split(" ");
    var frag = document.createDocumentFragment();
    var allChars = [];

    words.forEach(function(word, wi){
      var wordSpan = document.createElement("span");
      wordSpan.className = "word";
      word.split("").forEach(function(ch){
        var span = document.createElement("span");
        span.className = "char";
        span.textContent = ch;
        wordSpan.appendChild(span);
        allChars.push(span);
      });
      frag.appendChild(wordSpan);
      if (wi < words.length - 1){
        frag.appendChild(document.createTextNode(" "));
      }
    });

    el.appendChild(frag);
    return allChars;
  }

  /* ================================================================
     ГЛАВНАЯ ИНИЦИАЛИЗАЦИЯ (после закрытия прелоадера)
     ================================================================ */
  function initApp(){
    var reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    var isMobile = window.matchMedia("(max-width:767px)").matches;

    if (reducedMotion){ document.body.classList.add("reduced-motion"); }

    if (window.gsap && window.ScrollTrigger){
      gsap.registerPlugin(ScrollTrigger);
    }

    /* ---------- Lenis плавный скролл ---------- */
    var lenis = null;
    if (window.Lenis && !reducedMotion){
      lenis = new Lenis({ duration: 1.05, smoothWheel: true });
      lenis.on("scroll", function(){ if (window.ScrollTrigger) ScrollTrigger.update(); });
      function raf(time){ lenis.raf(time); requestAnimationFrame(raf); }
      requestAnimationFrame(raf);
      if (window.gsap){
        gsap.ticker.add(function(time){ lenis.raf(time * 1000); });
        gsap.ticker.lagSmoothing(0);
      }
    }

    /* ---------- Плавный скролл по CTA-ссылкам ---------- */
    document.querySelectorAll("[data-scroll-to]").forEach(function(a){
      a.addEventListener("click", function(e){
        var target = document.querySelector(a.getAttribute("data-scroll-to"));
        if (!target) return;
        e.preventDefault();
        if (lenis){ lenis.scrollTo(target); }
        else { target.scrollIntoView({ behavior:"smooth" }); }
      });
    });

    /* ---------- ГЛАВА 6: карточки-приглашения → скролл к форме + предвыбор роли ---------- */
    document.querySelectorAll("[data-invite-role]").forEach(function(btn){
      btn.addEventListener("click", function(){
        var role = btn.getAttribute("data-invite-role");
        var form = document.getElementById("preorder-form");
        if (form){
          var input = form.querySelector('input[name="role"][value="' + role + '"]');
          if (input) input.checked = true;
        }
        var target = document.getElementById("preorder");
        if (!target) return;
        if (lenis){ lenis.scrollTo(target); }
        else { target.scrollIntoView({ behavior:"smooth" }); }
      });
    });

    /* ---------- ГЛАВА 6: карта заявок — инициализация независима от GSAP ---------- */
    initMap();

    /* ---------- HERO: посимвольный заголовок ---------- */
    var heroTitle = document.getElementById("hero-title");
    if (heroTitle){
      var chars;
      if (window.SplitText){
        // words+chars: слова остаются неразрывными (SplitText сам добавляет
        // white-space:nowrap словам), перенос строки происходит только между словами.
        var st = new SplitText(heroTitle, { type:"words, chars" });
        chars = st.chars;
        chars.forEach(function(c){ c.classList.add("char"); });
      } else {
        chars = splitChars(heroTitle);
      }

      if (reducedMotion || !window.gsap){
        chars.forEach(function(c){ c.style.opacity = 1; });
      } else {
        gsap.set(chars, { opacity:0, y:40 });
        gsap.to(chars, {
          opacity:1, y:0,
          duration:0.7,
          ease:"power2.out",
          stagger:0.03,
          delay:0.15
        });
      }
    }

    if (!window.gsap || !window.ScrollTrigger){
      // Без GSAP дальнейшие сцены не собираем — статичная страница остаётся читаемой.
      return;
    }

    /* ---------- HUD-строка hero: лёгкое появление ---------- */
    gsap.from("#hero-hud", { opacity:0, y:10, duration:0.6, delay:0.05, ease:"power1.out" });
    gsap.from(".hero-sub", { opacity:0, y:16, duration:0.6, delay:0.55, ease:"power1.out" });
    gsap.from(".hero-cta", { opacity:0, y:16, duration:0.6, delay:0.7, ease:"power1.out" });

    if (reducedMotion){
      // Пины отключены глобально через body.reduced-motion (CSS). JS-сцены ниже пропускаем.
      initCounters();
      initForms();
      initMissionReveal(true);
      return;
    }

    /* ---------- Общий прогресс страницы → шкала ---------- */
    var scaleDot = document.getElementById("scale-dot");
    var scaleTrack = document.querySelector(".scale-track");
    ScrollTrigger.create({
      trigger: document.body,
      start: "top top",
      end: "bottom bottom",
      onUpdate: function(self){
        if (scaleDot && scaleTrack){
          var h = scaleTrack.getBoundingClientRect().height;
          scaleDot.style.top = (self.progress * h) + "px";
        }
      }
    });

    /* ---------- ГЛАВА 1: hero pin + медленный zoom фона ---------- */
    var heroBg = document.getElementById("hero-bg");
    ScrollTrigger.create({
      trigger: "#hero-wrap",
      start: "top top",
      end: "bottom bottom",
      pin: ".chapter-hero",
      scrub: true
    });
    if (heroBg){
      gsap.fromTo(heroBg, { scale:1 }, {
        scale:1.12,
        ease:"none",
        scrollTrigger:{
          trigger: "#hero-wrap",
          start: "top top",
          end: "bottom bottom",
          scrub: true
        }
      });
    }

    /* ---------- ГЛАВА 2: банка — кросс-фейд трёх ракурсов + HUD + macro ---------- */
    var jarFront = document.querySelector('.jar-frame[data-jar="front"]');
    var jarQuarter = document.querySelector('.jar-frame[data-jar="quarter"]');
    var jarSide = document.querySelector('.jar-frame[data-jar="side"]');
    var jarMacro = document.querySelector('.jar-frame[data-jar="macro"]');
    var hud1 = document.querySelector('[data-hud="1"]');
    var hud2 = document.querySelector('[data-hud="2"]');
    var hud3 = document.querySelector('[data-hud="3"]');

    gsap.set(jarQuarter, { opacity:0, scale:1.03 });
    gsap.set(jarSide, { opacity:0, scale:1.03 });
    gsap.set(jarMacro, { opacity:0 });

    ScrollTrigger.create({
      trigger: "#jar-wrap",
      start: "top top",
      end: "bottom bottom",
      pin: ".chapter-jar",
      scrub: true,
      onUpdate: function(self){
        var p = self.progress;

        // Кросс-фейд ракурсов по третям
        var frontOp = 1 - smooth01((p - 0.18) / 0.15);
        var quarterOp = smooth01((p - 0.18) / 0.15) * (1 - smooth01((p - 0.51) / 0.15));
        var sideOp = smooth01((p - 0.51) / 0.15);

        gsap.set(jarFront, { opacity: clamp01(frontOp) });
        gsap.set(jarQuarter, { opacity: clamp01(quarterOp), scale: 1 + 0.03 * (1 - clamp01(quarterOp)) });
        gsap.set(jarSide, { opacity: clamp01(sideOp), scale: 1 + 0.03 * (1 - clamp01(sideOp)) });

        // Финальные 15% пина — кросс-фейд в макро
        var macroOp = smooth01((p - 0.85) / 0.15);
        gsap.set(jarMacro, { opacity: macroOp });

        // HUD-выноски по третям
        setHud(hud1, p >= 0.02 && p < 0.35);
        setHud(hud2, p >= 0.35 && p < 0.68);
        setHud(hud3, p >= 0.68 && p < 0.85);
      }
    });

    function setHud(el, active){
      if (!el) return;
      gsap.to(el, { opacity: active ? 1 : 0, y: active ? 0 : 12, duration:0.3, ease:"power1.out", overwrite:"auto" });
    }

    /* ---------- ГЛАВА 3: путь еды — clip-path wipe по четвертям + факты + шкала ---------- */
    var pathBgs = {
      farm: document.querySelector('.path-bg[data-stage="farm"]'),
      workshop: document.querySelector('.path-bg[data-stage="workshop"]'),
      lab: document.querySelector('.path-bg[data-stage="lab"]'),
      shelf: document.querySelector('.path-bg[data-stage="shelf"]')
    };
    var pathFacts = {
      farm: document.querySelector('.path-fact[data-stage="farm"]'),
      workshop: document.querySelector('.path-fact[data-stage="workshop"]'),
      lab: document.querySelector('.path-fact[data-stage="lab"]'),
      shelf: document.querySelector('.path-fact[data-stage="shelf"]')
    };
    var scaleMarks = {
      farm: document.querySelector('.scale-mark[data-mark="farm"]'),
      workshop: document.querySelector('.scale-mark[data-mark="workshop"]'),
      lab: document.querySelector('.scale-mark[data-mark="lab"]'),
      shelf: document.querySelector('.scale-mark[data-mark="shelf"]')
    };

    var stageOrder = ["farm","workshop","lab","shelf"];

    ScrollTrigger.create({
      trigger: "#path-wrap",
      start: "top top",
      end: "bottom bottom",
      pin: ".chapter-path",
      scrub: true,
      onUpdate: function(self){
        var p = self.progress;
        var quarter = Math.min(3, Math.floor(p * 4));
        var activeStage = stageOrder[quarter];

        stageOrder.forEach(function(stage, i){
          var bg = pathBgs[stage];
          if (!bg) return;
          if (i < quarter){
            gsap.set(bg, { opacity:1, clipPath:"inset(0 0 0 0)" });
          } else if (i === quarter){
            var local = clamp01((p * 4) - quarter);
            gsap.set(bg, { opacity:1, clipPath:"inset(" + (100 - local*100) + "% 0 0 0)" });
          } else {
            gsap.set(bg, { opacity:0, clipPath:"inset(100% 0 0 0)" });
          }
        });

        stageOrder.forEach(function(stage){
          var fact = pathFacts[stage];
          if (fact) fact.classList.toggle("active", stage === activeStage);
          var mark = scaleMarks[stage];
          if (mark) mark.classList.toggle("active", stage === activeStage);
        });
      },
      onLeaveBack: function(){
        stageOrder.forEach(function(stage){
          var mark = scaleMarks[stage];
          if (mark) mark.classList.remove("active");
        });
      },
      onLeave: function(){
        stageOrder.forEach(function(stage){
          var mark = scaleMarks[stage];
          if (mark) mark.classList.remove("active");
        });
      }
    });

    /* ---------- ГЛАВА 4: манифест — три строки по трети пина ---------- */
    var manifestoLines = gsap.utils.toArray(".manifesto-line");
    ScrollTrigger.create({
      trigger: "#manifesto-wrap",
      start: "top top",
      end: "bottom bottom",
      pin: ".chapter-manifesto",
      scrub: true,
      onUpdate: function(self){
        var p = self.progress;
        manifestoLines.forEach(function(line, i){
          var start = i / manifestoLines.length;
          var end = start + (1 / manifestoLines.length) * 0.8;
          var local = clamp01((p - start) / (end - start));
          gsap.set(line, { opacity: local, y: 30 * (1 - local) });
        });
      }
    });

    /* ---------- ГЛАВА 6: миссия + карточки-приглашения — reveal при входе (без пина) ---------- */
    initMissionReveal(false);

    initCounters();
    initForms();

    ScrollTrigger.refresh();
  }

  /* ---------- ГЛАВА 6: reveal-анимация контента (y+opacity, не pin) ---------- */
  function initMissionReveal(reducedMotion){
    var items = document.querySelectorAll("#mission-wrap .reveal");
    if (!items.length) return;

    if (reducedMotion || !window.gsap || !window.ScrollTrigger){
      items.forEach(function(el){ el.style.opacity = 1; el.style.transform = "none"; });
      return;
    }

    var arr = gsap.utils.toArray(items);
    gsap.set(arr, { opacity:0, y:32 });
    ScrollTrigger.batch(arr, {
      start:"top 85%",
      once:true,
      onEnter:function(batch){
        gsap.to(batch, { opacity:1, y:0, duration:0.7, stagger:0.12, ease:"power2.out" });
      }
    });
  }

  function clamp01(v){ return Math.max(0, Math.min(1, v)); }
  function smooth01(v){ v = clamp01(v); return v * v * (3 - 2 * v); }

  /* ---------- Счётчик предзаказа ---------- */
  function initCounters(){
    var counterEl = document.getElementById("preorder-count");
    var progressFill = document.getElementById("preorder-progress-fill");
    if (!counterEl) return;
    var target = parseInt(counterEl.getAttribute("data-target"), 10) || 0;
    var animated = false;

    function run(){
      if (animated) return;
      animated = true;
      if (progressFill) progressFill.style.width = Math.round((target/500)*100) + "%";

      if (window.gsap && !document.body.classList.contains("reduced-motion")){
        var obj = { val: 0 };
        gsap.to(obj, {
          val: target,
          duration: 1.4,
          ease: "power2.out",
          onUpdate: function(){ counterEl.textContent = Math.round(obj.val); }
        });
      } else {
        counterEl.textContent = target;
      }
    }

    if (window.ScrollTrigger){
      ScrollTrigger.create({
        trigger: counterEl,
        start: "top 85%",
        once: true,
        onEnter: run
      });
    } else {
      run();
    }
  }

  /* ---------- Формы предзаказа / пайщика ---------- */
  function initForms(){
    document.querySelectorAll(".reserve-form").forEach(function(form){
      form.addEventListener("submit", function(e){
        e.preventDefault();
        var key = form.getAttribute("data-storage-key") || "banochka_reserve";
        var from = parseInt(form.getAttribute("data-range-from"), 10) || 100;
        var to = parseInt(form.getAttribute("data-range-to"), 10) || 200;
        var num = from + Math.floor(Math.random() * (to - from + 1));

        var hasRole = !!form.elements["role"];
        var hasCity = !!form.elements["city"];
        var data;

        if (hasRole && hasCity){
          // Расширенная форма предзаказа (глава 5): роль + город + карта заявок.
          var roleInput = form.querySelector('input[name="role"]:checked');
          var roleVal = roleInput ? roleInput.value : "consumer";
          var cityVal = form.elements["city"].value || "";

          data = {
            name: form.elements["name"] ? form.elements["name"].value : "",
            contact: form.elements["contact"] ? form.elements["contact"].value : "",
            role: roleVal,
            city: cityVal,
            ts: Date.now()
          };

          try {
            window.localStorage.setItem(key, JSON.stringify(data));
          } catch (err) {
            // localStorage может быть недоступен (приватный режим) — не блокируем UX
          }

          registerPreorderOnMap(cityVal, roleVal);
        } else {
          data = {
            name: form.elements["name"] ? form.elements["name"].value : "",
            contact: form.elements["contact"] ? form.elements["contact"].value : "",
            number: num,
            ts: Date.now()
          };

          try {
            window.localStorage.setItem(key, JSON.stringify(data));
          } catch (err) {
            // localStorage может быть недоступен (приватный режим) — не блокируем UX
          }
        }

        var success = document.createElement("div");
        success.className = "reserve-success";
        success.textContent = "Вы в списке первой варки. №" + num;
        form.replaceWith(success);
      });
    });
  }

  /* ================================================================
     ГЛАВА 6: КАРТА ЗАЯВОК
     ================================================================ */
  var ROLE_META = {
    consumer:  { label:"Потребитель", color:"#F4A824" },
    farmer:    { label:"Фермер",      color:"#7BC47F" },
    workshop:  { label:"Цех",         color:"#FF8A3D" },
    warehouse: { label:"Склад",       color:"#6FA8DC" },
    logistics: { label:"Логистика",   color:"#E4557A" }
  };
  var ROLE_ORDER = ["consumer","farmer","workshop","warehouse","logistics"];

  // Координаты городов в % от viewBox карты (0..100 по x и y).
  // Пересчитаны из реальных lat/lon той же проекцией, что и контур России
  // (equirectangular, cos 60°N, сдвиг антимеридиана; источник контура —
  // public-domain world.geo.json / Natural Earth, RUS). СПб и Краснодар
  // чуть сдвинуты вглубь материка, чтобы джиттер не выносил точки в море.
  var CITY_COORDS = {
    "москва":           { x:11.6, y:57.6 },
    "санкт-петербург":  { x:8.7,  y:49.2 },
    "спб":              { x:8.7,  y:49.2 },
    "питер":            { x:8.7,  y:49.2 },
    "казань":           { x:18.2, y:57.5 },
    "липецк":           { x:12.8, y:64.1 },
    "тюмень":           { x:27.6, y:54.7 },
    "новосибирск":      { x:37.5, y:59.1 },
    "екатеринбург":     { x:24.8, y:55.4 },
    "краснодар":        { x:13.4, y:78.6 },
    "нижний новгород":  { x:15.3, y:56.5 },
    "н.новгород":       { x:15.3, y:56.5 },
    "н. новгород":      { x:15.3, y:56.5 },
    "нн":               { x:15.3, y:56.5 },
    "самара":           { x:18.8, y:62.9 },
    "уфа":              { x:22.1, y:59.7 }
  };

  // 24 демо-заявки, захардкожены по спеке.
  var DEMO_POINTS = [
    { city:"Москва", role:"consumer" },
    { city:"Москва", role:"consumer" },
    { city:"Москва", role:"consumer" },
    { city:"Москва", role:"farmer" },
    { city:"Москва", role:"workshop" },
    { city:"Москва", role:"logistics" },
    { city:"Санкт-Петербург", role:"consumer" },
    { city:"Санкт-Петербург", role:"consumer" },
    { city:"Санкт-Петербург", role:"warehouse" },
    { city:"Казань", role:"consumer" },
    { city:"Казань", role:"farmer" },
    { city:"Липецк", role:"farmer" },
    { city:"Липецк", role:"workshop" },
    { city:"Тюмень", role:"farmer" },
    { city:"Тюмень", role:"consumer" },
    { city:"Новосибирск", role:"consumer" },
    { city:"Новосибирск", role:"warehouse" },
    { city:"Екатеринбург", role:"consumer" },
    { city:"Екатеринбург", role:"logistics" },
    { city:"Краснодар", role:"farmer" },
    { city:"Краснодар", role:"consumer" },
    { city:"Нижний Новгород", role:"consumer" },
    { city:"Самара", role:"consumer" },
    { city:"Уфа", role:"consumer" }
  ];

  var MAP_STORAGE_KEY = "banochka_map_points";

  var mapDotsEl = null;
  var mapLegendEl = null;
  var mapTotalEl = null;
  var mapJitterCounters = {};
  var mapCounts = { total:0, roles:{}, cities:{} };

  function normalizeCity(raw){
    return (raw || "").toString().trim().toLowerCase().replace(/ё/g, "е");
  }

  // Небольшое детерминированное смещение, чтобы точки одного города не сливались в одну.
  // Радиус ≤1.6% viewBox — проверено, что при таком джиттере точки всех 11 городов
  // остаются внутри контура материка (point-in-polygon по всем направлениям).
  function jitterFor(cityKey){
    var n = mapJitterCounters[cityKey] || 0;
    mapJitterCounters[cityKey] = n + 1;
    if (n === 0) return { dx:0, dy:0 };
    var angle = (n * 61) % 360;
    var rad = angle * Math.PI / 180;
    var radius = 1.0 + (n % 3) * 0.3;
    return { dx: Math.cos(rad) * radius, dy: Math.sin(rad) * radius * 0.6 };
  }

  function addDotToMap(cityLabel, role, delay){
    if (!mapDotsEl) return false;
    var key = normalizeCity(cityLabel);
    var coords = CITY_COORDS[key];
    if (!coords) return false;

    var jitter = jitterFor(key);
    var xPct = coords.x + jitter.dx;
    var yPct = coords.y + jitter.dy;
    var svgX = (xPct / 100) * 1000;
    var svgY = (yPct / 100) * 550;

    var meta = ROLE_META[role] || ROLE_META.consumer;
    var svgNS = "http://www.w3.org/2000/svg";

    var g = document.createElementNS(svgNS, "g");
    g.setAttribute("class", "map-dot");
    g.setAttribute("data-role", role);
    g.setAttribute("data-city", cityLabel);
    g.setAttribute("transform", "translate(" + svgX.toFixed(1) + "," + svgY.toFixed(1) + ")");
    g.style.setProperty("--role-color", meta.color);
    g.style.setProperty("--dot-delay", (typeof delay === "number" ? delay : Math.random() * 2.5).toFixed(2) + "s");

    var ping = document.createElementNS(svgNS, "circle");
    ping.setAttribute("class", "map-dot-ping");
    ping.setAttribute("r", "5");
    ping.setAttribute("fill", "none");
    ping.setAttribute("stroke", "var(--role-color)");
    ping.setAttribute("stroke-width", "2");

    var core = document.createElementNS(svgNS, "circle");
    core.setAttribute("class", "map-dot-core");
    core.setAttribute("r", "5");
    core.setAttribute("fill", "var(--role-color)");

    g.appendChild(ping);
    g.appendChild(core);
    mapDotsEl.appendChild(g);
    return true;
  }

  function loadStoredMapPoints(){
    try {
      var raw = window.localStorage.getItem(MAP_STORAGE_KEY);
      if (!raw) return [];
      var arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr : [];
    } catch (err){
      return [];
    }
  }

  function saveStoredMapPoints(arr){
    try {
      window.localStorage.setItem(MAP_STORAGE_KEY, JSON.stringify(arr));
    } catch (err){
      // localStorage может быть недоступен — пропускаем сохранение
    }
  }

  function registerCount(cityLabel, role, cityKnown){
    mapCounts.total++;
    if (mapCounts.roles[role] === undefined) mapCounts.roles[role] = 0;
    mapCounts.roles[role]++;
    if (cityKnown){
      mapCounts.cities[normalizeCity(cityLabel)] = true;
    }
  }

  function countCities(){
    return Object.keys(mapCounts.cities).length;
  }

  function renderLegend(){
    if (!mapLegendEl) return;
    mapLegendEl.innerHTML = "";
    ROLE_ORDER.forEach(function(role){
      var meta = ROLE_META[role];
      var li = document.createElement("li");

      var swatch = document.createElement("span");
      swatch.className = "map-legend-swatch";
      swatch.style.background = meta.color;

      var label = document.createElement("span");
      label.textContent = meta.label + ": " + (mapCounts.roles[role] || 0);

      li.appendChild(swatch);
      li.appendChild(label);
      mapLegendEl.appendChild(li);
    });
  }

  function updateTotals(){
    if (mapTotalEl){
      mapTotalEl.textContent = "НА КАРТЕ: " + mapCounts.total + " ЗАЯВОК · " + countCities() + " ГОРОДОВ";
    }
    renderLegend();
  }

  function initMap(){
    mapDotsEl = document.getElementById("map-dots");
    mapLegendEl = document.getElementById("map-legend");
    mapTotalEl = document.getElementById("map-total-line");
    if (!mapDotsEl) return;

    DEMO_POINTS.forEach(function(p){
      var added = addDotToMap(p.city, p.role);
      registerCount(p.city, p.role, added);
    });

    loadStoredMapPoints().forEach(function(p){
      var added = addDotToMap(p.city, p.role, p.delay);
      registerCount(p.city, p.role, added);
    });

    updateTotals();
  }

  // Вызывается из submit-обработчика формы предзаказа (глава 5).
  function registerPreorderOnMap(cityLabel, role){
    var delay = Math.random() * 2.5;

    var added = addDotToMap(cityLabel, role, delay);
    registerCount(cityLabel, role, added);
    updateTotals();

    if (added){
      var stored = loadStoredMapPoints();
      stored.push({ city: cityLabel, role: role, delay: delay, ts: Date.now() });
      saveStoredMapPoints(stored);
    }
  }

  /* ================================================================
     СТАРТ
     ================================================================ */
  document.addEventListener("DOMContentLoaded", function(){
    preload(function(){
      applyAssetBackgrounds();
      hidePreloader(function(){
        initApp();
      });
    });
  });

})();
