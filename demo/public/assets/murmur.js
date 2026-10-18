// Shared Murmur page behaviour: like and repost toggles, and the composer's Post button.
(function () {
  'use strict';

  document.addEventListener('click', function (event) {
    var button = event.target.closest('[data-testid="tweet"] > [role="group"] > button');
    if (!button || button.getAttribute('data-testid') === 'reply') return;
    var on = button.classList.toggle('is-on');
    if (/^\d+$/.test(button.textContent)) button.textContent = String(Number(button.textContent) + (on ? 1 : -1));
  });

  var compose = document.querySelector('.m-compose');
  if (!compose) return;
  var text = compose.querySelector('textarea');
  var post = compose.querySelector('button');
  text.addEventListener('input', function () {
    post.disabled = !text.value.trim();
  });
  compose.addEventListener('submit', function (event) {
    event.preventDefault();
    compose.reset();
    post.disabled = true;
  });
})();
