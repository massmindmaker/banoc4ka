/* ==========================================================================
   БАНОЧКА — main.js
   Прелоадер с реальным прогрессом → фолбэки ассетов → GSAP/ScrollTrigger сцены.
   ========================================================================== */
(function(){
  "use strict";

  var ASSET_NAMES = [
    "hero-sky",
    "farm","workshop","lab","shelf",
    "burst"
  ];

  // Раскадровка v5: логическое имя ассета (см. data-bg в index.html) -> реальный
  // файл в assets/. hero-sky теперь — мастер-кадр B (статичный фолбэк/OG для
  // видео-hero, см. setupHeroVideo()). jar-front/quarter/side удалены v3→v4:
  // глава 2 больше не грузит их — заменены на canvas-скраб 72 кадров
  // assets/jar-alpha/ (JarCanvas), которые прелоадер НЕ ждёт (грузятся
  // прогрессивно после старта страницы). Фоновые фото глав манифеста и
  // пайщиков, UGC-полоса и пролёт банки между главами удалены v4→v5 вместе
  // с соответствующими им ассетами.
  //
  // Перф-редизайн (вес до load): у каждого фона теперь есть .avif и .webp
  // рядом с оригиналом (см. ASSET_ORIGINAL_EXT). Загрузка пробует по цепочке
  // avif → webp → оригинал через реальный Image().onerror — это надёжнее, чем
  // canvas.toDataURL('image/webp'), т.к. проверяет фактическую декодируемость
  // конкретного файла в конкретном браузере, а не общую поддержку формата.
  var ASSET_BASENAMES = {
    "hero-sky":              "hero-soft-B",
    "farm":                  "SB-04",
    "workshop":              "SB-05",
    "lab":                   "lab",
    "shelf":                 "SB-07",
    "burst":                 "SB-09"
  };

  var ASSET_ORIGINAL_EXT = {
    "hero-sky":              "png",
    "farm":                  "png",
    "workshop":              "png",
    "lab":                   "jpg",
    "shelf":                 "png",
    "burst":                 "png"
  };

  var ASSET_STATUS = {};   // name -> true (loaded) | false (error)
  var ASSET_RESOLVED = {}; // name -> URL, который реально загрузился (avif/webp/оригинал)

  function assetCandidates(name){
    var base = ASSET_BASENAMES[name] || name;
    var ext = ASSET_ORIGINAL_EXT[name] || "jpg";
    return [
      "assets/" + base + ".avif",
      "assets/" + base + ".webp",
      "assets/" + base + "." + ext
    ];
  }

  // Пробует загрузить кандидатов по очереди (avif → webp → оригинал), берёт
  // первый, который реально декодировался в этом браузере/сети.
  function loadWithFallback(name, onDone){
    var candidates = assetCandidates(name);
    var i = 0;
    function tryNext(){
      if (i >= candidates.length){ onDone(false); return; }
      var url = candidates[i++];
      var img = new Image();
      img.onload = function(){ ASSET_RESOLVED[name] = url; onDone(true); };
      img.onerror = tryNext;
      img.src = url;
    }
    tryNext();
  }

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
      loadWithFallback(name, function(ok){
        ASSET_STATUS[name] = ok;
        settled++;
        update();
      });
    });

    update();
  }

  /* ---------------- Применение фонов + фолбэков ---------------- */
  function applyAssetBackgrounds(){
    var nodes = document.querySelectorAll("[data-bg]");
    nodes.forEach(function(el){
      var name = el.getAttribute("data-bg");
      if (ASSET_STATUS[name] && ASSET_RESOLVED[name]){
        el.style.backgroundImage = "url('" + ASSET_RESOLVED[name] + "')";
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

  /* ---------------- Пословный сплиттер (фолбэк на SplitText) ---------------- */
  function splitWords(el){
    var text = el.textContent;
    el.textContent = "";
    var words = text.split(" ");
    var frag = document.createDocumentFragment();
    var allWords = [];

    words.forEach(function(word, wi){
      var wordSpan = document.createElement("span");
      wordSpan.className = "word";
      wordSpan.textContent = word;
      frag.appendChild(wordSpan);
      allWords.push(wordSpan);
      if (wi < words.length - 1){
        frag.appendChild(document.createTextNode(" "));
      }
    });

    el.appendChild(frag);
    return allWords;
  }

  /* ================================================================
     HERO-ВИДЕО: подставляет 16:9/9:16 луп по matchMedia, фолбэк на постер
     при autoplay-блокировке/ошибке. НЕ участвует в прелоадере (грузится
     после закрытия прелоадера, чтобы не тормозить первый показ страницы).
     ================================================================ */
  function setupHeroVideo(reducedMotion){
    var video = document.getElementById("hero-video");
    if (!video) return;

    if (reducedMotion){
      // По ТЗ: видео не грузим вообще — остаётся только постер (bg-layer/hero-sky).
      video.remove();
      return;
    }

    var isMobile = window.matchMedia("(max-width:767px)").matches;
    var src = isMobile ? "assets/hero-loop-9x16.mp4" : "assets/hero-loop-16x9.mp4";
    var poster = isMobile ? "assets/hero-poster-9x16.jpg" : "assets/hero-poster-16x9.jpg";

    var fellBack = false;
    function fallbackToPoster(){
      if (fellBack) return;
      fellBack = true;
      video.classList.add("hero-video-hidden");
    }

    video.setAttribute("poster", poster);
    video.addEventListener("error", fallbackToPoster);
    video.src = src;
    video.load();

    var playPromise;
    try { playPromise = video.play(); } catch (err) { playPromise = null; }
    if (playPromise && typeof playPromise.catch === "function"){
      playPromise.catch(function(){ /* autoplay заблокирован — решит проверка ниже */ });
    }

    // Частый случай: autoplay тихо блокируется без события error — проверяем
    // фактическое состояние воспроизведения через 1.5с и откатываемся на постер.
    setTimeout(function(){
      if (video.paused) fallbackToPoster();
    }, 1500);
  }

  /* ================================================================
     ГЛАВА 2 — JAR CANVAS: canvas-скраб 72 (36 на мобиле) кадров вращения банки.
     Прелоад прогрессивный: кадр 1 — сразу, остальные — пачками по 6 через
     requestIdleCallback, чтобы не блокировать прелоадер и не грузить разом
     весь трафик. drawFrame всегда рисует ближайший уже загруженный кадр.
     ================================================================ */
  var JarCanvas = (function(){
    var canvas, ctx, images, loadedFlags, frameIndices, totalFrames;
    var naturalW = 560, naturalH = 560;
    var lastDrawnIndex = -1;
    var resizeHandlerBound = false;

    function pad4(n){ return ("0000" + n).slice(-4); }
    function framePath(n){ return "assets/jar-alpha/jar-a-" + pad4(n) + ".webp"; }

    function init(canvasEl, opts){
      canvas = canvasEl;
      if (!canvas) return;
      ctx = canvas.getContext("2d");

      var step = (opts && opts.mobile) ? 2 : 1;
      frameIndices = [];
      for (var i = 1; i <= 72; i += step) frameIndices.push(i);
      totalFrames = frameIndices.length;
      images = new Array(totalFrames);
      loadedFlags = new Array(totalFrames);
      lastDrawnIndex = -1;

      resizeCanvas();
      if (!resizeHandlerBound){
        window.addEventListener("resize", debounce(resizeCanvas, 150));
        resizeHandlerBound = true;
      }

      var onlyFirst = !!(opts && opts.onlyFirst);
      loadFrame(0, function(){
        drawFrame(0);
        if (!onlyFirst) loadRestProgressively();
      });
    }

    function loadFrame(idx, cb){
      if (idx < 0 || idx >= totalFrames){ if (cb) cb(); return; }
      if (loadedFlags[idx]){ if (cb) cb(); return; }
      var img = new Image();
      img.onload = function(){
        loadedFlags[idx] = true;
        images[idx] = img;
        if (idx === 0){
          naturalW = img.naturalWidth || naturalW;
          naturalH = img.naturalHeight || naturalH;
          resizeCanvas();
        }
        if (cb) cb();
      };
      img.onerror = function(){ if (cb) cb(); };
      img.src = framePath(frameIndices[idx]);
    }

    function loadRestProgressively(){
      var idx = 1;
      function runBatch(){
        var loadedInBatch = 0;
        function next(){
          if (idx >= totalFrames) return;
          var current = idx++;
          loadFrame(current, function(){
            loadedInBatch++;
            if (loadedInBatch < 6 && idx < totalFrames) next();
          });
        }
        next();
        if (idx < totalFrames) scheduleIdle(runBatch);
      }
      scheduleIdle(runBatch);
    }

    function scheduleIdle(fn){
      if (window.requestIdleCallback){
        requestIdleCallback(fn, { timeout: 500 });
      } else {
        setTimeout(fn, 120);
      }
    }

    function nearestLoadedIndex(idx){
      if (idx < 0 || idx >= totalFrames) return -1;
      if (loadedFlags[idx]) return idx;
      for (var d = 1; d < totalFrames; d++){
        if (idx - d >= 0 && loadedFlags[idx - d]) return idx - d;
        if (idx + d < totalFrames && loadedFlags[idx + d]) return idx + d;
      }
      return -1;
    }

    function resizeCanvas(){
      if (!canvas || !canvas.parentElement) return;
      var rect = canvas.parentElement.getBoundingClientRect();
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      var w = Math.max(1, Math.round(rect.width * dpr));
      var h = Math.max(1, Math.round(rect.height * dpr));
      if (canvas.width !== w) canvas.width = w;
      if (canvas.height !== h) canvas.height = h;
      canvas.style.width = rect.width + "px";
      canvas.style.height = rect.height + "px";
      if (lastDrawnIndex >= 0) drawFrame(lastDrawnIndex);
    }

    function drawFrame(idx){
      if (!ctx) return;
      idx = Math.max(0, Math.min(totalFrames - 1, idx));
      var useIdx = nearestLoadedIndex(idx);
      if (useIdx === -1) return;
      var img = images[useIdx];
      lastDrawnIndex = idx;
      var cw = canvas.width, ch = canvas.height;
      ctx.clearRect(0, 0, cw, ch);
      var scale = Math.min(cw / naturalW, ch / naturalH);
      var dw = naturalW * scale, dh = naturalH * scale;
      var dx = (cw - dw) / 2, dy = (ch - dh) / 2;
      ctx.drawImage(img, dx, dy, dw, dh);
    }

    function setProgress(p){
      if (!totalFrames) return;
      var idx = Math.round(clamp01(p) * (totalFrames - 1));
      drawFrame(idx);
    }

    function getCanvas(){ return canvas; }

    return { init: init, setProgress: setProgress, getCanvas: getCanvas };
  })();

  function debounce(fn, wait){
    var t;
    return function(){
      var args = arguments, ctx = this;
      clearTimeout(t);
      t = setTimeout(function(){ fn.apply(ctx, args); }, wait);
    };
  }

  /* ================================================================
     ГЛАВНАЯ ИНИЦИАЛИЗАЦИЯ (после закрытия прелоадера)
     ================================================================ */
  function initApp(){
    var reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    var isMobileViewport = window.matchMedia("(max-width:767px)").matches;

    if (reducedMotion){ document.body.classList.add("reduced-motion"); }

    /* ---------- ГЛАВА 1: hero-видео (не блокирует прелоадер, грузится тут) ---------- */
    setupHeroVideo(reducedMotion);

    /* ---------- ГЛАВА 2: банка — canvas-скраб. Инициализация и первый кадр
       нужны и при reduced-motion (статичный кадр 1 без прелоада остальных). ---------- */
    var jarCanvasEl = document.getElementById("jar-canvas");
    if (jarCanvasEl){
      JarCanvas.init(jarCanvasEl, { mobile: isMobileViewport, onlyFirst: reducedMotion });
    }

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

    /* ---------- HERO: заголовок появляется по словам (не по буквам),
       чтобы «В БАНКЕ.» не рвалось на анимации ---------- */
    var heroTitle = document.getElementById("hero-title");
    if (heroTitle){
      var words;
      if (window.SplitText){
        // type:"words" — SplitText сам добавляет white-space:nowrap словам,
        // перенос строки возможен только между словами, не внутри.
        var st = new SplitText(heroTitle, { type:"words" });
        words = st.words;
        words.forEach(function(w){ w.classList.add("word"); });
      } else {
        words = splitWords(heroTitle);
      }

      if (reducedMotion || !window.gsap){
        words.forEach(function(w){ w.style.opacity = 1; });
      } else {
        gsap.set(words, { opacity:0, y:40 });
        gsap.to(words, {
          opacity:1, y:0,
          duration:0.7,
          ease:"power2.out",
          stagger:0.08,
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
      initReveal("#mission-wrap", true);
      initReveal("#members", true);
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

    /* ---------- ГЛАВА 2: банка — canvas-скраб 72 кадров + HUD ---------- */
    var hud1 = document.querySelector('[data-hud="1"]');
    var hud2 = document.querySelector('[data-hud="2"]');
    var hud3 = document.querySelector('[data-hud="3"]');

    ScrollTrigger.create({
      trigger: "#jar-wrap",
      start: "top top",
      end: "bottom bottom",
      pin: ".chapter-jar",
      scrub: true,
      onUpdate: function(self){
        var p = self.progress;

        JarCanvas.setProgress(p);

        // HUD-выноски по третям (без изменений относительно v3)
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

    /* ---------- ГЛАВЫ 6/7: миссия + карточки-приглашения + пайщики — reveal при входе (без пина) ---------- */
    initReveal("#mission-wrap", false);
    initReveal("#members", false);

    initCounters();
    initForms();

    ScrollTrigger.refresh();
  }

  /* ---------- ГЛАВЫ 6/7: reveal-анимация контента (y+opacity, не pin) ---------- */
  function initReveal(rootSelector, reducedMotion){
    var items = document.querySelectorAll(rootSelector + " .reveal");
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
    var animated = false;

    function run(){
      if (animated) return;
      animated = true;
      // data-target читаем именно тут (не в момент вызова initCounters), чтобы
      // успеть подхватить обновление от /api/summary — см. applyLiveSummary().
      var target = parseInt(counterEl.getAttribute("data-target"), 10) || 0;
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
      // Кнопка отправки заблокирована, пока не отмечен чекбокс согласия на
      // обработку ПДн (юридическое требование — см. privacy.html/offer.html).
      var consentInput = form.querySelector('input[name="consent"]');
      var submitBtn = form.querySelector('button[type="submit"]');
      if (consentInput && submitBtn){
        var syncSubmitState = function(){ submitBtn.disabled = !consentInput.checked; };
        consentInput.addEventListener("change", syncSubmitState);
        syncSubmitState();
      }

      form.addEventListener("submit", function(e){
        e.preventDefault();

        // Дублируем проверку согласия на JS-уровне (не только disabled-кнопка
        // и required — на случай программной отправки формы).
        if (consentInput && !consentInput.checked){
          consentInput.focus();
          return;
        }

        var key = form.getAttribute("data-storage-key") || "banochka_reserve";
        var from = parseInt(form.getAttribute("data-range-from"), 10) || 100;
        var to = parseInt(form.getAttribute("data-range-to"), 10) || 200;
        var num = from + Math.floor(Math.random() * (to - from + 1));

        var hasRole = !!form.elements["role"];
        var hasCity = !!form.elements["city"];

        var nameVal = form.elements["name"] ? form.elements["name"].value : "";
        var contactVal = form.elements["contact"] ? form.elements["contact"].value : "";
        var websiteVal = form.elements["website"] ? form.elements["website"].value : "";
        var roleVal = null;
        var cityVal = null;

        var payload = {
          type: (hasRole && hasCity) ? "preorder" : "pai",
          name: nameVal,
          contact: contactVal,
          website: websiteVal, // honeypot: пустое у людей, заполнено ботами
          consent: true
        };

        if (hasRole && hasCity){
          // Расширенная форма предзаказа (глава 5): роль + город + карта заявок.
          var roleInput = form.querySelector('input[name="role"]:checked');
          roleVal = roleInput ? roleInput.value : "consumer";
          cityVal = form.elements["city"].value || "";

          payload.role = ROLE_TO_API[roleVal] || roleVal;
          payload.city = cityVal;
        }

        function finish(){
          if (hasRole && hasCity){
            registerPreorderOnMap(cityVal, roleVal);
          }
          var success = document.createElement("div");
          success.className = "reserve-success";
          success.textContent = "Вы в списке первой варки. №" + num;
          form.replaceWith(success);
        }

        function fallbackLocalStorage(){
          // FALLBACK: бэкенд недоступен (сеть упала/500) — сохраняем локально,
          // как было до появления api/lead.js. Не блокирует UX пользователя.
          var data;
          if (hasRole && hasCity){
            data = { name:nameVal, contact:contactVal, role:roleVal, city:cityVal, ts:Date.now() };
          } else {
            data = { name:nameVal, contact:contactVal, number:num, ts:Date.now() };
          }
          try {
            window.localStorage.setItem(key, JSON.stringify(data));
          } catch (err) {
            // localStorage может быть недоступен (приватный режим) — не блокируем UX
          }
        }

        fetch("/api/lead", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        }).then(function(res){
          if (!res.ok){ throw new Error("bad status " + res.status); }
          finish();
        }).catch(function(){
          // FALLBACK: сетевая ошибка/бэкенд недоступен — прежний localStorage-путь.
          fallbackLocalStorage();
          finish();
        });
      });
    });
  }

  /* ================================================================
     ГЛАВА 6: КАРТА ЗАЯВОК
     ================================================================ */
  var ROLE_META = {
    consumer:  { label:"Потребитель", color:"#C1651D" },
    farmer:    { label:"Фермер",      color:"#4A5D3A" },
    workshop:  { label:"Цех",         color:"#D2451E" },
    warehouse: { label:"Склад",       color:"#8A6F4E" },
    logistics: { label:"Логистика",   color:"#7C3535" }
  };
  var ROLE_ORDER = ["consumer","farmer","workshop","warehouse","logistics"];

  // Бэкенд (api/lead.js) хранит/отдаёт роль как русское слово из фиксированного
  // списка — нужно сопоставление с внутренними латинскими кодами ролей, которые
  // использует вся остальная логика карты (ROLE_META, data-role, CSS-переменные).
  var ROLE_TO_API = {
    consumer:"потребитель", farmer:"фермер", workshop:"цех",
    warehouse:"склад", logistics:"логистика"
  };
  var ROLE_FROM_API = {
    "потребитель":"consumer", "фермер":"farmer", "цех":"workshop",
    "склад":"warehouse", "логистика":"logistics"
  };

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

  // Стартовый оффсет кампании: 137 "бумажных" предзаказов, собранных до
  // запуска живого счётчика с бэкенда. Реальные заявки (api/summary.js
  // -> preorders) складываются поверх этого числа как в счётчике (глава 5),
  // так и в html-фолбэке data-target на случай, если /api/summary недоступен.
  var PREORDER_BASE = 137;

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

    updateTotals();
    hydrateLiveSummary();
  }

  // Живые данные с бэкенда (api/summary.js): реальные предзаказы поверх демо.
  // Раньше здесь подмешивались точки из localStorage (banochka_map_points) —
  // теперь источник правды один — сервер. Сеть недоступна/бэкенд не ответил →
  // молча остаёмся на демо-данных (как было раньше).
  function hydrateLiveSummary(){
    fetch("/api/summary")
      .then(function(res){
        if (!res.ok){ throw new Error("bad status " + res.status); }
        return res.json();
      })
      .then(applyLiveSummary)
      .catch(function(){ /* нет сети/бэкенда — остаёмся на демо */ });
  }

  function dominantApiRole(rolesObj){
    var best = null, bestCount = -1;
    Object.keys(rolesObj || {}).forEach(function(apiRole){
      var count = rolesObj[apiRole];
      if (count > bestCount){ bestCount = count; best = apiRole; }
    });
    return best;
  }

  function applyLiveSummary(summary){
    if (!summary) return;

    // Глава 5: счётчик предзаказов = демо-база (PREORDER_BASE) + реальные предзаказы.
    var counterEl = document.getElementById("preorder-count");
    if (counterEl){
      counterEl.setAttribute("data-target", String(PREORDER_BASE + (summary.preorders || 0)));
    }

    // Глава 6: одна живая точка на город из byCity, цвет — преобладающая роль.
    var byCity = summary.byCity || {};
    Object.keys(byCity).forEach(function(cityName){
      var apiRole = dominantApiRole(byCity[cityName] && byCity[cityName].roles);
      var role = ROLE_FROM_API[apiRole] || "consumer";
      var added = addDotToMap(cityName, role);
      registerCount(cityName, role, added);
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
