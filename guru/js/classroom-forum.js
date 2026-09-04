(function () {
  'use strict';
  const client = window.supabaseClient;

  let teacherId   = null;
  let classroomId = null;
  let _posts      = [];
  let _loaded     = false;
  let _formInited = false;

  function esc(s) {
    return String(s ?? '')
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function fmtDate(s) {
    if (!s) return '';
    const d = new Date(s);
    return d.toLocaleDateString('id-ID', { day:'2-digit', month:'short', year:'numeric',
      hour:'2-digit', minute:'2-digit' });
  }

  // ── API ────────────────────────────────────────────────────────────────────

  async function loadPosts() {
    const el = document.getElementById('forum-list');
    if (el) el.innerHTML = '<p class="empty-state">Memuat posting…</p>';

    const { data, error } = await client
      .from('forum_posts')
      .select('id, title, content, author_id, author_role, is_visible_to_ortu, is_visible_to_student, created_at, updated_at')
      .eq('classroom_id', classroomId)
      .order('created_at', { ascending: false });

    if (error) {
      if (el) el.innerHTML = '<p class="empty-state">Gagal memuat forum: ' + esc(error.message) + '</p>';
      return;
    }
    _posts = data || [];
    _loaded = true;
    renderPosts();
  }

  async function loadComments(postId) {
    const { data, error } = await client
      .from('forum_comments')
      .select('id, author_id, content, created_at, profiles!author_id(full_name, role)')
      .eq('post_id', postId)
      .order('created_at', { ascending: true });

    if (error) return [];
    return data || [];
  }

  async function submitPost(title, content, visibleToOrtu) {
    const { data, error } = await client
      .from('forum_posts')
      .insert({
        classroom_id:        classroomId,
        teacher_id:          teacherId,
        author_id:           teacherId,
        author_role:         'GURU',
        title:               title || null,
        content,
        is_visible_to_ortu:    visibleToOrtu,
        is_visible_to_student: visibleToOrtu,
      })
      .select('id, title, content, author_id, author_role, is_visible_to_ortu, is_visible_to_student, created_at, updated_at')
      .single();

    if (error) throw error;
    return data;
  }

  async function deletePost(postId) {
    const { error } = await client
      .from('forum_posts')
      .delete()
      .eq('id', postId);
    if (error) throw error;
  }

  async function submitComment(postId, content) {
    const { data, error } = await client
      .from('forum_comments')
      .insert({
        post_id:      postId,
        classroom_id: classroomId,
        teacher_id:   teacherId,
        author_id:    teacherId,
        content,
      })
      .select('id, author_id, content, created_at, profiles!author_id(full_name, role)')
      .single();
    if (error) throw error;
    return data;
  }

  async function deleteComment(commentId) {
    const { error } = await client
      .from('forum_comments')
      .delete()
      .eq('id', commentId);
    if (error) throw error;
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  function renderCommentHtml(c) {
    const nama  = c.profiles?.full_name || '—';
    const role  = c.profiles?.role || '';
    const label = role === 'GURU' ? 'Guru' : role === 'ORTU' ? 'Ortu' : role;
    const isMine = c.author_id === teacherId;
    return `<div class="forum-comment" data-cid="${esc(c.id)}">
      <div class="forum-comment-meta">
        <span class="forum-author">${esc(nama)}</span>
        <span class="forum-role-badge">${esc(label)}</span>
        <span class="forum-date">${esc(fmtDate(c.created_at))}</span>
        ${isMine ? `<button class="btn-forum-del-comment" data-cid="${esc(c.id)}" title="Hapus komentar">✕</button>` : ''}
      </div>
      <div class="forum-comment-body">${esc(c.content)}</div>
    </div>`;
  }

  function renderPosts() {
    const el = document.getElementById('forum-list');
    if (!el) return;

    if (!_posts.length) {
      el.innerHTML = '<p class="empty-state">Belum ada posting di forum ini.</p>';
      return;
    }

    el.innerHTML = _posts.map(p => {
      const vis = p.is_visible_to_ortu
        ? '<span class="forum-vis-badge vis-publik">Pengumuman</span>'
        : '<span class="forum-vis-badge vis-privat">Hanya Guru</span>';
      return `<div class="forum-post" data-pid="${esc(p.id)}">
        <div class="forum-post-header">
          ${p.title ? `<div class="forum-post-title">${esc(p.title)}</div>` : ''}
          <div class="forum-post-meta">
            <span class="forum-date">${esc(fmtDate(p.created_at))}</span>
            ${vis}
            <button class="btn-forum-del-post" data-pid="${esc(p.id)}" title="Hapus posting">Hapus</button>
          </div>
        </div>
        <div class="forum-post-body">${esc(p.content)}</div>
        <div class="forum-comments-wrap" id="comments-${esc(p.id)}">
          <div class="forum-comments-list" id="clist-${esc(p.id)}">
            <p class="forum-loading-comment">Memuat komentar…</p>
          </div>
          <form class="forum-comment-form" data-pid="${esc(p.id)}">
            <input type="text" class="forum-comment-input" placeholder="Tulis komentar…" maxlength="500" required>
            <button type="submit">Kirim</button>
          </form>
        </div>
      </div>`;
    }).join('');

    // muat komentar tiap post paralel
    _posts.forEach(p => loadAndRenderComments(p.id));
    attachPostEvents();
  }

  async function loadAndRenderComments(postId) {
    const el = document.getElementById('clist-' + postId);
    if (!el) return;
    const comments = await loadComments(postId);
    if (!comments.length) {
      el.innerHTML = '<p class="forum-no-comment">Belum ada komentar.</p>';
    } else {
      el.innerHTML = comments.map(renderCommentHtml).join('');
    }
    attachCommentDeleteEvents(postId);
  }

  function attachPostEvents() {
    document.querySelectorAll('#forum-list .btn-forum-del-post').forEach(btn => {
      btn.addEventListener('click', async () => {
        const pid = btn.dataset.pid;
        if (!confirm('Hapus posting ini beserta semua komentarnya?')) return;
        btn.disabled = true;
        try {
          await deletePost(pid);
          _posts = _posts.filter(p => p.id !== pid);
          renderPosts();
        } catch (e) {
          alert('Gagal menghapus posting: ' + e.message);
          btn.disabled = false;
        }
      });
    });

    document.querySelectorAll('#forum-list .forum-comment-form').forEach(form => {
      form.addEventListener('submit', async e => {
        e.preventDefault();
        const pid   = form.dataset.pid;
        const input = form.querySelector('.forum-comment-input');
        const text  = input.value.trim();
        if (!text) return;
        const submitBtn = form.querySelector('button');
        submitBtn.disabled = true;
        try {
          const c = await submitComment(pid, text);
          input.value = '';
          const el = document.getElementById('clist-' + pid);
          const noComment = el?.querySelector('.forum-no-comment');
          if (noComment) noComment.remove();
          el?.insertAdjacentHTML('beforeend', renderCommentHtml(c));
          attachCommentDeleteEvents(pid);
        } catch (err) {
          alert('Gagal kirim komentar: ' + err.message);
        } finally {
          submitBtn.disabled = false;
        }
      });
    });
  }

  function attachCommentDeleteEvents(postId) {
    const el = document.getElementById('clist-' + postId);
    if (!el) return;
    el.querySelectorAll('.btn-forum-del-comment').forEach(btn => {
      // cegah duplikat listener
      const fresh = btn.cloneNode(true);
      btn.parentNode.replaceChild(fresh, btn);
      fresh.addEventListener('click', async () => {
        const cid = fresh.dataset.cid;
        if (!confirm('Hapus komentar ini?')) return;
        fresh.disabled = true;
        try {
          await deleteComment(cid);
          fresh.closest('.forum-comment')?.remove();
          if (!el.querySelector('.forum-comment')) {
            el.innerHTML = '<p class="forum-no-comment">Belum ada komentar.</p>';
          }
        } catch (err) {
          alert('Gagal menghapus komentar: ' + err.message);
          fresh.disabled = false;
        }
      });
    });
  }

  // ── Form ───────────────────────────────────────────────────────────────────

  function initForm() {
    if (_formInited) return;
    _formInited = true;

    const form    = document.getElementById('forum-form');
    const status  = document.getElementById('forum-status');
    const visOrtu = document.getElementById('forum-vis-ortu');
    if (!form) return;

    form.addEventListener('submit', async e => {
      e.preventDefault();
      const title   = document.getElementById('forum-title').value.trim();
      const content = document.getElementById('forum-content').value.trim();
      if (!content) return;
      const btn = form.querySelector('button[type=submit]');
      btn.disabled = true;
      status.style.display = '';
      status.textContent   = 'Menyimpan…';

      try {
        const post = await submitPost(title, content, visOrtu.checked);
        _posts.unshift(post);
        form.reset();
        renderPosts();
        status.textContent = 'Posting berhasil disimpan.';
        setTimeout(() => { status.style.display = 'none'; }, 2500);
      } catch (err) {
        status.textContent = 'Gagal: ' + err.message;
      } finally {
        btn.disabled = false;
      }
    });
  }

  // ── Collapse sections ──────────────────────────────────────────────────────

  function initCollapseSections() {
    const headers = Array.from(document.querySelectorAll('#panel-forum h2.panel-header'));

    function openSection(h2) {
      // tutup semua dulu (single expand)
      headers.forEach(hdr => {
        if (hdr === h2) return;
        hdr.classList.remove('open');
        const b = document.getElementById(hdr.dataset.panel);
        if (b) b.style.display = 'none';
      });
      h2.classList.add('open');
      const body = document.getElementById(h2.dataset.panel);
      if (body) body.style.display = '';
    }

    function closeSection(h2) {
      h2.classList.remove('open');
      const body = document.getElementById(h2.dataset.panel);
      if (body) body.style.display = 'none';
    }

    headers.forEach(h2 => {
      const body = document.getElementById(h2.dataset.panel);
      if (!body) return;
      // default tertutup
      h2.classList.remove('open');
      body.style.display = 'none';

      h2.addEventListener('click', () => {
        if (h2.classList.contains('open')) {
          closeSection(h2);
        } else {
          openSection(h2);
        }
      });
    });
  }

  // ── Init tab Forum ─────────────────────────────────────────────────────────

  async function bukaTabForum() {
    if (!_loaded) {
      try {
        await loadPosts();
      } catch (err) {
        console.error('[forum] gagal load:', err);
        const el = document.getElementById('forum-list');
        if (el) el.innerHTML = '<p class="empty-state">Gagal memuat forum.<br>' +
          '<button type="button" id="btn-forum-ulang">Coba lagi</button></p>';
        document.getElementById('btn-forum-ulang')
          ?.addEventListener('click', () => bukaTabForum());
      }
    }
  }

  // ── DOMContentLoaded ───────────────────────────────────────────────────────

  window.addEventListener('DOMContentLoaded', async function () {
    const tabForum   = document.getElementById('tab-forum');
    const panelForum = document.getElementById('panel-forum');
    if (!tabForum || !panelForum) return;

    initCollapseSections();
    initForm();

    const allTabBtns   = document.querySelectorAll('.tab-btn');
    const allPanels    = ['panel-siswa','panel-jadwal','panel-catatan','panel-forum',
                          'panel-penilaian','panel-rancang','panel-unduh']
                          .map(id => document.getElementById(id));

    tabForum.addEventListener('click', async () => {
      window.currentTab = 'forum';
      allTabBtns.forEach(t => t.classList.remove('active'));
      tabForum.classList.add('active');
      allPanels.forEach(p => { if (p) p.style.display = 'none'; });
      panelForum.style.display = '';
      const cId = new URLSearchParams(window.location.search).get('id');
      if (cId) try { localStorage.setItem('sip_tab_' + cId, 'forum'); } catch (_) {}
      await bukaTabForum();
    });

    // Sembunyikan panel-forum saat tab lain diklik
    allTabBtns.forEach(t => {
      if (t === tabForum) return;
      t.addEventListener('click', () => {
        tabForum.classList.remove('active');
        panelForum.style.display = 'none';
      });
    });

    // Auth
    const { data: { session } } = await client.auth.getSession();
    if (!session) return;

    const cId = new URLSearchParams(window.location.search).get('id');
    if (!cId) return;
    classroomId = cId;

    const { data: prof } = await client
      .from('profiles').select('id').eq('user_id', session.user.id).single();
    if (!prof) return;
    teacherId = prof.id;

    // Restore tab forum
    const savedTab = cId ? localStorage.getItem('sip_tab_' + cId) : null;
    if (savedTab === 'forum' && tabForum) tabForum.click();
  });
}());
