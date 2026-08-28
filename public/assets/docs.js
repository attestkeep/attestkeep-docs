// The only script on the site: it opens the navigation on a narrow screen.
// Everything else is HTML that works with JavaScript switched off.
(function () {
  var button = document.querySelector(".top__menu");
  var sidebar = document.getElementById("sidebar");
  if (!button || !sidebar) return;
  button.addEventListener("click", function () {
    var open = sidebar.classList.toggle("is-open");
    button.setAttribute("aria-expanded", String(open));
  });
})();
