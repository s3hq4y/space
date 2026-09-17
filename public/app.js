const app = document.getElementById('app');
const viewerEl = document.getElementById('viewer');

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function fmtDate(s) {
  if (!s) return '';
  const d = new Date(s);
  if (isNaN(d)) return esc(s);
  return d.toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' });
}

function toast(msg) {
  let el = document.querySelector('.toast');
  if (!el) {
    el = document.createElement('div');
    el.className = 'toast';
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 2200);
}

async function api(path, opts) {
  const res = await fetch(path, { credentials: 'same-origin', ...opts });
  const data = await res.json().catch(() => ({}));
  return { res, data };
}

function visLabel(v) {
  return { friends: '好友', private: '私密', unlisted: '隐藏', password: '口令' }[v] || v;
}

async function loadMe() {
  try {
    const { data } = await api('/api/me');
    if (data.github) {
      const role = data.isOwner ? '站主' : '访客';
      viewerEl.innerHTML = `<span class="who">${esc(data.label)}</span><span style="color:var(--fg-faint)">· ${role}</span> <a href="/api/logout">退出</a>`;
    } else {
      viewerEl.innerHTML = `<a class="btn" href="/api/auth/start">GitHub 登录</a>`;
    }
  } catch {
    viewerEl.innerHTML = '';
  }
}

function revealAll() {
  requestAnimationFrame(() => {
    document.querySelectorAll('.reveal').forEach((el, i) => {
      setTimeout(() => el.classList.add('in'), i * 45);
    });
  });
}

async function renderList(params) {
  const qs = new URLSearchParams();
  if (params.q) qs.set('q', params.q);
  if (params.tag) qs.set('tag', params.tag);
  if (params.category) qs.set('category', params.category);
  const { data } = await api('/api/posts?' + qs.toString());

  const tags = new Set();
  const cats = new Set();
  data.posts.forEach((p) => {
    p.tags.forEach((t) => tags.add(t));
    if (p.category) cats.add(p.category);
  });

  const who = data.viewer.kind === 'owner' ? '站主' : data.viewer.kind === 'friend' ? '好友' : '访客';

  app.innerHTML = `
    <div class="page-head">
      <p class="eyebrow"><span class="pulse"></span>${data.total} 篇可见 · ${who}视角</p>
      <h1>我的<span class="accent">空间</span></h1>
      <p>有些话给所有人看，有些只给你看。</p>
    </div>
    <div class="controls">
      <input id="q" placeholder="搜索标题 / 摘要 / 标签…" value="${esc(params.q || '')}" />
      <select id="cat"><option value="">全部分类</option>${[...cats].map((c) => `<option ${params.category === c ? 'selected' : ''} value="${esc(c)}">${esc(c)}</option>`).join('')}</select>
      <select id="tag"><option value="">全部标签</option>${[...tags].map((t) => `<option ${params.tag === t ? 'selected' : ''} value="${esc(t)}">${esc(t)}</option>`).join('')}</select>
    </div>
    <div id="list"></div>
  `;

  const listEl = document.getElementById('list');
  if (!data.posts.length) {
    listEl.innerHTML = '<div class="empty"><div class="big">这里还没有可见的文章</div><div>换个身份登录，或者清空筛选试试</div></div>';
  } else {
    listEl.innerHTML = data.posts.map((p) => `
      <a class="post-card reveal" href="/p/${encodeURIComponent(p.slug)}/" data-link>
        <h2>${esc(p.title)}</h2>
        <div class="meta">
          <span>${fmtDate(p.date)}</span>
          ${p.category ? `<span class="dot">/</span><span>${esc(p.category)}</span>` : ''}
          ${p.visibility !== 'public' ? `<span class="badge">${visLabel(p.visibility)}</span>` : ''}
          ${p.locked ? '<span class="badge hot">需口令</span>' : ''}
        </div>
        ${p.summary ? `<p class="summary">${esc(p.summary)}</p>` : ''}
        ${p.tags.length ? `<div class="tags">${p.tags.map((t) => `<span class="tag">${esc(t)}</span>`).join('')}</div>` : ''}
      </a>
    `).join('');
  }
  revealAll();

  const go = () => navigate('/?' + new URLSearchParams({
    q: document.getElementById('q').value,
    category: document.getElementById('cat').value,
    tag: document.getElementById('tag').value,
  }).toString());
  document.getElementById('q').addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
  document.getElementById('cat').addEventListener('change', go);
  document.getElementById('tag').addEventListener('change', go);
}

