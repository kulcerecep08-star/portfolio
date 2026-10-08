(() => {
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const canHover = matchMedia("(hover: hover) and (pointer: fine)").matches;

  const vimeoId = (url) => (String(url).match(/vimeo\.com\/(?:.*\/)?(\d+)/) || [])[1];

  const embedUrl = (id, params) =>
    `https://player.vimeo.com/video/${id}?` +
    new URLSearchParams({ dnt: 1, title: 0, byline: 0, portrait: 0, ...params });

  // Title, thumbnail and size straight from Vimeo, so a project only needs its link.
  const meta = (id) =>
    fetch(`https://vimeo.com/api/oembed.json?url=https://vimeo.com/${id}&width=1280`)
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null);

  const makeIframe = (src, extra = {}) => {
    const f = document.createElement("iframe");
    f.src = src;
    f.allow = "autoplay; fullscreen; picture-in-picture";
    f.setAttribute("allowfullscreen", "");
    Object.assign(f, extra);
    return f;
  };

  /* ---------- Showreel ---------- */

  const heroMedia = document.getElementById("heroMedia");
  const playBtn = document.getElementById("heroPlay");
  const soundBtn = document.getElementById("heroSound");
  const playhead = document.getElementById("playhead");
  const reelId = vimeoId(SHOWREEL);
  let reel = null;
  let userPaused = reduceMotion;

  meta(reelId).then((m) => {
    if (m) heroMedia.style.background = `center / cover no-repeat url("${m.thumbnail_url}")`;
    if (reduceMotion) heroMedia.classList.add("is-ready");
  });

  const setPlayState = (paused) => {
    playBtn.classList.toggle("is-paused", paused);
    playBtn.setAttribute("aria-label", paused ? "Play showreel" : "Pause showreel");
  };

  const mountReel = () => {
    const iframe = makeIframe(
      embedUrl(reelId, { background: 1, autoplay: 1, muted: 1, loop: 1, autopause: 0 }),
      { title: "Showreel", tabIndex: -1 }
    );
    heroMedia.append(iframe);
    reel = new Vimeo.Player(iframe);
    reel.on("play", () => { heroMedia.classList.add("is-ready"); setPlayState(false); });
    reel.on("pause", () => setPlayState(true));
    reel.on("timeupdate", ({ percent }) => { playhead.style.transform = `scaleX(${percent})`; });
  };

  if (reduceMotion) setPlayState(true);
  else mountReel();

  playBtn.addEventListener("click", () => {
    if (!reel) { userPaused = false; mountReel(); return; }
    reel.getPaused().then((paused) => {
      userPaused = !paused;
      paused ? reel.play() : reel.pause();
    });
  });

  soundBtn.addEventListener("click", () => {
    const on = !soundBtn.classList.contains("is-on");
    soundBtn.classList.toggle("is-on", on);
    soundBtn.setAttribute("aria-pressed", on);
    soundBtn.setAttribute("aria-label", on ? "Turn sound off" : "Turn sound on");
    if (!reel) { userPaused = false; mountReel(); }
    reel.setMuted(!on).then(() => on && reel.setVolume(1)).catch(() => {});
    if (on) reel.play().catch(() => {});
  });

  // Stop the reel while it is off screen, and pick it up again on return.
  new IntersectionObserver(([entry]) => {
    if (!reel || userPaused || viewer.open) return;
    entry.isIntersecting ? reel.play().catch(() => {}) : reel.pause().catch(() => {});
  }, { threshold: 0.15 }).observe(document.querySelector(".hero"));

  /* ---------- Work grid ---------- */

  const grid = document.getElementById("grid");
  const items = PROJECTS.map((p) => ({ ...p, id: vimeoId(p.vimeo), ar: 16 / 9 }));

  document.getElementById("workCount").textContent =
    `${items.length} ${items.length === 1 ? "project" : "projects"}`;

  document.getElementById("brands").textContent =
    [...new Set(items.map((p) => p.client).filter(Boolean))].join(", ");

  items.forEach((p, index) => {
    const li = document.createElement("li");
    li.className = "tile";
    li.innerHTML = `
      <button class="tile-link" type="button">
        <span class="tile-media">
          <img alt="" loading="lazy" decoding="async">
          <span class="preview"></span>
        </span>
        <span class="tile-caption">
          <span class="tile-client"></span>
          <span class="tile-title"></span>
        </span>
      </button>`;
    const btn = li.querySelector("button");
    const img = li.querySelector("img");
    const preview = li.querySelector(".preview");
    p.label = () => [p.client, p.title].filter(Boolean).join(", ");

    const paint = () => {
      li.querySelector(".tile-client").textContent = p.client || p.title || "";
      li.querySelector(".tile-title").textContent = p.client ? p.title || "" : "";
      btn.setAttribute("aria-label", `Play ${p.label()}`);
    };
    paint();
    if (p.thumb) img.src = p.thumb;

    meta(p.id).then((m) => {
      if (!m) return;
      if (!p.thumb) img.src = m.thumbnail_url;
      if (!p.title) { p.title = m.title; paint(); }
      if (m.width && m.height) p.ar = m.width / m.height;
    });

    btn.addEventListener("click", () => openViewer(index));

    // Hovering a tile plays the piece silently in place.
    if (canHover && !reduceMotion) {
      let timer, frame;
      btn.addEventListener("pointerenter", () => {
        timer = setTimeout(() => {
          const box = preview.getBoundingClientRect();
          const boxAr = box.width / box.height;
          const w = p.ar > boxAr ? box.height * p.ar : box.width;
          const h = p.ar > boxAr ? box.height : box.width / p.ar;
          frame = makeIframe(embedUrl(p.id, { background: 1, autoplay: 1, muted: 1, loop: 1 }), {
            title: `${p.label()} preview`,
            tabIndex: -1,
          });
          frame.style.width = `${Math.ceil(w) + 2}px`;
          frame.style.height = `${Math.ceil(h) + 2}px`;
          preview.append(frame);
          const player = new Vimeo.Player(frame);
          player.on("play", () => preview.classList.add("is-playing"));
        }, 180);
      });
      btn.addEventListener("pointerleave", () => {
        clearTimeout(timer);
        preview.classList.remove("is-playing");
        const old = frame;
        frame = null;
        if (old) setTimeout(() => old.remove(), 350);
      });
    }

    grid.append(li);
  });

  /* ---------- Viewer ---------- */

  const viewer = document.getElementById("viewer");
  const stage = document.getElementById("viewerStage");
  const viewerTitle = document.getElementById("viewerTitle");
  let current = 0;
  let reelWasPlaying = false;

  const show = (index) => {
    current = (index + items.length) % items.length;
    const p = items[current];
    viewerTitle.textContent = p.client || p.title || "";
    if (p.client && p.title) {
      const sub = document.createElement("span");
      sub.textContent = p.title;
      viewerTitle.append(sub);
    }
    stage.style.setProperty("--ar", p.ar);
    stage.replaceChildren(makeIframe(embedUrl(p.id, { autoplay: 1 }), { title: p.label() }));
  };

  function openViewer(index) {
    show(index);
    viewer.showModal();
    if (reel) reel.getPaused().then((paused) => {
      reelWasPlaying = !paused;
      reel.pause().catch(() => {});
    });
  }

  viewer.addEventListener("close", () => {
    stage.replaceChildren();
    if (reel && reelWasPlaying && !userPaused) reel.play().catch(() => {});
  });

  document.getElementById("close").addEventListener("click", () => viewer.close());
  document.getElementById("prev").addEventListener("click", () => show(current - 1));
  document.getElementById("next").addEventListener("click", () => show(current + 1));

  viewer.addEventListener("click", (e) => {
    if (e.target === viewer || e.target === stage) viewer.close();
  });

  viewer.addEventListener("keydown", (e) => {
    if (e.key === "ArrowLeft") show(current - 1);
    if (e.key === "ArrowRight") show(current + 1);
  });

  document.getElementById("year").textContent = new Date().getFullYear();
})();
