jQuery(document).ready(function($) {
  $('.level-bar-inner').css('width', '0');
  $(window).on('load', function() {
    $('.level-bar-inner').each(function() {
      var itemwidth = $(this).data('level');
      $(this).animate({
        width: itemwidth
      }, 800);
    });
  });
});