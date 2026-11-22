/* =====================================================================
   LibraTrack - Library Book Management System (DBMS Lab project)

   The database is a real SQLite engine (sql.js, compiled to WebAssembly)
   running inside the browser tab, so the site can be hosted as plain
   static files on Vercel. All data access is done with SQL statements:
   CREATE / INSERT / SELECT / UPDATE / DELETE, WHERE, JOIN, GROUP BY and
   the aggregate functions COUNT, SUM, AVG, MAX, MIN.

   The database file is saved to localStorage after every change, so the
   records survive a page refresh on the same browser.
   ===================================================================== */
(function () {
  'use strict';

  /* ---------- configuration ---------- */
  var CURRENCY = 'Tk ';                        // Bangladeshi taka
  var STORAGE_KEY = 'libratrack.sqlite.v1';
  var LOG_LIMIT = 40;
  var SQLJS_SOURCES = [
    { js: 'https://cdn.jsdelivr.net/npm/sql.js@1.10.3/dist/sql-wasm.js',
      base: 'https://cdn.jsdelivr.net/npm/sql.js@1.10.3/dist/' },
    { js: 'https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.8.0/sql-wasm.js',
      base: 'https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.8.0/' }
  ];
  var SPINE_COLORS = ['#3f4ba8', '#8e3b6e', '#2f7d5b', '#c98a12', '#456a7c', '#c2543a', '#6b4fa3'];

  /* ---------- tiny helpers ---------- */
  var $ = function (id) { return document.getElementById(id); };
  var sql = function () { return Array.prototype.slice.call(arguments).join('\n'); };
  var SQL = null;      // sql.js module
  var db = null;       // open database
  var editingId = null;
  var state = { total: 0, logged: [] };

  function el(tag, props, children) {
    var node = document.createElement(tag);
    Object.keys(props || {}).forEach(function (k) {
      if (k === 'text') node.textContent = props[k];
      else if (k === 'class') node.className = props[k];
      else node.setAttribute(k, props[k]);
    });
    (children || []).forEach(function (c) { node.appendChild(c); });
    return node;
  }
  function money(n) {
    return CURRENCY + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function today() {
    var d = new Date(), p = function (n) { return String(n).padStart(2, '0'); };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  }
  function literal(v) {
    if (v === null || v === undefined) return 'NULL';
    if (typeof v === 'number') return String(v);
    return "'" + String(v).replace(/'/g, "''") + "'";
  }
  function inlineParams(text, params) {
    var i = 0;
    return text.replace(/\?/g, function () { return literal(params[i++]); });
  }

  /* ---------- SQL statements used by the application ---------- */
  var Q = {
    summary: sql(
      'SELECT COUNT(*)                                                    AS total_books,',
      "       COALESCE(SUM(CASE WHEN status = 'Available' THEN 1 ELSE 0 END), 0) AS available_books,",
      "       COALESCE(SUM(CASE WHEN status = 'Borrowed'  THEN 1 ELSE 0 END), 0) AS borrowed_books,",
      "       COALESCE(SUM(CASE WHEN status = 'Reserved'  THEN 1 ELSE 0 END), 0) AS reserved_books,",
      '       COALESCE(ROUND(AVG(price), 2), 0) AS avg_price,',
      '       COALESCE(MAX(price), 0)           AS max_price,',
      '       COALESCE(MIN(price), 0)           AS min_price,',
      '       COALESCE(SUM(price), 0)           AS total_value',
      'FROM books;'),
    perCategory: sql(
      'SELECT c.category_id, c.category_name, COUNT(b.book_id) AS total_books',
      'FROM categories AS c',
      'LEFT JOIN books AS b ON b.category_id = c.category_id',
      'GROUP BY c.category_id, c.category_name',
      'ORDER BY total_books DESC, c.category_name;'),
    categories: 'SELECT category_id, category_name FROM categories ORDER BY category_name;',
    listBase: sql(
      'SELECT b.book_id, b.isbn, b.title, b.author, b.category_id, c.category_name,',
      '       b.publish_year, b.price, b.status, b.added_on',
      'FROM books AS b',
      'JOIN categories AS c ON c.category_id = b.category_id'),
    one: 'SELECT * FROM books WHERE book_id = ?;',
    insert: sql(
      'INSERT INTO books (isbn, title, author, category_id, publish_year, price, status, added_on)',
      'VALUES (?, ?, ?, ?, ?, ?, ?, ?);'),
    update: sql(
      'UPDATE books',
      'SET isbn = ?, title = ?, author = ?, category_id = ?,',
      '    publish_year = ?, price = ?, status = ?, added_on = ?',
      'WHERE book_id = ?;'),
    del: 'DELETE FROM books WHERE book_id = ?;'
  };

  /* ---------- SQL log panel ---------- */
  function log(text, params) {
    var shown = inlineParams(text, params || []);
    var first = state.logged[0];
    if (first && first.sql === shown) return;                 // avoid repeating identical lines
    var kind = (shown.trim().split(/\s+/)[0] || 'SQL').toUpperCase();
    state.logged.unshift({ sql: shown, kind: kind, time: new Date().toLocaleTimeString() });
    if (state.logged.length > LOG_LIMIT) state.logged.pop();
    renderLog();
  }
  function renderLog() {
    var list = $('log');
    list.textContent = '';
    state.logged.forEach(function (e) {
      var li = el('li', { 'data-kind': e.kind });
      li.appendChild(el('div', { class: 'log__meta' }, [el('b', { text: e.kind }), el('span', { text: e.time })]));
      li.appendChild(el('code', { text: e.sql }));
      list.appendChild(li);
    });
  }

  /* ---------- database access layer ---------- */
  function rowsOf(result) {
    if (!result || !result.length) return [];
    var cols = result[0].columns;
    return result[0].values.map(function (v) {
      var o = {};
      cols.forEach(function (c, i) { o[c] = v[i]; });
      return o;
    });
  }
  function select(text, params, quiet) {
    params = params || [];
    if (!quiet) log(text, params);
    return rowsOf(db.exec(text, params));
  }
  function write(text, params) {
    params = params || [];
    log(text, params);
    db.run(text, params);
    var changed = db.getRowsModified();
    persist();
    return changed;
  }

  function persist() {
    try {
      var bytes = db.export();            // note: export() resets PRAGMAs, so re-enable below
      db.run('PRAGMA foreign_keys = ON;');
      var bin = '', CH = 0x8000;
      for (var i = 0; i < bytes.length; i += CH) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
      localStorage.setItem(STORAGE_KEY, btoa(bin));
    } catch (e) {
      console.warn('Could not save database to localStorage', e);
    }
  }
  function readSaved() {
    try {
      var b64 = localStorage.getItem(STORAGE_KEY);
      if (!b64) return null;
      var bin = atob(b64), out = new Uint8Array(bin.length);
      for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
      return out;
    } catch (e) { return null; }
  }

  function seedDatabase() {
    db = new SQL.Database();
    db.exec(window.LIBRARY_SEED_SQL);
    db.run('PRAGMA foreign_keys = ON;');
    state.logged = [];
    log('-- library_sqlite.sql executed: CREATE TABLE categories, CREATE TABLE books,\n-- INSERT 7 categories and 15 books');
    persist();
  }
  function openDatabase() {
    var saved = readSaved();
    if (saved) {
      try {
        db = new SQL.Database(saved);
        db.run('PRAGMA foreign_keys = ON;');
        db.exec('SELECT COUNT(*) FROM books;');
        db.exec('SELECT COUNT(*) FROM categories;');
        return 'restored';
      } catch (e) {
        console.warn('Saved database was unreadable, creating a fresh one', e);
        try { db.close(); } catch (_) { /* ignore */ }
      }
    }
    seedDatabase();
    return 'seeded';
  }

  /* ---------- loading the SQL engine ---------- */
  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = src;
      s.onload = resolve;
      s.onerror = function () { reject(new Error('Could not load ' + src)); };
      document.head.appendChild(s);
    });
  }
  function initEngine() {
    var chain = Promise.reject(new Error('no source'));
    SQLJS_SOURCES.forEach(function (src) {
      chain = chain.catch(function () {
        window.initSqlJs = undefined;
        return loadScript(src.js).then(function () {
          return window.initSqlJs({ locateFile: function (f) { return src.base + f; } });
        });
      });
    });
    return chain;
  }

  /* ---------- rendering ---------- */
  function renderSummary(quiet) {
    var s = select(Q.summary, [], quiet)[0];
    state.total = s.total_books;
    $('s-total').textContent = s.total_books;
    $('s-available').textContent = s.available_books;
    $('s-borrowed').textContent = s.borrowed_books;
    $('s-reserved').textContent = s.reserved_books;
    $('s-avg').textContent = money(s.avg_price);
    $('s-max').textContent = money(s.max_price);
    $('s-min').textContent = money(s.min_price);
    $('s-sum').textContent = money(s.total_value);
  }

  function renderShelf(quiet) {
    var cats = select(Q.perCategory, [], quiet);
    var max = Math.max.apply(null, cats.map(function (c) { return c.total_books; }).concat([1]));
    var active = $('fCategory').value;
    var shelf = $('shelf');
    shelf.textContent = '';
    cats.forEach(function (c, i) {
      var h = 150 + Math.round((c.total_books / max) * 70);
      var cls = 'spine' + (c.total_books === 0 ? ' is-empty' : '') + (String(c.category_id) === active ? ' is-active' : '');
      var b = el('button', {
        type: 'button', class: cls, role: 'listitem',
        'data-id': c.category_id,
        'aria-label': c.category_name + ': ' + c.total_books + (c.total_books === 1 ? ' book' : ' books') + '. Filter table by this category.'
      }, [el('span', { class: 'spine__n', text: c.total_books }), el('span', { class: 'spine__t', text: c.category_name })]);
      b.style.setProperty('--h', h + 'px');
      b.style.setProperty('--c', SPINE_COLORS[i % SPINE_COLORS.length]);
      shelf.appendChild(b);
    });
  }

  function fillCategorySelects(quiet) {
    var cats = select(Q.categories, [], quiet);
    var form = $('f-category'), filter = $('fCategory');
    var keepForm = form.value, keepFilter = filter.value;
    form.textContent = ''; filter.textContent = '';
    filter.appendChild(el('option', { value: '', text: 'All categories' }));
    cats.forEach(function (c) {
      form.appendChild(el('option', { value: c.category_id, text: c.category_name }));
      filter.appendChild(el('option', { value: c.category_id, text: c.category_name }));
    });
    if (keepForm) form.value = keepForm;
    if (keepFilter) filter.value = keepFilter;
  }

  function currentFilters() {
    return { q: $('q').value.trim(), status: $('fStatus').value, category: $('fCategory').value };
  }

  function renderBooks(quiet) {
    var f = currentFilters(), where = [], params = [];
    if (f.q) {
      var like = '%' + f.q + '%';
      var idGuess = /^\d+$/.test(f.q) ? parseInt(f.q, 10) : -1;
      where.push('(b.title LIKE ? OR b.author LIKE ? OR b.isbn LIKE ? OR b.book_id = ?)');
      params.push(like, like, like, idGuess);
    }
    if (f.status !== 'All') { where.push('b.status = ?'); params.push(f.status); }
    if (f.category) { where.push('b.category_id = ?'); params.push(parseInt(f.category, 10)); }
    var text = Q.listBase + (where.length ? '\nWHERE ' + where.join('\n  AND ') : '') + '\nORDER BY b.book_id;';
    var rows = select(text, params, quiet);

    var tbody = $('rows');
    tbody.textContent = '';
    rows.forEach(function (r) {
      var tr = el('tr', editingId === r.book_id ? { class: 'is-editing' } : {});
      tr.appendChild(el('td', { class: 'num', text: r.book_id }));
      var titleCell = el('td', {}, [el('span', { class: 'book__title', text: r.title }), el('span', { class: 'book__isbn', text: r.isbn })]);
      tr.appendChild(titleCell);
      tr.appendChild(el('td', { text: r.author }));
      tr.appendChild(el('td', { text: r.category_name }));
      tr.appendChild(el('td', { class: 'num', text: r.publish_year }));
      tr.appendChild(el('td', { class: 'nowrap', text: r.added_on }));
      tr.appendChild(el('td', { class: 'nowrap' }, [el('span', { class: 'pill pill--' + r.status, text: r.status })]));
      tr.appendChild(el('td', { class: 'num', text: money(r.price) }));
      var actions = el('td', { class: 'actions' }, [
        el('button', { type: 'button', class: 'row-btn row-btn--edit', 'data-act': 'edit', 'data-id': r.book_id, 'aria-label': 'Edit ' + r.title, text: 'Edit' }),
        el('button', { type: 'button', class: 'row-btn row-btn--del', 'data-act': 'delete', 'data-id': r.book_id, 'aria-label': 'Delete ' + r.title, text: 'Delete' })
      ]);
      tr.appendChild(actions);
      tbody.appendChild(tr);
    });
    $('empty').hidden = rows.length > 0;
    $('resultCount').textContent = 'Showing ' + rows.length + ' of ' + state.total + (state.total === 1 ? ' book' : ' books');
  }

  function refreshAll(quiet) {
    renderSummary(quiet);
    fillCategorySelects(quiet);
    renderShelf(quiet);
    renderBooks(quiet);
  }

  /* ---------- form: add / edit ---------- */
  function readForm() {
    return {
      title: $('f-title').value.trim(),
      author: $('f-author').value.trim(),
      isbn: $('f-isbn').value.trim(),
      category: parseInt($('f-category').value, 10),
      year: parseInt($('f-year').value, 10),
      price: parseFloat($('f-price').value),
      status: $('f-status').value,
      added: $('f-added').value
    };
  }
  function validate(v) {
    if (!v.title) return 'Please enter the book title.';
    if (!v.author) return 'Please enter the author name.';
    if (!/^[0-9Xx][0-9Xx\- ]{8,18}[0-9Xx]$/.test(v.isbn)) return 'Please enter a valid ISBN (digits and hyphens, 10 to 20 characters).';
    if (!v.category) return 'Please choose a category.';
    if (!(v.year >= 1000 && v.year <= 2100)) return 'Publish year must be between 1000 and 2100.';
    if (!(v.price >= 0)) return 'Price must be a number that is zero or more.';
    if (!v.added) return 'Please choose the date the book was added.';
    return '';
  }
  function friendlyError(e) {
    var m = String((e && e.message) || e);
    if (/UNIQUE constraint failed: books\.isbn/i.test(m)) return 'A book with this ISBN already exists. ISBN must be unique.';
    if (/FOREIGN KEY/i.test(m)) return 'That category does not exist. Pick a category from the list.';
    if (/CHECK constraint/i.test(m)) return 'A value was rejected by the database rules (year, price or status).';
    return 'Database error: ' + m;
  }
  function showFormError(msg) {
    var box = $('formError');
    box.textContent = msg;
    box.hidden = !msg;
  }
  function resetForm() {
    editingId = null;
    $('f-id').value = '';
    ['f-title', 'f-author', 'f-isbn', 'f-year', 'f-price'].forEach(function (id) { $(id).value = ''; });
    $('f-status').value = 'Available';
    $('f-added').value = today();
    if ($('f-category').options.length) $('f-category').selectedIndex = 0;
    $('h-form').textContent = 'Add book';
    $('saveBtn').textContent = 'Save book';
    $('cancelEdit').hidden = true;
    $('formPanel').classList.remove('is-editing');
    showFormError('');
  }
  function startEdit(id) {
    var r = select(Q.one, [id])[0];
    if (!r) return;
    editingId = r.book_id;
    $('f-id').value = r.book_id;
    $('f-title').value = r.title;
    $('f-author').value = r.author;
    $('f-isbn').value = r.isbn;
    $('f-category').value = r.category_id;
    $('f-year').value = r.publish_year;
    $('f-price').value = r.price;
    $('f-status').value = r.status;
    $('f-added').value = r.added_on;
    $('h-form').textContent = 'Edit book #' + r.book_id;
    $('saveBtn').textContent = 'Update book';
    $('cancelEdit').hidden = false;
    $('formPanel').classList.add('is-editing');
    showFormError('');
    renderBooks(true);
    $('formPanel').scrollIntoView({ behavior: 'smooth', block: 'start' });
    $('f-title').focus({ preventScroll: true });
  }
  function saveBook(ev) {
    ev.preventDefault();
    var v = readForm(), problem = validate(v);
    if (problem) { showFormError(problem); return; }
    var params = [v.isbn, v.title, v.author, v.category, v.year, v.price, v.status, v.added];
    try {
      if (editingId !== null) {
        write(Q.update, params.concat([editingId]));
        toast('Book #' + editingId + ' updated.');
      } else {
        write(Q.insert, params);
        var id = select('SELECT last_insert_rowid() AS id;', [], true)[0].id;
        toast('Book saved with ID ' + id + '.');
      }
    } catch (e) {
      showFormError(friendlyError(e));
      return;
    }
    resetForm();
    refreshAll(true);
  }

  /* ---------- delete / reset with confirmation ---------- */
  function confirmBox(title, text, sqlPreview, yesLabel) {
    var dlg = $('confirmDialog');
    $('confirmTitle').textContent = title;
    $('confirmText').textContent = text;
    $('confirmSql').textContent = sqlPreview;
    $('confirmSql').hidden = !sqlPreview;
    $('confirmYes').textContent = yesLabel;
    if (typeof dlg.showModal !== 'function') {
      return Promise.resolve(window.confirm(title + '\n\n' + text));
    }
    return new Promise(function (resolve) {
      dlg.returnValue = '';
      dlg.addEventListener('close', function onClose() {
        dlg.removeEventListener('close', onClose);
        resolve(dlg.returnValue === 'ok');
      });
      dlg.showModal();
    });
  }
  function deleteBook(id) {
    var r = select(Q.one, [id], true)[0];
    if (!r) return;
    confirmBox(
      'Delete this book?',
      '\u201C' + r.title + '\u201D by ' + r.author + ' (ID ' + r.book_id + ') will be permanently removed.',
      inlineParams(Q.del, [id]),
      'Yes, delete'
    ).then(function (ok) {
      if (!ok) return;
      try {
        write(Q.del, [id]);
        if (editingId === id) resetForm();
        toast('Book #' + id + ' deleted.');
        refreshAll(true);
      } catch (e) {
        toast(friendlyError(e), true);
      }
    });
  }
  function resetSample() {
    confirmBox(
      'Reset to sample data?',
      'All changes you made will be replaced by the original 15 sample books.',
      'DROP TABLE books;  DROP TABLE categories;\n-- then re-run library_sqlite.sql',
      'Yes, reset'
    ).then(function (ok) {
      if (!ok) return;
      seedDatabase();
      resetForm();
      $('q').value = ''; $('fStatus').value = 'All'; $('fCategory').value = '';
      refreshAll(false);
      toast('Sample data restored.');
    });
  }

  /* ---------- export ---------- */
  function exportSql() {
    var out = ['-- LibraTrack export, ' + new Date().toISOString(), 'PRAGMA foreign_keys = ON;', '',
               'DROP TABLE IF EXISTS books;', 'DROP TABLE IF EXISTS categories;', ''];
    select("SELECT sql FROM sqlite_master WHERE type IN ('table', 'index') AND sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ORDER BY CASE type WHEN 'table' THEN 0 ELSE 1 END, name;", [], true)
      .forEach(function (r) { out.push(r.sql + ';', ''); });
    [['categories', ['category_id', 'category_name'], 'category_id'],
     ['books', ['book_id', 'isbn', 'title', 'author', 'category_id', 'publish_year', 'price', 'status', 'added_on'], 'book_id']
    ].forEach(function (t) {
      select('SELECT ' + t[1].join(', ') + ' FROM ' + t[0] + ' ORDER BY ' + t[2] + ';', [], true).forEach(function (r) {
        out.push('INSERT INTO ' + t[0] + ' (' + t[1].join(', ') + ') VALUES (' + t[1].map(function (c) { return literal(r[c]); }).join(', ') + ');');
      });
      out.push('');
    });
    var blob = new Blob([out.join('\n')], { type: 'text/plain;charset=utf-8' });
    var a = el('a', { href: URL.createObjectURL(blob), download: 'libratrack_export.sql' });
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
    toast('Exported libratrack_export.sql');
  }

  /* ---------- toast ---------- */
  var toastTimer = null;
  function toast(message, isError) {
    var t = $('toast');
    t.textContent = message;
    t.classList.toggle('is-error', !!isError);
    t.classList.add('is-show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove('is-show'); }, 2600);
  }

  /* ---------- events ---------- */
  function wireEvents() {
    $('bookForm').addEventListener('submit', saveBook);
    $('clearBtn').addEventListener('click', resetForm);
    $('cancelEdit').addEventListener('click', function () { resetForm(); renderBooks(true); });
    $('exportBtn').addEventListener('click', exportSql);
    $('resetBtn').addEventListener('click', resetSample);

    var t = null;
    $('q').addEventListener('input', function () { clearTimeout(t); t = setTimeout(function () { renderBooks(false); }, 160); });
    $('fStatus').addEventListener('change', function () { renderBooks(false); });
    $('fCategory').addEventListener('change', function () { renderShelf(true); renderBooks(false); });

    $('rows').addEventListener('click', function (e) {
      var b = e.target.closest('button[data-act]');
      if (!b) return;
      var id = parseInt(b.getAttribute('data-id'), 10);
      if (b.getAttribute('data-act') === 'edit') startEdit(id); else deleteBook(id);
    });
    $('shelf').addEventListener('click', function (e) {
      var b = e.target.closest('.spine');
      if (!b) return;
      var id = b.getAttribute('data-id'), f = $('fCategory');
      f.value = (f.value === id) ? '' : id;
      renderShelf(true);
      renderBooks(false);
    });
  }

  /* ---------- start ---------- */
  function setEngine(text, cls) {
    $('engineText').textContent = text;
    $('engineBadge').className = 'engine ' + (cls || '');
  }
  function boot() {
    $('boot').classList.remove('is-hidden', 'is-failed');
    $('bootText').textContent = 'Loading SQL engine\u2026';
    var old = document.getElementById('retryBtn');
    if (old) old.remove();
    setEngine('Starting database\u2026');

    initEngine().then(function (mod) {
      SQL = mod;
      var how = openDatabase();
      $('f-added').value = today();
      refreshAll(false);
      resetForm();
      setEngine(how === 'seeded' ? 'SQLite ready, sample data loaded' : 'SQLite ready, saved data restored', 'is-ready');
      $('boot').classList.add('is-hidden');
    }).catch(function (err) {
      console.error(err);
      setEngine('Database engine failed to load', 'is-error');
      var boxEl = $('boot');
      boxEl.classList.add('is-failed');
      $('bootText').textContent = 'The SQL engine could not be downloaded. Check your internet connection and try again.';
      var btn = el('button', { type: 'button', class: 'btn btn--primary', id: 'retryBtn', text: 'Try again' });
      btn.addEventListener('click', boot);
      boxEl.querySelector('.boot__card').appendChild(btn);
    });
  }

  wireEvents();
  boot();
})();
