(function () {

  $.ajax({
    url: 'graph'
  }).done(function (json) {
    console.log(json);
  }).fail(function () {
    console.log('failed');
  });

})();