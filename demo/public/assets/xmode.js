// X mode for the Murmur feed: served under /x/…, it behaves like X's timeline so Tacit can be tested
// against the hard parts offline. A virtual list keeps only posts near the viewport in the DOM and
// recycles the rest; clicking a post opens it in place with history.pushState, like X does.
(function () {
  'use strict';
  if (location.pathname.indexOf('/x/') !== 0 && location.pathname !== '/x') return;

  var timeline = document.querySelector('[aria-label="Timeline: Your Home Timeline"]');
  if (!timeline) return;
  var more = document.getElementById('show-more');
  if (more) more.hidden = true;

  var BUFFER = 800;
  var posts = Murmur.all;
  var heights = posts.map(function () { return 190; });
  var index = new Map(posts.map(function (p, i) { return [p.id, i]; }));
  var cells = new Map();
  // Posts change height after they render (folds, images, "show more"); X re-measures them, so do we.
  var resized = new ResizeObserver(function () { requestAnimationFrame(layout); });
  var top = document.createElement('div');
  var list = document.createElement('div');
  var bottom = document.createElement('div');

  function timelineView() {
    timeline.setAttribute('aria-label', 'Timeline: Your Home Timeline');
    timeline.innerHTML = '';
    resized.disconnect();
    cells.clear();
    timeline.append(top, list, bottom);
    layout();
  }

  function cellFor(post) {
    var cell = cells.get(post.id);
    if (cell) return cell;
    cell = document.createElement('div');
    cell.setAttribute('data-testid', 'cellInnerDiv');
    cell.dataset.id = post.id;
    cell.innerHTML = Murmur.render(post);
    cells.set(post.id, cell);
    resized.observe(cell);
    return cell;
  }

  function measure() {
    cells.forEach(function (cell, id) {
      if (cell.isConnected) heights[index.get(id)] = cell.getBoundingClientRect().height;
    });
  }

  function layout() {
    if (!list.isConnected) return;
    measure();
    var origin = timeline.getBoundingClientRect().top + scrollY;
    var from = scrollY - origin - BUFFER;
    var to = scrollY - origin + innerHeight + BUFFER;
    var y = 0;
    var start = 0;
    while (start < posts.length && y + heights[start] < from) y += heights[start++];
    var end = start;
    var y2 = y;
    while (end < posts.length && y2 < to) y2 += heights[end++];
    var keep = new Set(posts.slice(start, end).map(function (p) { return p.id; }));
    cells.forEach(function (cell, id) {
      if (!keep.has(id)) {
        resized.unobserve(cell);
        cell.remove();
        cells.delete(id);
      }
    });
    var prev = null;
    posts.slice(start, end).forEach(function (post) {
      var cell = cellFor(post);
      if (cell.previousSibling !== prev || cell.parentNode !== list) list.insertBefore(cell, prev ? prev.nextSibling : list.firstChild);
      prev = cell;
    });
    measure();
    var rest = 0;
    for (var j = end; j < posts.length; j++) rest += heights[j];
    top.style.height = y + 'px';
    bottom.style.height = rest + 'px';
  }

  function statusView(id) {
    var post = Murmur.find(id);
    if (!post) return timelineView();
    timeline.setAttribute('aria-label', 'Timeline: Conversation');
    timeline.innerHTML = [post].concat(Murmur.repliesFor(post)).map(function (p) {
      return '<div data-testid="cellInnerDiv">' + Murmur.render(p) + '</div>';
    }).join('');
    scrollTo(0, 0);
  }

  function route() {
    var m = location.pathname.match(/^\/x\/[^/]+\/status\/([\w-]+)/);
    if (m) statusView(m[1]);
    else timelineView();
  }

  timeline.addEventListener('click', function (e) {
    var article = e.target.closest('article[data-testid="tweet"]');
    if (!article || e.target.closest('a, button')) return;
    var link = article.querySelector('a[href*="status"]');
    var id = link && (link.getAttribute('href').match(/[?&]id=([\w-]+)/) || [])[1];
    var post = id && Murmur.find(id);
    if (!post) return;
    history.pushState({}, '', '/x/' + post.user + '/status/' + post.id);
    route();
  });
  addEventListener('popstate', route);
  addEventListener('scroll', function () { requestAnimationFrame(layout); }, { passive: true });
  addEventListener('resize', function () { requestAnimationFrame(layout); });
  route();
})();