async function renderPost(slug) {
  const { res, data } = await api('/api/posts/' + encodeURIComponent(slug));
  if (res.status === 401 && data.locked) {
    app.innerHTML = `
      <div class="lock reveal">
        <div class="lock-icon">🔒</div>
        <h2>${esc(data.meta.title)}</h2>
        <p>这篇文章需要口令才能查看</p>
        <input id="pw" type="password" placeholder="输入口令" autocomplete="off" />
        <button class="btn primary" id="unlock" style="width:100%">解锁</button>
      </div>`;
    revealAll();
    const submit = async () => {
      const password = document.getElementById('pw').value;
      const { res: r } = await api('/api/posts/' + encodeURIComponent(slug) + '/unlock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      if (r.ok) renderPost(slug);
      else toast('口令错误');
    };
    document.getElementById('unlock').addEventListener('click', submit);
    document.getElementById('pw').addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
    document.getElementById('pw').focus();
    return;
  }
  if (res.status === 403) {
    app.innerHTML = '<div class="empty"><div class="big">🔒 无权查看</div><div>这篇文章的浏览范围不包含你</div><p style="margin-top:1.5rem"><a class="btn" href="/" data-link>返回列表</a></p></div>';
    return;
  }
  if (!res.ok) {
    app.innerHTML = '<div class="empty"><div class="big">文章不存在</div><p style="margin-top:1.5rem"><a class="btn" href="/" data-link>返回列表</a></p></div>';
    return;
  }

  app.innerHTML = `
    <article class="article">
      <div class="article-head reveal">
        <h1>${esc(data.title)}</h1>
        <div class="meta">
          <span>${fmtDate(data.date)}</span>
          ${data.updated ? `<span class="dot">/</span><span>更新于 ${fmtDate(data.updated)}</span>` : ''}
          ${data.category ? `<span class="dot">/</span><span>${esc(data.category)}</span>` : ''}
          ${data.visibility !== 'public' ? `<span class="badge">${visLabel(data.visibility)}</span>` : ''}
        </div>
        ${data.tags.length ? `<div class="tags">${data.tags.map((t) => `<span class="tag">${esc(t)}</span>`).join('')}</div>` : ''}
      </div>
      <div class="body markdown-body reveal">${data.html}</div>
      <a class="back" href="/" data-link>← 返回列表</a>
    </article>`;
  revealAll();
  window.scrollTo(0, 0);
}

function navigate(to, push = true) {
  if (push) history.pushState({}, '', to);
  route();
}

function route() {
  const { pathname, search } = location;
  if (pathname === '/' || pathname === '') {
    const p = new URLSearchParams(search);
    renderList({ q: p.get('q') || '', tag: p.get('tag') || '', category: p.get('category') || '' });
    return;
  }
  const m = pathname.match(/^\/p\/([^/]+)\/?$/);
  if (m) {
    renderPost(decodeURIComponent(m[1]));
    return;
  }
  app.innerHTML = '<div class="empty"><div class="big">页面不存在</div><p style="margin-top:1.5rem"><a class="btn" href="/" data-link>回到首页</a></p></div>';
}

document.addEventListener('click', (e) => {
  const a = e.target.closest('a[data-link]');
  if (!a) return;
  e.preventDefault();
  navigate(a.getAttribute('href'));
});

window.addEventListener('popstate', route);

loadMe();
route();