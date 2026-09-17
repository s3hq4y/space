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

async function loadMe() {
  try {
    const { data } = await api('/api/me');
    if (data.github) {
      viewerEl.innerHTML = `<span class="meta">${esc(data.label)}${data.isOwner ? ' · 站主' : ''}</span> <a href="/api/logout">退出</a>`;
    } else {
      viewerEl.innerHTML = `<a class="btn" href="/api/auth/start">GitHub 登录</a>`;
    }
  } catch {
    viewerEl.innerHTML = '';
  }
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

  app.innerHTML = `
    <div class="controls">
      <input id="q" placeholder="搜索标题 / 摘要 / 标签" value="${esc(params.q || '')}" />
      <select id="cat"><option value="">全部分类</option>${[...cats].map((c) => `<option ${params.category === c ? 'selected' : ''} value="${esc(c)}">${esc(c)}</option>`).join('')}</select>
      <select id="tag"><option value="">全部标签</option>${[...tags].map((t) => `<option ${params.tag === t ? 'selected' : ''} value="${esc(t)}">${esc(t)}</option>`).join('')}</select>
    </div>
    <div id="list"></div>
  `;

  const listEl = document.getElementById('list');
  if (!data.posts.length) {
    listEl.innerHTML = '<div class="empty">这里还没有可见的文章</div>';
  } else {
    listEl.innerHTML = data.posts.map((p) => `
      <a class="post-card" href="/p/${encodeURIComponent(p.slug)}/" data-link style="display:block;color:inherit">
        <h2>${esc(p.title)}</h2>
        <div class="meta">
          <span>${fmtDate(p.date)}</span>
          ${p.category ? `<span>· ${esc(p.category)}</span>` : ''}
          ${p.visibility !== 'public' ? `<span class="badge">${visLabel(p.visibility)}</span>` : ''}
          ${p.locked ? '<span class="badge">需口令</span>' : ''}
        </div>
        ${p.summary ? `<p class="summary">${esc(p.summary)}</p>` : ''}
        ${p.tags.length ? `<div class="tags">${p.tags.map((t) => `<span class="tag">${esc(t)}</span>`).join('')}</div>` : ''}
      </a>
    `).join('');
  }

  const go = () => navigate('/?' + new URLSearchParams({
    q: document.getElementById('q').value,
    category: document.getElementById('cat').value,
    tag: document.getElementById('tag').value,
  }).toString());
  document.getElementById('q').addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
  document.getElementById('cat').addEventListener('change', go);
  document.getElementById('tag').addEventListener('change', go);
}

function visLabel(v) {
  return { friends: '好友', private: '私密', unlisted: '隐藏', password: '口令' }[v] || v;
}

async function renderPost(slug) {
  const { res, data } = await api('/api/posts/' + encodeURIComponent(slug));
  if (res.status === 401 && data.locked) {
    app.innerHTML = `
      <div class="lock">
        <h2>${esc(data.meta.title)}</h2>
        <p class="meta">这篇文章需要口令才能查看</p>
        <input id="pw" type="password" placeholder="输入口令" />
        <div><button class="btn" id="unlock">解锁</button></div>
      </div>`;
    const submit = async () => {
      const password = document.getElementById('pw').value;
      const { res: r, data: d } = await api('/api/posts/' + encodeURIComponent(slug) + '/unlock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      if (r.ok) renderPost(slug);
      else toast('口令错误');
    };
    document.getElementById('unlock').addEventListener('click', submit);
    document.getElementById('pw').addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
    return;
  }
  if (res.status === 403) {
    app.innerHTML = '<div class="empty">你没有权限查看这篇文章</div>';
    return;
  }
  if (!res.ok) {
    app.innerHTML = '<div class="empty">文章不存在</div>';
    return;
  }

  app.innerHTML = `
    <article class="article markdown-body">
      <h1>${esc(data.title)}</h1>
      <div class="meta">
        <span>${fmtDate(data.date)}</span>
        ${data.updated ? `<span>更新于 ${fmtDate(data.updated)}</span>` : ''}
        ${data.category ? `<span>· ${esc(data.category)}</span>` : ''}
      </div>
      ${data.tags.length ? `<div class="tags">${data.tags.map((t) => `<span class="tag">${esc(t)}</span>`).join('')}</div>` : ''}
      <div class="body markdown-body">${data.html}</div>
    </article>
    <p style="margin-top:32px"><a href="/" data-link>← 返回列表</a></p>`;
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
  app.innerHTML = '<div class="empty">页面不存在</div>';
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