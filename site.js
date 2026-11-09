// RealmSuite landing page. Three jobs, all optional: fill the media slots whose files exist, render the GitHub
// release notes, and point Download at the latest installer. Without script, or when the API does not answer, the
// page is complete as written and Download opens the release's page.
"use strict";

const repo = document.querySelector('meta[name="realm-repo"]').content;
const repoSet = !repo.includes("OWNER");

// --- media slots: data-media lists files to try, in order; the first that loads replaces the placeholder. ---

function tryMedia(slot) {
  const files = slot.dataset.media.split(/\s+/).filter(Boolean);
  const host = slot.querySelector(".plate__in") ?? slot;

  const next = () => {
    const file = files.shift();
    if (!file) return;

    const video = /\.(mp4|webm)$/i.test(file);
    const el = document.createElement(video ? "video" : "img");
    const done = () => {
      slot.classList.add("is-filled");
      if (video) { host.prepend(el); return; }
      // A picture opens at its full size.
      const link = Object.assign(document.createElement("a"), { href: file, target: "_blank", rel: "noopener", title: "Open the picture at full size" });
      link.append(el);
      host.prepend(link);
    };
    const fail = () => { el.remove(); next(); };

    if (video) {
      Object.assign(el, { muted: true, loop: true, autoplay: true, playsInline: true, preload: "metadata" });
      el.setAttribute("aria-label", slot.dataset.alt ?? "RealmSuite in the game");
      el.addEventListener("loadeddata", done, { once: true });
      el.addEventListener("error", fail, { once: true });
      el.src = file;
    } else {
      el.alt = slot.dataset.alt ?? "";
      el.decoding = "async";
      el.addEventListener("load", done, { once: true });
      el.addEventListener("error", fail, { once: true });
      el.src = file;
    }
  };
  next();
}

// ?slots in the address shows the empty slots, so the owner can see where each file goes.
if (new URLSearchParams(location.search).has("slots")) document.documentElement.classList.add("show-slots");

for (const slot of document.querySelectorAll("[data-media]")) tryMedia(slot);

// A link to a question opens it.
function openTarget() {
  const target = location.hash && document.querySelector(location.hash);
  if (target instanceof HTMLDetailsElement) target.open = true;
}
addEventListener("hashchange", openTarget);
openTarget();

// --- the sidebar: the link of the section in view is the selected row. ---

const links = [...document.querySelectorAll(".side__nav a")];
const targets = links.map(a => document.querySelector(a.getAttribute("href"))).filter(Boolean);

function select() {
  // The target nearest above a line a third of the way down the window; at the page's end, the last one.
  const line = window.innerHeight / 3;
  const atEnd = window.innerHeight + window.scrollY >= document.body.scrollHeight - 2;
  let current = targets[0], best = -Infinity;
  for (const t of targets) {
    const top = t.getBoundingClientRect().top;
    if (atEnd ? top > best : top <= line && top > best) { best = top; current = t; }
  }
  for (const a of links) {
    if (document.querySelector(a.getAttribute("href")) === current) a.setAttribute("aria-current", "true");
    else a.removeAttribute("aria-current");
  }
}

addEventListener("scroll", select, { passive: true });
addEventListener("resize", select);
select();

// --- release notes: textContent only, so a note can never inject markup. ---

const text = (tag, value) => Object.assign(document.createElement(tag), { textContent: value });

// The few markdown shapes release notes use: headings, bullet lists and paragraphs; emphasis marks and link
// targets are dropped to their words.
function plain(line) {
  return line
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/[*_`]{1,3}/g, "")
    .trim();
}

function notes(body) {
  const nodes = [];
  let list = null;
  for (const raw of body.replace(/\r/g, "").split("\n")) {
    const line = raw.trim();
    const bullet = /^[-*+]\s+(.*)$/.exec(line);
    if (bullet) {
      if (!list) { list = document.createElement("ul"); nodes.push(list); }
      list.append(text("li", plain(bullet[1])));
      continue;
    }
    list = null;
    const heading = /^#{1,6}\s+(.*)$/.exec(line);
    if (heading) nodes.push(text("h4", plain(heading[1])));
    else if (line) nodes.push(text("p", plain(line)));
  }
  return nodes;
}

function entry(release) {
  const article = document.createElement("article");
  article.className = "log__entry";

  const h3 = document.createElement("h3");
  const link = text("a", release.name || release.tag_name);
  link.href = release.html_url;
  h3.append(link);
  article.append(h3);

  if (release.published_at) {
    const date = text("p", new Date(release.published_at).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" }));
    date.className = "log__date";
    article.append(date);
  }
  article.append(...notes(release.body ?? ""));
  return article;
}

async function releases() {
  if (!repoSet) return;

  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), 6000);
  try {
    const response = await fetch(`https://api.github.com/repos/${repo}/releases?per_page=6`, {
      headers: { Accept: "application/vnd.github+json" },
      signal: abort.signal,
    });
    if (!response.ok) return;

    const shown = (await response.json()).filter(r => !r.draft);
    if (shown.length === 0) return;

    document.querySelector("[data-changelog]").replaceChildren(...shown.map(entry));

    const latest = shown.find(r => !r.prerelease) ?? shown[0];
    document.querySelector("[data-version]").textContent = `${latest.tag_name} for Windows`;

    // Download starts the download: the latest release's installer (and its zip) instead of the release's page.
    const asset = suffix => (latest.assets ?? []).map(a => a.browser_download_url)
      .find(url => typeof url === "string" && url.startsWith(`https://github.com/${repo}/releases/download/`) && url.endsWith(suffix));
    const point = (selector, url) => { if (url) for (const a of document.querySelectorAll(selector)) a.href = url; };
    point("[data-download]", asset("-Setup.exe"));
    point("[data-download-zip]", asset(".zip"));
  } catch {
    // The fallback stays.
  } finally {
    clearTimeout(timer);
  }
}

releases();
